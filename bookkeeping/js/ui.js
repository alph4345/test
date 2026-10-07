/* n0va Books · ui.js
 * Small UI toolkit: an auto-escaping html`` template, icons, formatting with the
 * business's currency and locale, toasts, in-page dialogs (the hosted viewer blocks
 * alert/confirm), clipboard and file saving. */
(function (NB) {
  'use strict';
  const { Money, Dates, fmtQty } = NB.util;

  // ---------------------------------------------------------------- environment
  const framed = (() => { try { return window.top !== window.self; } catch (e) { return true; } })();
  const hosted = !!(window.claude && typeof window.claude.use === 'function');
  let downloadsPromise = null;

  NB.env = {
    hosted,
    framed,
    // The claude.ai viewer ignores window.print(); a normal browser tab does not.
    canPrint: !(hosted && framed),
    downloads() {
      if (!hosted) return Promise.resolve(null);
      if (!downloadsPromise) downloadsPromise = window.claude.use('downloads').catch(() => null);
      return downloadsPromise;
    },
  };

  // ---------------------------------------------------------------- templates
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
  }
  function Raw(s) { this.s = s; }
  Raw.prototype.toString = function () { return this.s; };
  const raw = (s) => new Raw(String(s));
  function out(v) {
    if (v instanceof Raw) return v.s;
    if (Array.isArray(v)) return v.map(out).join('');
    if (v === false || v === null || v === undefined) return '';
    return esc(v);
  }
  function html(strings) {
    let s = strings[0];
    for (let i = 1; i < strings.length; i++) s += out(arguments[i]) + strings[i];
    return new Raw(s);
  }

  // ---------------------------------------------------------------- formatting
  const fmt = {
    money(minor) {
      const s = NB.store.settings();
      return Money.format(minor, s.docs.currency, s.docs.locale);
    },
    date(iso, opts) {
      return Dates.format(iso, NB.store.settings().docs.locale, opts);
    },
    dateLong(iso) {
      return Dates.format(iso, NB.store.settings().docs.locale, { weekday: 'long', month: 'long', day: 'numeric' });
    },
    qty(q) {
      return fmtQty(q, NB.store.settings().docs.locale);
    },
    // For inputs: no grouping, so the value reads back the same ("1000", "1.5").
    qtyInput(q) {
      return String(Number((Number(q) || 0).toFixed(3)));
    },
    input(minor) {
      return Money.toInput(minor, NB.store.settings().docs.currency);
    },
    parse(text) {
      return Money.parse(text, NB.store.settings().docs.currency);
    },
    symbol() {
      const s = NB.store.settings();
      try {
        const part = new Intl.NumberFormat(s.docs.locale, { style: 'currency', currency: s.docs.currency })
          .formatToParts(0).find((p) => p.type === 'currency');
        return part ? part.value : s.docs.currency;
      } catch (e) {
        return '$';
      }
    },
    // "in 3 days", "today", "5 days ago"
    relative(days) {
      if (days === 0) return 'today';
      if (days === 1) return 'tomorrow';
      if (days === -1) return 'yesterday';
      return days > 0 ? 'in ' + days + ' days' : Math.abs(days) + ' days ago';
    },
  };

  // Quantities and percentages as typed ("1,5", "2.25", "1,000"); anything unreadable is 0.
  function num(text) {
    const n = NB.util.parseDecimal(text);
    return isFinite(n) ? n : 0;
  }

  // Per-device conveniences (last backup date). Storage can be missing or blocked.
  const prefs = {
    get(k) {
      try { return localStorage.getItem('n0va-books:' + k); } catch (e) { return null; }
    },
    set(k, v) {
      try { localStorage.setItem('n0va-books:' + k, v); } catch (e) { /* not available */ }
    },
  };

  // ---------------------------------------------------------------- icons
  const ICONS = {
    spark: '<path d="M12 3c.7 4.7 2.3 6.3 7 7-4.7.7-6.3 2.3-7 7-.7-4.7-2.3-6.3-7-7 4.7-.7 6.3-2.3 7-7Z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4"/><path d="M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/>',
    estimate: '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5"/><path d="M8.5 13h7M8.5 17h4"/>',
    invoice: '<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    payment: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',
    settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    next: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    send: '<path d="M21 3 10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 7 8.5-7"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.5A3.8 3.8 0 0 1 17.5 18z"/>',
    device: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
    alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>',
    ban: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    receipt: '<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="m9 11.5 2 2 4-4.5"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  };

  function icon(name, cls) {
    return raw(
      '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>'
    );
  }

  // ---------------------------------------------------------------- bits
  function pill(key, label) {
    return html`<span class="pill pill-${key}">${label}</span>`;
  }

  function avatar(name, cls) {
    return html`<span class="avatar ${cls || ''}" aria-hidden="true">${NB.util.initials(name)}</span>`;
  }

  // In-app link. Self-hosted builds get a real #hash so links open in new tabs.
  // Params ride along as data-* attributes: invoiceId -> data-invoice-id -> dataset.invoiceId.
  function link(route, params, content, attrs) {
    const p = params || {};
    const data = Object.keys(p).map((k) => ' data-' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + '="' + esc(p[k]) + '"').join('');
    return raw('<a href="' + esc(NB.app.href(route, p)) + '" data-go="' + esc(route) + '"' + data + (attrs ? ' ' + attrs : '') + '>' + out(content) + '</a>');
  }

  function empty(title, body, action) {
    return html`<div class="empty">
      <span class="empty-mark">${icon('spark')}</span>
      <p class="empty-title">${title}</p>
      ${body ? html`<p class="empty-body">${body}</p>` : ''}
      ${action || ''}
    </div>`;
  }

  // ---------------------------------------------------------------- toasts
  function toast(message, kind) {
    const root = document.getElementById('toasts');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' toast-' + kind : '');
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    el.textContent = message;
    root.appendChild(el);
    while (root.children.length > 3) root.firstElementChild.remove();
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => {
      el.classList.remove('in');
      setTimeout(() => el.remove(), 250);
    }, kind === 'error' ? 7000 : 3400);
  }

  // ---------------------------------------------------------------- dialogs
  let openDialogs = 0;

  function modal(opts) {
    const root = document.getElementById('modal-root');
    const previous = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    const titleId = 'dlg-' + Math.random().toString(36).slice(2, 8);
    wrap.innerHTML = out(html`
      <div class="modal-scrim" data-close></div>
      <div class="modal ${opts.wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
        <header class="modal-head">
          <h2 id="${titleId}">${opts.title}</h2>
          <button type="button" class="btn btn-icon btn-quiet" data-close aria-label="Close">${icon('x')}</button>
        </header>
        <div class="modal-body">${opts.body}</div>
        ${opts.foot ? html`<footer class="modal-foot">${opts.foot}</footer>` : ''}
      </div>`);
    root.appendChild(wrap);
    openDialogs += 1;
    document.body.classList.add('has-modal');
    const dialog = wrap.querySelector('.modal');

    let closed = false;
    function close(result) {
      if (closed) return;
      closed = true;
      wrap.remove();
      openDialogs -= 1;
      if (!openDialogs) document.body.classList.remove('has-modal');
      document.removeEventListener('keydown', onKey, true);
      if (previous && previous.focus) previous.focus({ preventScroll: true });
      if (opts.onClose) opts.onClose(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      } else if (e.key === 'Tab') {
        const f = dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const list = Array.prototype.filter.call(f, (el) => !el.disabled && el.offsetParent !== null);
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    const api = { el: dialog, close };
    if (opts.onMount) opts.onMount(dialog, api);
    const auto = dialog.querySelector('[autofocus]') || dialog.querySelector('.modal-body input, .modal-body select, .modal-body textarea') || dialog.querySelector('.modal-foot .btn-primary, .modal-foot .btn-danger');
    if (auto) auto.focus();
    return api;
  }

  // Resolves true when confirmed. `typed` asks the person to type a word first.
  function confirm(opts) {
    return new Promise((resolve) => {
      let result = false;
      const typed = opts.typed;
      modal({
        title: opts.title,
        body: html`<p class="dlg-text">${opts.message}</p>
          ${typed ? html`<label class="field"><span>Type <strong>${typed}</strong> to confirm</span><input id="confirm-typed" autocomplete="off" autocapitalize="characters"></label>` : ''}`,
        foot: html`<button type="button" class="btn btn-quiet" data-close>Cancel</button>
          <button type="button" class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'}" data-ok ${typed ? 'disabled' : ''}>${opts.confirm || 'Confirm'}</button>`,
        onMount(el, api) {
          const ok = el.querySelector('[data-ok]');
          ok.addEventListener('click', () => { result = true; api.close(); });
          if (typed) {
            const input = el.querySelector('#confirm-typed');
            input.addEventListener('input', () => { ok.disabled = input.value.trim().toUpperCase() !== typed; });
          }
        },
        onClose() { resolve(result); },
      });
    });
  }

  // ---------------------------------------------------------------- clipboard & files
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) { /* fall back below */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  // Hosted: ask the viewer through the downloads capability. Self-hosted: a normal download.
  async function saveFile(filename, data, mime) {
    const downloads = await NB.env.downloads();
    if (downloads) {
      try {
        await downloads.save({ filename, data });
        return true;
      } catch (e) {
        const code = e && e.code;
        if (code === 'declined') return false;
        if (code === 'rate_limited') { toast('A save prompt is already open. Finish that one first.'); return false; }
        if (code === 'too_large') { toast('That file is too large to save here.', 'error'); return false; }
        if (code !== 'unavailable' && code !== 'not_granted' && code !== 'capability_disabled') {
          toast('The file could not be saved: ' + ((e && e.message) || 'unknown error'), 'error');
          return false;
        }
      }
    }
    if (NB.env.hosted && NB.env.framed) {
      toast("Saving files isn't available in this view.", 'error');
      return false;
    }
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  }

  // Loads a classic script once (vendor libraries are only fetched when first needed).
  const scripts = {};
  function loadScript(src) {
    if (!scripts[src]) {
      scripts[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => { delete scripts[src]; reject(new Error('Could not load ' + src)); };
        document.head.appendChild(s);
      });
    }
    return scripts[src];
  }

  // Runs an async action from a button: disables it, shows errors as toasts.
  async function busy(button, fn) {
    if (button) {
      if (button.disabled) return;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    }
    try {
      return await fn();
    } catch (e) {
      console.error(e);
      toast((e && e.message) || 'Something went wrong.', 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }
    }
  }

  // Reads every named control in a form into a flat object.
  function formValues(form) {
    const o = {};
    form.querySelectorAll('input[name], select[name], textarea[name]').forEach((el) => {
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else o[el.name] = el.value;
    });
    return o;
  }

  function fieldError(form, name, message) {
    const el = form.querySelector('[name="' + name + '"]');
    if (!el) { toast(message, 'error'); return; }
    const field = el.closest('.field');
    if (field) {
      field.classList.add('has-error');
      let msg = field.querySelector('.field-error');
      if (!msg) {
        msg = document.createElement('span');
        msg.className = 'field-error';
        field.appendChild(msg);
      }
      msg.textContent = message;
      const clear = () => { field.classList.remove('has-error'); msg.remove(); el.removeEventListener('input', clear); el.removeEventListener('change', clear); };
      el.addEventListener('input', clear);
      el.addEventListener('change', clear);
    }
    el.focus();
  }

  NB.ui = { esc, raw, html, out, fmt, num, prefs, icon, pill, avatar, link, empty, toast, modal, confirm, copyText, saveFile, loadScript, busy, formValues, fieldError };
})(window.NB = window.NB || {});
