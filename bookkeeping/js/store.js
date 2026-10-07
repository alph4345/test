/* n0va Books · store.js
 * One data API over three places the books can live:
 *   cloud  — the claude.ai artifact database (when the app is opened as a hosted artifact)
 *   local  — IndexedDB in this browser (self-hosted or opened from disk)
 *   memory — nothing persists (storage blocked); the app says so and nudges toward a backup
 * Every record carries its own `id`. Screens read from the in-memory maps; writes update
 * the maps first, then persist. */
(function (NB) {
  'use strict';
  const { clone, uid, Dates } = NB.util;

  const COLLS = ['customers', 'estimates', 'invoices', 'payments', 'meta'];
  const RECORD_COLLS = ['customers', 'estimates', 'invoices', 'payments'];
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
      taxRate: 0,
      taxLabel: 'Sales tax',
      taxShipping: false,
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

  // ------------------------------------------------------------- backends

  function memoryBackend() {
    return {
      kind: 'memory',
      async start() {},
      async put() {},
      async remove() {},
    };
  }

  async function localBackend() {
    if (!globalThis.indexedDB) throw new Error('IndexedDB is not available');
    const db = await new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open('n0va-books', 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        COLLS.forEach((c) => { if (!d.objectStoreNames.contains(c)) d.createObjectStore(c, { keyPath: 'id' }); });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Could not open the database'));
      req.onblocked = () => reject(new Error('The database is open in an older tab'));
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
    };
  }

  function cloudBackend(db) {
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
        if (e && (e.code === 'unavailable' || e.code === 'resource_exhausted')) {
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
      if (db) backend = cloudBackend(db);
      else store.notice = 'cloud-unavailable';
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
    if (patch && Array.isArray(patch.paymentMethods)) next.paymentMethods = clone(patch.paymentMethods);
    return store.save('meta', next);
  };

  store.method = function (id) {
    return store.settings().paymentMethods.find((m) => m.id === id) || null;
  };

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
    RECORD_COLLS.forEach((c) => sample[c].forEach((rec) => ops.push(() => store.save(c, rec))));
    await bulk(ops, onProgress);
    const counters = Object.assign({ id: 'counters' }, maps.meta.get('counters') || {});
    Object.keys(NUMBERED).forEach((k) => { counters[k] = Math.max(counters[k] || 0, maxSeq(k)); });
    await store.save('meta', counters);
  };

  store.clearSample = async function (onProgress) {
    const ops = [];
    RECORD_COLLS.forEach((c) => store.all(c).filter((d) => d.sample).forEach((d) => ops.push(() => erase(c, d.id))));
    await bulk(ops, onProgress);
    await resetCounters();
  };

  // ------------------------------------------------------------- backup

  store.exportData = function () {
    const data = {};
    COLLS.forEach((c) => { data[c] = store.all(c); });
    return { app: 'n0va-books', format: 1, exportedAt: new Date().toISOString(), data };
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
    return counts;
  };

  // Replace everything with the backup's contents.
  store.importData = async function (json, onProgress) {
    store.readBackup(json);
    const ops = [];
    COLLS.forEach((c) => {
      const incoming = json.data[c] || [];
      const keep = new Set(incoming.map((d) => d.id));
      store.all(c).forEach((d) => { if (!keep.has(d.id)) ops.push(() => erase(c, d.id)); });
      incoming.forEach((d) => ops.push(() => write(c, clone(d))));
    });
    await bulk(ops, onProgress);
  };

  store.eraseAll = async function (onProgress) {
    const ops = [];
    COLLS.forEach((c) => store.all(c).forEach((d) => ops.push(() => erase(c, d.id))));
    await bulk(ops, onProgress);
  };

  NB.store = store;
})(window.NB = window.NB || {});
