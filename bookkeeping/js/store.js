/* n0va Books · store.js
 * One data API over three places the books can live:
 *   cloud  — the claude.ai artifact database (when the app is opened as a hosted artifact)
 *   local  — IndexedDB in this browser (self-hosted or opened from disk)
 *   memory — nothing persists (storage blocked); the app says so and nudges toward a backup
 * Every record carries its own `id`. Screens read from the in-memory maps; writes update
 * the maps first, then persist. Receipt photos live beside the records: in IndexedDB, or
 * in the artifact's asset storage when hosted. */
(function (NB) {
  'use strict';
  const { clone, uid, Dates } = NB.util;

  const COLLS = ['customers', 'estimates', 'invoices', 'payments', 'expenses', 'mileage', 'meta'];
  const RECORD_COLLS = ['customers', 'estimates', 'invoices', 'payments', 'expenses', 'mileage'];
  const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

  // Square's US Free-plan card rates as of January 2026. Editable in Settings.
  const DEFAULT_METHODS = [
    { id: 'square-in-person', name: 'Square card · in person', feePercent: 2.6, feeFixed: 15, feeMin: 0 },
    { id: 'square-online', name: 'Square card · online or invoice', feePercent: 3.3, feeFixed: 30, feeMin: 0 },
    { id: 'square-keyed', name: 'Square card · keyed in', feePercent: 3.5, feeFixed: 15, feeMin: 0 },
    { id: 'square-ach', name: 'Square bank transfer (ACH)', feePercent: 1, feeFixed: 0, feeMin: 100 },
    { id: 'cash', name: 'Cash', feePercent: 0, feeFixed: 0, feeMin: 0 },
    { id: 'check', name: 'Check', feePercent: 0, feeFixed: 0, feeMin: 0 },
    { id: 'other', name: 'Other (Venmo, PayPal, Zelle)', feePercent: 0, feeFixed: 0, feeMin: 0 },
  ];

  // Starting sales tax profiles. Rates depend on where the sale happens, so these are
  // meant to be edited.
  const DEFAULT_TAX_PROFILES = [
    { id: 'oregon', name: 'Oregon (no sales tax)', rate: 0, taxShipping: false,
      note: 'Oregon has no state or local sales tax.' },
    { id: 'arizona', name: 'Arizona (state rate only)', rate: 5.6, taxShipping: false,
      note: 'Arizona’s state rate is 5.6%. Counties and cities add their own, so the full rate is higher (about 8.7% in Tucson). Look up the rate where you sell and update this profile.' },
  ];

  const DEFAULT_SETTINGS = {
    id: 'settings',
    business: { name: 'n0va crafts & creations', owner: '', email: '', phone: '', website: '', social: '', address: '', taxId: '' },
    brand: { logoMode: 'wordmark', color: '#c83672', footer: 'Thank you for supporting handmade ✦' },
    docs: {
      currency: 'USD',
      locale: '',
      paper: 'letter',
      invoiceDays: 14,
      estimateDays: 30,
      taxLabel: 'Sales tax',
      defaultTaxProfileId: '',
      depositPercent: 50,
      estimateNotes: 'Each piece is handmade to order, so small variations are part of its charm. Reply to approve this estimate and I will get started as soon as the deposit arrives.',
      invoiceNotes: 'Thank you for your order! Payment is due by the date above.',
      paymentInstructions: 'Pay online by card with the Square link on this invoice, or in person by card or cash.',
      paymentLink: '',
      receiptNote: 'Card payments are processed securely by Square. Keep this receipt for your records.',
    },
    numbering: {
      pad: 4,
      estimate: { prefix: 'EST-', start: 1 },
      invoice: { prefix: 'INV-', start: 1 },
      receipt: { prefix: 'RCT-', start: 1 },
    },
    paymentMethods: DEFAULT_METHODS,
    taxProfiles: DEFAULT_TAX_PROFILES,
    mileageRates: NB.tax ? NB.tax.MILEAGE_RATES : [],
  };

  // Which collection and field hold each kind of number.
  const NUMBERED = {
    estimate: { coll: 'estimates', seq: 'seq', num: 'number' },
    invoice: { coll: 'invoices', seq: 'seq', num: 'number' },
    receipt: { coll: 'payments', seq: 'receiptSeq', num: 'receiptNumber' },
  };

  function isObj(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }

  function deepMerge(base, over) {
    const out = clone(base);
    if (!isObj(over)) return out;
    for (const k of Object.keys(over)) {
      const v = over[k];
      if (v === undefined) continue;
      out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : clone(v);
    }
    return out;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function withTimeout(promise, ms, fallback) {
    return Promise.race([promise, sleep(ms).then(() => fallback)]);
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('A receipt file could not be read.'));
      r.readAsDataURL(blob);
    });
  }

  function dataURLToBlob(dataUrl) {
    const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl || '');
    if (!m) throw new Error('The backup has a damaged receipt file.');
    const type = m[1] || 'application/octet-stream';
    if (!m[2]) return new Blob([decodeURIComponent(m[3])], { type });
    const bin = atob(m[3]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type });
  }

  // ------------------------------------------------------------- backends

  function memoryBackend() {
    const blobs = new Map();
    return {
      kind: 'memory',
      async start() {},
      async put() {},
      async remove() {},
      files: {
        async put(blob, name) {
          const id = uid();
          blobs.set(id, blob);
          return { id, name, type: blob.type, size: blob.size };
        },
        async get(id) { return blobs.get(id) || null; },
        async remove(id) { blobs.delete(id); },
        async clear() { blobs.clear(); },
      },
    };
  }

  async function localBackend() {
    if (!globalThis.indexedDB) throw new Error('IndexedDB is not available');
    const db = await new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open('n0va-books', 2); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        COLLS.concat(['files']).forEach((c) => { if (!d.objectStoreNames.contains(c)) d.createObjectStore(c, { keyPath: 'id' }); });
      };
      req.onsuccess = () => {
        const d = req.result;
        d.onversionchange = () => d.close(); // let a newer tab upgrade
        resolve(d);
      };
      req.onerror = () => reject(req.error || new Error('Could not open the database'));
      req.onblocked = () => reject(new Error('n0va Books is open in another tab with an older version. Close that tab and reload.'));
    });
    const result = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const finished = (tx) => new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error || new Error('Write cancelled'));
    });
    const readAll = (c) => result(db.transaction(c, 'readonly').objectStore(c).getAll());
    let channel = null;
    try { channel = new BroadcastChannel('n0va-books'); } catch (e) { /* older browser: no cross-tab refresh */ }

    return {
      kind: 'local',
      async start(onDocs) {
        for (const c of COLLS) onDocs(c, await readAll(c), true);
        // Another tab changed something: reload that collection.
        if (channel) channel.onmessage = async (e) => {
          const c = e.data && e.data.c;
          if (COLLS.includes(c)) onDocs(c, await readAll(c), true);
        };
        try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* best effort */ }
      },
      async put(c, rec) {
        const tx = db.transaction(c, 'readwrite');
        tx.objectStore(c).put(rec);
        await finished(tx);
        if (channel) channel.postMessage({ c });
      },
      async remove(c, id) {
        const tx = db.transaction(c, 'readwrite');
        tx.objectStore(c).delete(id);
        await finished(tx);
        if (channel) channel.postMessage({ c });
      },
      // Receipt files as raw bytes (more portable across browsers than stored Blobs).
      files: {
        async put(blob, name) {
          const id = uid();
          const data = await blob.arrayBuffer();
          const tx = db.transaction('files', 'readwrite');
          tx.objectStore('files').put({ id, name, type: blob.type, size: blob.size, data, createdAt: new Date().toISOString() });
          await finished(tx);
          return { id, name, type: blob.type, size: blob.size };
        },
        async get(id) {
          const rec = await result(db.transaction('files', 'readonly').objectStore('files').get(id));
          return rec ? new Blob([rec.data], { type: rec.type }) : null;
        },
        async remove(id) {
          const tx = db.transaction('files', 'readwrite');
          tx.objectStore('files').delete(id);
          await finished(tx);
        },
        async clear() {
          const tx = db.transaction('files', 'readwrite');
          tx.objectStore('files').clear();
          await finished(tx);
        },
      },
    };
  }

  function assetError(e) {
    const code = e && e.code;
    if (code === 'too_large') return 'That file is too large. Receipts can be up to 20 MB.';
    if (code === 'unsupported_type') return 'Use a photo (JPG, PNG, WebP) or a PDF.';
    if (code === 'quota_or_state') return 'File storage for these books is full. Remove some old receipt photos and try again.';
    if (code === 'rate_limited') return 'Too many uploads at once. Wait a moment and try again.';
    if (code === 'upstream_auth') return 'Your sign-in expired. Reload the page and try again.';
    return (e && e.message) || 'The receipt could not be saved.';
  }

  function cloudBackend(db, assets) {
    const chains = new Map(); // one write at a time per document
    const queue = (path, fn) => {
      const prev = chains.get(path) || Promise.resolve();
      const next = prev.catch(() => {}).then(fn);
      chains.set(path, next);
      next.finally(() => { if (chains.get(path) === next) chains.delete(path); }).catch(() => {});
      return next;
    };
    const retry = async (fn) => {
      try { return await fn(); } catch (e) {
        if (e && (e.code === 'unavailable' || e.code === 'resource_exhausted' || e.code === 'store_unavailable')) {
          await sleep(400 + Math.random() * 800);
          return fn();
        }
        throw e;
      }
    };
    return {
      kind: 'cloud',
      start(onDocs, onError) {
        return new Promise((resolve) => {
          const waiting = new Set(COLLS);
          const done = () => { clearTimeout(timer); resolve(); };
          const timer = setTimeout(resolve, 10000);
          COLLS.forEach((c) => {
            db.collection(c).onSnapshot(
              (snap) => {
                const docs = snap.docs.filter((d) => d.exists).map((d) => Object.assign({}, d.data(), { id: d.id }));
                const definitive = !snap.metadata.fromCache;
                onDocs(c, docs, definitive);
                if (definitive && waiting.delete(c) && waiting.size === 0) done();
              },
              (err) => {
                onError(err);
                if (waiting.delete(c) && waiting.size === 0) done();
              }
            );
          });
        });
      },
      put(c, rec) {
        return queue(c + '/' + rec.id, () => retry(() => db.collection(c).doc(rec.id).set(rec)));
      },
      remove(c, id) {
        return queue(c + '/' + id, () => retry(() => db.collection(c).doc(id).delete()));
      },
      // Saved receipts show in every view; adding or deleting them needs `assets`,
      // which only the books' editors get.
      files: {
        put: assets ? async (blob, name) => {
          try {
            const r = await retry(() => assets.upload(blob, blob.type ? { type: blob.type } : undefined));
            return { id: r.id, name, type: r.contentType, size: r.sizeBytes };
          } catch (e) {
            throw new Error(assetError(e));
          }
        } : null,
        async get(id) {
          const res = await fetch('/_blob/' + id);
          return res.ok ? res.blob() : null;
        },
        url(id) {
          return '/_blob/' + id;
        },
        remove: assets ? async (id) => { await retry(() => assets.delete(id)); } : null,
      },
    };
  }

  // ------------------------------------------------------------- the store

  const maps = {};
  COLLS.forEach((c) => { maps[c] = new Map(); });
  const loaded = {};
  const listeners = new Set();
  let backend = null;
  let version = 0;
  let settingsCache = null;
  let settingsVersion = -1;
  let emitQueued = false;

  const store = {
    ready: false,
    mode: null,          // 'cloud' | 'local' | 'memory'
    notice: null,        // why we fell back, when we did
    saving: 0,
    lastError: null,
    readOnly: false,
    DEFAULT_METHODS,
    DEFAULT_SETTINGS,
    DEFAULT_TAX_PROFILES,
  };

  function emit() {
    if (emitQueued) return;
    emitQueued = true;
    setTimeout(() => {
      emitQueued = false;
      listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    }, 0);
  }

  function onDocs(c, docs, definitive) {
    maps[c] = new Map(docs.filter((d) => d && d.id).map((d) => [d.id, d]));
    if (definitive) loaded[c] = true;
    version += 1;
    emit();
  }

  function onBackendError(err) {
    store.lastError = describeError(err);
    if (err && (err.code === 'revoked' || err.code === 'not_granted')) store.readOnly = true;
    emit();
  }

  function describeError(e) {
    const code = e && e.code;
    if (code === 'quota_exceeded') return 'Your hosted books are full. Download a backup, then remove sample data or old records to make room.';
    if (code === 'invalid_argument') return "This change couldn't be saved. You may not have permission to edit these books, or one record is too large.";
    if (code === 'revoked' || code === 'not_granted') return 'This window no longer has access to the books. Reload the page.';
    if (code === 'unavailable' || code === 'resource_exhausted') return 'The connection is busy. Wait a moment and try again.';
    if (e && e.name === 'QuotaExceededError') return 'This browser is out of storage space for your books. Download a backup and free up space.';
    return (e && e.message) || 'Something went wrong while saving.';
  }

  store.describeError = describeError;

  store.init = async function init() {
    const claude = globalThis.window && window.claude;
    if (claude && typeof claude.use === 'function') {
      const db = await withTimeout(claude.use('db').catch(() => null), 12000, null);
      if (db) {
        const assets = await withTimeout(claude.use('assets').catch(() => null), 8000, null);
        backend = cloudBackend(db, assets);
      } else {
        store.notice = 'cloud-unavailable';
      }
    }
    if (!backend) {
      try { backend = await localBackend(); } catch (e) {
        console.warn('Falling back to memory storage:', e);
        backend = memoryBackend();
        store.notice = store.notice || 'no-storage';
      }
    }
    store.mode = backend.kind;
    await backend.start(onDocs, onBackendError);
    COLLS.forEach((c) => { if (backend.kind !== 'cloud') loaded[c] = true; });
    store.ready = true;
    version += 1;
    emit();
  };

  store.onChange = function (fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  store.whenLoaded = async function () {
    for (let i = 0; i < 50 && COLLS.some((c) => !loaded[c]); i++) await sleep(200);
  };

  store.all = (c) => Array.from(maps[c].values());
  store.get = (c, id) => (id ? maps[c].get(id) : undefined);
  store.snapshot = () => ({
    customers: store.all('customers'),
    estimates: store.all('estimates'),
    invoices: store.all('invoices'),
    payments: store.all('payments'),
    expenses: store.all('expenses'),
    mileage: store.all('mileage'),
  });
  store.isEmpty = () => RECORD_COLLS.every((c) => maps[c].size === 0);

  async function write(c, rec) {
    maps[c].set(rec.id, rec);
    version += 1;
    store.saving += 1;
    emit();
    try {
      await backend.put(c, rec);
      store.lastError = null;
    } catch (e) {
      store.lastError = describeError(e);
      throw new Error(store.lastError);
    } finally {
      store.saving -= 1;
      emit();
    }
    return rec;
  }

  async function erase(c, id) {
    maps[c].delete(id);
    version += 1;
    store.saving += 1;
    emit();
    try {
      await backend.remove(c, id);
    } catch (e) {
      store.lastError = describeError(e);
      throw new Error(store.lastError);
    } finally {
      store.saving -= 1;
      emit();
    }
  }

  // Save a record (creates an id when missing) and stamp it.
  store.save = function (c, obj) {
    const now = new Date().toISOString();
    const rec = clone(obj);
    if (!rec.id) rec.id = uid();
    rec.createdAt = rec.createdAt || now;
    rec.updatedAt = now;
    return write(c, rec);
  };

  store.remove = (c, id) => erase(c, id);

  // Run many writes with a little concurrency; reports progress.
  async function bulk(ops, onProgress) {
    let done = 0;
    let i = 0;
    const errors = [];
    const worker = async () => {
      while (i < ops.length) {
        const op = ops[i++];
        try { await op(); } catch (e) { errors.push(e); }
        done += 1;
        if (onProgress) onProgress(done, ops.length);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (errors.length) throw errors[0];
  }

  // ------------------------------------------------------------- receipt files

  const objectUrls = new Map();

  const readable = () => !!(backend && backend.files);

  store.files = {
    // Whether receipts can be added here (showing saved ones may still work without it).
    available: () => !!(backend && backend.files && backend.files.put),
    // Stores a file; resolves {id, name, type, size} to keep on the record.
    async add(blob, name) {
      if (!store.files.available()) throw new Error('Receipt files can’t be stored in this window.');
      store.saving += 1;
      emit();
      try {
        return await backend.files.put(blob, name || 'receipt');
      } finally {
        store.saving -= 1;
        emit();
      }
    },
    // A URL an <img> or link can use (hosted: the asset path; otherwise an object URL).
    async url(id) {
      if (!readable() || !id) return null;
      if (backend.files.url) return backend.files.url(id);
      if (objectUrls.has(id)) return objectUrls.get(id);
      const blob = await backend.files.get(id);
      if (!blob) return null;
      const u = URL.createObjectURL(blob);
      objectUrls.set(id, u);
      return u;
    },
    async blob(id) {
      return readable() && id ? backend.files.get(id) : null;
    },
    async remove(id) {
      if (!readable() || !backend.files.remove || !id) return;
      try { await backend.files.remove(id); } catch (e) { console.warn('Receipt file not removed', e); }
      if (objectUrls.has(id)) { URL.revokeObjectURL(objectUrls.get(id)); objectUrls.delete(id); }
    },
  };

  const receiptIds = (list) => {
    const ids = new Set();
    (list || []).forEach((e) => (e.receipts || []).forEach((r) => r && r.id && ids.add(r.id)));
    return ids;
  };

  // Deletes an expense together with its receipt files.
  store.removeExpense = async function (e) {
    await erase('expenses', e.id);
    for (const r of e.receipts || []) await store.files.remove(r.id);
  };

  // ------------------------------------------------------------- settings

  // Some systems report tags like "en-US@posix" that Intl rejects; fall back to US English.
  function usableLocale(tag) {
    const candidates = [tag, String(tag || '').split(/[@.]/)[0]];
    for (const c of candidates) {
      try {
        if (c && Intl.NumberFormat.supportedLocalesOf([c]).length) return c;
      } catch (e) { /* invalid tag */ }
    }
    return 'en-US';
  }

  store.settings = function () {
    if (settingsCache && settingsVersion === version) return settingsCache;
    const saved = maps.meta.get('settings');
    const merged = deepMerge(DEFAULT_SETTINGS, saved || {});
    if (!Array.isArray(merged.paymentMethods) || !merged.paymentMethods.length) merged.paymentMethods = clone(DEFAULT_METHODS);
    if (!Array.isArray(merged.mileageRates) || !merged.mileageRates.length) merged.mileageRates = clone(DEFAULT_SETTINGS.mileageRates);
    // Books from before tax profiles kept one default rate: keep it as a profile.
    if (!saved || !Array.isArray(saved.taxProfiles)) {
      const oldRate = saved && saved.docs && Number(saved.docs.taxRate);
      if (oldRate > 0) {
        merged.taxProfiles = [{ id: 'default-rate', name: saved.docs.taxLabel || 'Sales tax', rate: oldRate, taxShipping: !!saved.docs.taxShipping, note: '' }]
          .concat(clone(DEFAULT_TAX_PROFILES));
        if (!saved.docs.defaultTaxProfileId) merged.docs.defaultTaxProfileId = 'default-rate';
      }
    }
    if (!Array.isArray(merged.taxProfiles)) merged.taxProfiles = clone(DEFAULT_TAX_PROFILES);
    merged.docs.locale = usableLocale(merged.docs.locale || (globalThis.navigator && navigator.language));
    settingsCache = merged;
    settingsVersion = version;
    return merged;
  };

  store.hasSavedSettings = () => maps.meta.has('settings');

  store.saveSettings = function (patch) {
    const saved = maps.meta.get('settings') || { id: 'settings' };
    const next = deepMerge(saved, patch);
    next.id = 'settings';
    ['paymentMethods', 'taxProfiles', 'mileageRates'].forEach((k) => {
      if (patch && Array.isArray(patch[k])) next[k] = clone(patch[k]);
    });
    return store.save('meta', next);
  };

  store.method = function (id) {
    return store.settings().paymentMethods.find((m) => m.id === id) || null;
  };

  store.taxProfile = function (id) {
    return id ? store.settings().taxProfiles.find((p) => p.id === id) || null : null;
  };

  // Per-year figures for the tax summary (inventory counts, home studio).
  store.taxYearInputs = (year) => maps.meta.get('taxyear-' + year) || {};
  store.saveTaxYearInputs = (year, values) => store.save('meta', Object.assign({}, store.taxYearInputs(year), values, { id: 'taxyear-' + year }));

  // ------------------------------------------------------------- logo

  store.logo = () => maps.meta.get('logo') || null;
  store.setLogo = (logo) => (logo ? store.save('meta', Object.assign({ id: 'logo' }, logo)) : erase('meta', 'logo'));

  // ------------------------------------------------------------- numbering

  function formatNumber(prefix, seq, pad) {
    return (prefix || '') + String(seq).padStart(Math.max(1, pad || 1), '0');
  }

  function maxSeq(kind) {
    const n = NUMBERED[kind];
    let max = 0;
    for (const d of maps[n.coll].values()) if ((d[n.seq] || 0) > max) max = d[n.seq];
    return max;
  }

  // The next free number. Never reuses one that a record or the counter has seen.
  store.peekNumber = function (kind) {
    const s = store.settings();
    const cfg = s.numbering[kind] || {};
    const counters = maps.meta.get('counters') || {};
    const seq = Math.max(counters[kind] || 0, maxSeq(kind), (Number(cfg.start) || 1) - 1) + 1;
    return { seq, number: formatNumber(cfg.prefix, seq, s.numbering.pad) };
  };

  // Called when a numbered record is first saved.
  store.claimNumber = async function (kind, seq) {
    const counters = Object.assign({ id: 'counters' }, maps.meta.get('counters') || {});
    if ((counters[kind] || 0) >= seq) return;
    counters[kind] = seq;
    await store.save('meta', counters);
  };

  store.numberTaken = function (kind, number, exceptId) {
    const n = NUMBERED[kind];
    for (const d of maps[n.coll].values()) if (d.id !== exceptId && d[n.num] === number) return true;
    return false;
  };

  // Pull the sequence out of a hand-edited number like "INV-0042".
  store.seqFromNumber = function (kind, number) {
    const prefix = (store.settings().numbering[kind] || {}).prefix || '';
    if (prefix && !String(number).startsWith(prefix)) return 0;
    const digits = String(number).slice(prefix.length);
    return /^\d+$/.test(digits) ? parseInt(digits, 10) : 0;
  };

  async function resetCounters() {
    const counters = { id: 'counters' };
    Object.keys(NUMBERED).forEach((k) => { counters[k] = maxSeq(k); });
    await store.save('meta', counters);
  }

  // ------------------------------------------------------------- sample data

  store.hasSample = () => RECORD_COLLS.some((c) => store.all(c).some((d) => d.sample));

  store.loadSample = async function (onProgress) {
    const sample = NB.sample.build(Dates.today(), store.settings());
    const ops = [];
    RECORD_COLLS.forEach((c) => (sample[c] || []).forEach((rec) => ops.push(() => store.save(c, rec))));
    await bulk(ops, onProgress);
    const counters = Object.assign({ id: 'counters' }, maps.meta.get('counters') || {});
    Object.keys(NUMBERED).forEach((k) => { counters[k] = Math.max(counters[k] || 0, maxSeq(k)); });
    await store.save('meta', counters);
  };

  store.clearSample = async function (onProgress) {
    const ops = [];
    RECORD_COLLS.forEach((c) => store.all(c).filter((d) => d.sample).forEach((d) => {
      ops.push(() => (c === 'expenses' ? store.removeExpense(d) : erase(c, d.id)));
    }));
    await bulk(ops, onProgress);
    await resetCounters();
  };

  // ------------------------------------------------------------- backup

  // Everything in one object; receipt files ride along as data URLs.
  store.exportData = async function () {
    const data = {};
    COLLS.forEach((c) => { data[c] = store.all(c); });
    const files = [];
    for (const id of receiptIds(data.expenses)) {
      const blob = await store.files.blob(id).catch(() => null);
      if (blob) files.push({ id, type: blob.type, dataUrl: await blobToDataURL(blob) });
    }
    return { app: 'n0va-books', format: 2, exportedAt: new Date().toISOString(), data, files };
  };

  store.readBackup = function (json) {
    if (!json || json.app !== 'n0va-books' || !isObj(json.data)) throw new Error("This file isn't an n0va Books backup.");
    const counts = {};
    COLLS.forEach((c) => {
      const list = json.data[c] || [];
      if (!Array.isArray(list)) throw new Error('The backup is damaged: "' + c + '" is not a list.');
      list.forEach((d) => {
        if (!isObj(d) || typeof d.id !== 'string' || !ID_RE.test(d.id) || d.id === '.' || d.id === '..') {
          throw new Error('The backup is damaged: a record in "' + c + '" has no usable id.');
        }
      });
      counts[c] = list.length;
    });
    const files = json.files || [];
    if (!Array.isArray(files) || files.some((f) => !isObj(f) || typeof f.id !== 'string' || !/^data:/.test(f.dataUrl || ''))) {
      throw new Error('The backup is damaged: its receipt files are unreadable.');
    }
    counts.files = files.length;
    return counts;
  };

  // Replace everything with the backup's contents. Resolves how many receipt files
  // couldn't be stored here (their expenses are restored without them).
  store.importData = async function (json, onProgress) {
    store.readBackup(json);
    const current = receiptIds(store.all('expenses'));
    // Receipt files: keep ones already here, store the rest and note their new ids.
    const idMap = new Map();
    let missingFiles = 0;
    for (const f of json.files || []) {
      if (current.has(f.id)) { idMap.set(f.id, f.id); continue; }
      try {
        const saved = await store.files.add(dataURLToBlob(f.dataUrl), 'receipt');
        idMap.set(f.id, saved.id);
      } catch (e) {
        console.warn('Receipt file not restored', e);
        missingFiles += 1;
      }
    }
    const incoming = {};
    COLLS.forEach((c) => { incoming[c] = (json.data[c] || []).map(clone); });
    incoming.expenses.forEach((e) => {
      e.receipts = (e.receipts || [])
        .filter((r) => r && (idMap.has(r.id) || current.has(r.id)))
        .map((r) => Object.assign(r, { id: idMap.get(r.id) || r.id }));
    });
    const ops = [];
    COLLS.forEach((c) => {
      const keep = new Set(incoming[c].map((d) => d.id));
      store.all(c).forEach((d) => { if (!keep.has(d.id)) ops.push(() => erase(c, d.id)); });
      incoming[c].forEach((d) => ops.push(() => write(c, d)));
    });
    await bulk(ops, onProgress);
    // Files nothing points at any more.
    const still = receiptIds(incoming.expenses);
    for (const id of current) if (!still.has(id)) await store.files.remove(id);
    return { missingFiles };
  };

  store.eraseAll = async function (onProgress) {
    const files = receiptIds(store.all('expenses'));
    const ops = [];
    COLLS.forEach((c) => store.all(c).forEach((d) => ops.push(() => erase(c, d.id))));
    await bulk(ops, onProgress);
    for (const id of files) await store.files.remove(id);
    if (backend.files && backend.files.clear) await backend.files.clear();
  };

  NB.store = store;
})(window.NB = window.NB || {});
