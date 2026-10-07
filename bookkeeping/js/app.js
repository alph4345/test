/* n0va Books · app.js
 * The shell (rail on wide screens, top bar + tab bar on phones), navigation, menus and boot.
 * Self-hosted copies keep the route in the URL hash so Back and new tabs work; the hosted
 * claude.ai copy keeps it in memory (the viewer only passes plain #anchors through). */
(function (NB) {
  'use strict';
  const { html, raw, out, icon, esc } = NB.ui;
  NB.views = NB.views || {};

  const NAV = [
    { route: 'dashboard', label: 'Overview', icon: 'spark' },
    { route: 'customers', label: 'Customers', icon: 'users' },
    { route: 'estimates', label: 'Estimates', icon: 'estimate' },
    { route: 'invoices', label: 'Invoices', icon: 'invoice' },
    { route: 'payments', label: 'Payments', icon: 'payment' },
    { route: 'settings', label: 'Settings', icon: 'settings' },
  ];

  const useHash = !NB.env.hosted;
  let route = { name: 'dashboard', params: {} };
  const stack = [];
  let depth = 0;
  let guard = null; // an editor's "has unsaved changes?" check

  function setGuard(fn) {
    guard = fn;
  }

  // Asks before leaving an editor with unsaved changes. Returns true when it took over.
  function guarded(proceed) {
    if (!guard || !guard()) return false;
    NB.ui.confirm({
      title: 'Discard your changes?',
      message: "You have changes on this page that aren't saved yet.",
      confirm: 'Discard changes',
      danger: true,
    }).then((ok) => {
      if (ok) {
        guard = null;
        proceed();
      }
    });
    return true;
  }

  function section(r) {
    if (r.name === 'doc' || r.name === 'doc-edit') return r.params.kind === 'estimate' ? 'estimates' : 'invoices';
    if (r.name === 'customer' || r.name === 'customer-edit') return 'customers';
    if (r.name === 'payment' || r.name === 'payment-edit') return 'payments';
    return r.name;
  }

  function href(name, params) {
    if (!useHash) return '#';
    const q = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      if (params[k] != null && params[k] !== '') q.set(k, params[k]);
    });
    const qs = q.toString();
    return '#/' + name + (qs ? '?' + qs : '');
  }

  function parseHash() {
    const m = /^#\/([a-z-]+)(?:\?(.*))?$/.exec(location.hash || '');
    if (!m || !NB.views[m[1]]) return null;
    const params = {};
    new URLSearchParams(m[2] || '').forEach((v, k) => { params[k] = v; });
    return { name: m[1], params };
  }

  function setRoute(r, keepScroll) {
    route = r;
    guard = null;
    closeMenu();
    renderShell();
    renderView(true);
    if (!keepScroll) window.scrollTo(0, 0);
    const main = document.getElementById('main');
    if (main && !main.contains(document.activeElement)) main.focus({ preventScroll: true });
  }

  function go(name, params, opts) {
    if (guarded(() => go(name, params, opts))) return;
    const next = { name, params: params || {} };
    const replace = !!(opts && opts.replace);
    if (useHash) {
      const h = href(name, next.params);
      if (replace) {
        try { history.replaceState(null, '', h); } catch (e) { /* file:// quirks */ }
        setRoute(next);
      } else if (location.hash === h) {
        setRoute(next);
      } else {
        depth += 1;
        location.hash = h; // hashchange renders
      }
    } else {
      if (!replace) stack.push(route);
      setRoute(next);
    }
  }

  // Back to wherever the person came from, or to `fallback` when there is no history.
  function back(fallback, fallbackParams) {
    if (guarded(() => back(fallback, fallbackParams))) return;
    if (useHash && depth > 0) {
      depth -= 1;
      history.back();
      return;
    }
    if (!useHash && stack.length) {
      setRoute(stack.pop());
      return;
    }
    go(fallback || 'dashboard', fallbackParams || {}, { replace: true });
  }

  function current() {
    return route;
  }

  // ---------------------------------------------------------------- menus
  let menuEl = null;
  let menuCleanup = null;

  function closeMenu() {
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }
    if (menuCleanup) {
      menuCleanup();
      menuCleanup = null;
    }
  }

  // items: [{label, icon, run, danger}] or {sep: true}
  function menu(anchor, items) {
    if (menuEl && menuEl._anchor === anchor) { closeMenu(); return; }
    closeMenu();
    const el = document.createElement('div');
    el.className = 'menu';
    el.setAttribute('role', 'menu');
    el._anchor = anchor;
    el.innerHTML = items.map((it, i) => it.sep
      ? '<hr>'
      : '<button type="button" role="menuitem" class="menu-item' + (it.danger ? ' is-danger' : '') + '" data-i="' + i + '">' +
        out(icon(it.icon || 'next')) + '<span>' + esc(it.label) + '</span></button>').join('');
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = r.right - w;
    if (left < 8) left = Math.min(r.left, window.innerWidth - w - 8);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    el.style.left = Math.max(8, left) + 'px';
    el.style.top = top + 'px';
    anchor.setAttribute('aria-expanded', 'true');
    menuEl = el;

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const it = items[+b.dataset.i];
      closeMenu();
      it.run();
    });
    const buttons = Array.from(el.querySelectorAll('.menu-item'));
    const onKey = (e) => {
      const i = buttons.indexOf(document.activeElement);
      if (e.key === 'Escape') { closeMenu(); anchor.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); buttons[(i + 1) % buttons.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length].focus(); }
      else if (e.key === 'Tab') closeMenu();
    };
    const onDown = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) closeMenu(); };
    const onScroll = () => closeMenu();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', onScroll);
    menuCleanup = () => {
      anchor.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onScroll);
    };
    if (buttons[0]) buttons[0].focus();
  }

  function newMenu(anchor) {
    menu(anchor, [
      { label: 'Invoice', icon: 'invoice', run: () => go('doc-edit', { kind: 'invoice' }) },
      { label: 'Estimate', icon: 'estimate', run: () => go('doc-edit', { kind: 'estimate' }) },
      { label: 'Payment', icon: 'payment', run: () => go('payment-edit', {}) },
      { label: 'Customer', icon: 'users', run: () => go('customer-edit', {}) },
    ]);
  }

  // ---------------------------------------------------------------- shell
  function navHTML(where) {
    const active = section(route);
    const items = where === 'tabbar' ? NAV.filter((n) => n.route !== 'settings') : NAV;
    return out(items.map((n) => html`<a href="${href(n.route, {})}" data-go="${n.route}" class="nav-item${n.route === active ? ' is-active' : ''}"
      ${n.route === active ? raw('aria-current="page"') : ''}>${icon(n.icon)}<span>${n.label}</span></a>`));
  }

  function statusHTML() {
    const st = NB.store;
    if (!st.ready) return '';
    let ic = 'device';
    let text = 'Saved in this browser';
    let tone = '';
    if (st.mode === 'cloud') { ic = 'cloud'; text = 'Saved to your claude.ai account'; }
    if (st.mode === 'memory') { ic = 'alert'; text = 'Not being saved'; tone = 'bad'; }
    if (st.saving > 0) text = 'Saving…';
    return out(html`<span class="status ${tone}" title="${text}">${icon(ic)}<span>${text}</span></span>`);
  }

  function bannersHTML() {
    const st = NB.store;
    const list = [];
    if (st.readOnly) {
      list.push(html`<div class="banner banner-info">${icon('alert')}<p>You can view these books but not change them.</p></div>`);
    }
    if (st.notice === 'cloud-unavailable') {
      list.push(html`<div class="banner banner-warn">${icon('alert')}<p><strong>Saving in this browser only.</strong> The hosted database isn't available in this window, so changes stay on this device. Download a backup from Settings before you close it.</p></div>`);
    } else if (st.mode === 'memory') {
      list.push(html`<div class="banner banner-bad">${icon('alert')}<p><strong>This browser isn't letting n0va Books save anything.</strong> Download a backup from Settings before you close this tab, or open the app in a regular (not private) window.</p></div>`);
    }
    if (st.lastError) {
      list.push(html`<div class="banner banner-bad">${icon('alert')}<p>${st.lastError}</p><button type="button" class="btn btn-quiet btn-sm" data-dismiss-error>Dismiss</button></div>`);
    }
    if (st.mode === 'local' && route.name === 'dashboard' && !st.isEmpty() && !st.hasSample()) {
      const last = NB.ui.prefs.get('lastBackup');
      const days = last ? NB.util.Dates.diff(last, NB.util.Dates.today()) : Infinity;
      if (days > 30) {
        list.push(html`<div class="banner banner-info">${icon('download')}<p><strong>${last ? 'Your last backup was ' + days + ' days ago.' : "You haven't downloaded a backup yet."}</strong>
          Your books live in this browser only, so keep a copy somewhere safe.</p>
          <button type="button" class="btn btn-quiet btn-sm" data-backup>Download backup</button></div>`);
      }
    }
    if (st.hasSample() && route.name !== 'settings') {
      list.push(html`<div class="banner banner-sample">${icon('spark')}<p><strong>You're looking at sample data.</strong> Explore freely, then remove it before adding your real customers.</p>
        <button type="button" class="btn btn-quiet btn-sm" data-clear-sample>Remove sample data</button></div>`);
    }
    return out(list);
  }

  let lastBrand = '';
  function renderShell() {
    const s = NB.store.settings();
    NB.brand.apply(s);
    const brand = NB.brand.lockup(s, NB.store.logo(), 'rail');
    if (brand !== lastBrand) {
      document.querySelectorAll('[data-brand-slot]').forEach((el) => { el.innerHTML = brand; });
      lastBrand = brand;
    }
    const set = (sel, value) => {
      const el = document.querySelector(sel);
      if (el && el.innerHTML !== value) el.innerHTML = value;
    };
    set('#rail-nav', navHTML('rail'));
    set('#tabbar', navHTML('tabbar'));
    set('#rail-status', statusHTML());
    set('#banners', bannersHTML());
    const settingsLink = document.getElementById('top-settings');
    if (settingsLink) settingsLink.classList.toggle('is-active', section(route) === 'settings');
  }

  function renderView(full) {
    const main = document.getElementById('main');
    if (!main || !NB.store.ready) return;
    if (NB.store.readOnly && NB.store.isEmpty()) {
      main.innerHTML = out(html`<div class="page"><div class="empty">
        <span class="empty-mark">${icon('spark')}</span>
        <p class="empty-title">These books are private</p>
        <p class="empty-body">Only the owner and editors can see the customers, invoices and payments here.</p></div></div>`);
      return;
    }
    const view = NB.views[route.name] || NB.views.dashboard;
    if (full) main.onclick = main.oninput = main.onchange = main.onsubmit = main.onkeydown = main._focusout = null;
    try {
      if (full || !view.update) view.render(main, route.params);
      else view.update(main, route.params);
    } catch (e) {
      console.error(e);
      main.innerHTML = out(html`<div class="page"><div class="empty">
        <p class="empty-title">This page couldn't be shown</p>
        <p class="empty-body">${e.message}</p>
        ${NB.ui.link('dashboard', {}, 'Go to the overview', 'class="btn btn-quiet"')}</div></div>`);
    }
    const title = typeof view.title === 'function' ? view.title(route.params) : view.title;
    document.title = (title ? title + ' · ' : '') + 'n0va Books';
  }

  // Re-render after data changes, but never under someone's typing.
  function onData() {
    renderShell();
    const view = NB.views[route.name];
    if (!view || view.live === false) return;
    renderView(false);
  }

  // ---------------------------------------------------------------- events
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-go]');
    if (nav) {
      if (useHash && nav.tagName === 'A' && (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) return;
      e.preventDefault();
      const params = {};
      Object.keys(nav.dataset).forEach((k) => { if (k !== 'go') params[k] = nav.dataset[k]; });
      go(nav.dataset.go, params);
      return;
    }
    const newBtn = e.target.closest('[data-new]');
    if (newBtn) {
      newMenu(newBtn);
      return;
    }
    if (e.target.closest('[data-clear-sample]')) {
      clearSample(e.target.closest('button'));
      return;
    }
    const backupBtn = e.target.closest('[data-backup]');
    if (backupBtn) {
      NB.ui.busy(backupBtn, () => NB.settings.downloadBackup());
      return;
    }
    if (e.target.closest('[data-dismiss-error]')) {
      NB.store.lastError = null;
      renderShell();
    }
  });

  async function clearSample(button) {
    const ok = await NB.ui.confirm({
      title: 'Remove sample data?',
      message: 'This deletes the example customers, estimates, invoices and payments. Anything you added yourself stays.',
      confirm: 'Remove sample data',
      danger: true,
    });
    if (!ok) return;
    await NB.ui.busy(button, async () => {
      await NB.store.clearSample();
      NB.ui.toast('Sample data removed');
      go('dashboard', {}, { replace: true });
    });
  }

  window.addEventListener('hashchange', () => {
    if (!useHash) return;
    const r = parseHash();
    if (r) setRoute(r);
  });

  // ---------------------------------------------------------------- boot
  async function boot() {
    const main = document.getElementById('main');
    // focusout bubbles but has no reliable on-property, so views set main._focusout.
    main.addEventListener('focusout', (e) => { if (main._focusout) main._focusout(e); });
    window.addEventListener('beforeunload', (e) => {
      if (guard && guard()) { e.preventDefault(); e.returnValue = ''; }
    });
    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon) favicon.href = NB.brand.faviconHref();
    renderShell();
    try {
      await NB.store.init();
    } catch (e) {
      console.error(e);
      document.getElementById('main').innerHTML = out(html`<div class="page"><div class="empty">
        <p class="empty-title">Your books couldn't be opened</p><p class="empty-body">${e.message}</p></div></div>`);
      return;
    }
    if (NB.store.mode === 'cloud' && window.claude) {
      try {
        const user = await Promise.race([window.claude.use('user'), new Promise((r) => setTimeout(() => r(null), 4000))]);
        if (user && (await user.can('data.write')) === false) NB.store.readOnly = true;
      } catch (e) { /* unknown: keep editing on and let a refused write decide */ }
    }
    const initial = useHash ? parseHash() : null;
    route = initial || { name: 'dashboard', params: {} };
    if (useHash && !initial) {
      try { history.replaceState(null, '', href(route.name, route.params)); } catch (e) { /* ignore */ }
    }
    NB.store.onChange(onData);
    renderShell();
    renderView(true);
  }

  NB.app = { go, back, href, current, menu, closeMenu, renderShell, setGuard, refresh: () => renderView(true), section };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.NB = window.NB || {});
