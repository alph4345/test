/* n0va Books · views/expenses.js
 * Money going out: expenses (with receipt photos) and the mileage log. Internal only;
 * nothing here is ever printed for a customer. Totals feed the Taxes page. */
(function (NB) {
  'use strict';
  NB.views = NB.views || {};
  const { html, raw, out, icon, fmt, link, empty } = NB.ui;
  const { Dates, matches, plural, clone, uid, Money } = NB.util;
  const T = NB.tax;

  const PAID_WITH = ['Business card', 'Business bank account', 'Personal card', 'Cash', 'Square balance', 'Other'];
  const listState = { tab: 'expenses', period: 'this-year', category: 'all', q: '' };

  function range(key, today) {
    const ym = Dates.month(today);
    const y = today.slice(0, 4);
    if (key === 'this-month') return [ym + '-01', ym + '-31'];
    if (key === 'last-month') { const m = Dates.addMonths(ym, -1); return [m + '-01', m + '-31']; }
    if (key === 'this-year') return [y + '-01-01', y + '-12-31'];
    if (key === 'last-year') { const ly = String(+y - 1); return [ly + '-01-01', ly + '-12-31']; }
    return null;
  }

  function lineText(c) {
    const cogs = T.COGS_LINES.includes(c.line);
    return 'Schedule C ' + (cogs ? 'Part III, line ' : 'line ') + c.line + ': ' + T.LINES[c.line] + (cogs ? ' (cost of goods sold)' : '');
  }

  function categoryOptions(selected, withAll) {
    const groups = [];
    T.CATEGORIES.forEach((c) => {
      let g = groups.find((x) => x.name === c.group);
      if (!g) groups.push((g = { name: c.group, items: [] }));
      g.items.push(c);
    });
    return html`${withAll ? html`<option value="all">All categories</option>` : ''}
      ${groups.map((g) => html`<optgroup label="${g.name}">${g.items.map((c) => html`<option value="${c.id}" ${c.id === selected ? raw('selected') : ''}>${c.name}</option>`)}</optgroup>`)}`;
  }

  // ---------------------------------------------------------------- exports
  function expensesCSV(list) {
    const cur = NB.store.settings().docs.currency;
    const m = (v) => Money.toInput(v || 0, cur);
    return NB.util.csv(list.slice().sort((a, b) => a.date.localeCompare(b.date)), [
      { label: 'Date', value: (e) => e.date },
      { label: 'Vendor', value: (e) => e.vendor || '' },
      { label: 'Description', value: (e) => e.description || '' },
      { label: 'Category', value: (e) => T.category(e.category).name },
      { label: 'Schedule C line', value: (e) => T.category(e.category).line },
      { label: 'Amount', value: (e) => m(e.amount) },
      { label: 'Business use %', value: (e) => T.businessPercent(e) },
      { label: 'Deductible', value: (e) => m(T.deductible(e)) },
      { label: 'Paid with', value: (e) => e.paidWith || '' },
      { label: 'Receipt saved', value: (e) => ((e.receipts || []).length ? 'yes' : '') },
      { label: 'Notes', value: (e) => e.notes || '' },
    ]);
  }

  function mileageCSV(list) {
    const cur = NB.store.settings().docs.currency;
    const rates = NB.store.settings().mileageRates;
    return NB.util.csv(list.slice().sort((a, b) => a.date.localeCompare(b.date)), [
      { label: 'Date', value: (t) => t.date },
      { label: 'Where and why', value: (t) => t.purpose || '' },
      { label: 'Miles', value: (t) => Number(t.miles) || 0 },
      { label: 'Rate (cents per mile)', value: (t) => T.mileageRate(t.date, rates) },
      { label: 'Deduction', value: (t) => Money.toInput(T.tripDeduction(t, rates), cur) },
      { label: 'Notes', value: (t) => t.notes || '' },
    ]);
  }

  // ---------------------------------------------------------------- receipt files
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('decode'));
      img.src = src;
    });
  }

  // Photos are shrunk to a sharp, small JPEG; PDFs are kept as they are.
  async function prepareFile(file) {
    if (file.type === 'application/pdf' || (!file.type && /\.pdf$/i.test(file.name || ''))) {
      if (file.size > 15 * 1024 * 1024) throw new Error('That PDF is over 15 MB. Save a smaller copy and try again.');
      return { blob: file.type ? file : new Blob([file], { type: 'application/pdf' }), name: file.name };
    }
    if (!/^image\//.test(file.type)) throw new Error('Choose a photo or a PDF of the receipt.');
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      const scale = Math.min(1, 1600 / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
      if (!blob) throw new Error('decode');
      return { blob, name: (file.name || 'receipt').replace(/\.[^.]+$/, '') + '.jpg' };
    } catch (e) {
      if (/^image\/(jpeg|png|gif|webp)$/.test(file.type)) return { blob: file, name: file.name };
      throw new Error('This photo format can’t be opened here. Try a JPG or PNG, or a PDF.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Fills in <img data-file-id> elements once their URLs resolve.
  function hydrate(root) {
    root.querySelectorAll('img[data-file-id]').forEach(async (img) => {
      const u = await NB.store.files.url(img.dataset.fileId).catch(() => null);
      if (u) img.src = u;
      else img.closest('.receipt-tile').classList.add('is-missing');
    });
  }

  function receiptTiles(receipts, removable) {
    return html`${(receipts || []).map((r, i) => html`<div class="receipt-tile">
      <button type="button" class="receipt-open" data-receipt="${i}" aria-label="Open ${r.name || 'receipt'}">
        ${/pdf/.test(r.type || '') ? html`<span class="receipt-pdf">${icon('receipt')}<span>PDF</span></span>` : html`<img data-file-id="${r.id}" alt="">`}
      </button>
      ${removable ? html`<button type="button" class="receipt-remove btn btn-icon btn-sm" data-remove-receipt="${i}" aria-label="Remove ${r.name || 'receipt'}">${icon('x')}</button>` : ''}
    </div>`)}`;
  }

  async function openReceipt(r) {
    const isPdf = /pdf/.test(r.type || '');
    const url = await NB.store.files.url(r.id);
    NB.ui.modal({
      title: r.name || 'Receipt',
      wide: true,
      body: isPdf
        ? html`<p class="dlg-text">This receipt is a PDF. Download it to view it.</p>`
        : html`<div class="receipt-full">${url ? html`<img src="${url}" alt="Receipt photo">` : html`<p class="dlg-text">This receipt file is missing.</p>`}</div>`,
      foot: html`<button type="button" class="btn btn-quiet" data-close>Close</button>
        <button type="button" class="btn btn-primary" data-save>${icon('download')}<span>Download</span></button>`,
      onMount(el) {
        el.querySelector('[data-save]').addEventListener('click', (e) => NB.ui.busy(e.currentTarget, async () => {
          const blob = await NB.store.files.blob(r.id);
          if (!blob) throw new Error('This receipt file is missing.');
          const ext = isPdf ? '.pdf' : /png/.test(blob.type) ? '.png' : '.jpg';
          const name = NB.util.safeFilename((r.name || 'receipt').replace(/\.[^.]+$/, '')) + ext;
          if (await NB.ui.saveFile(name, blob, blob.type)) NB.ui.toast('Saved ' + name);
        }));
      },
    });
  }

  // ---------------------------------------------------------------- list
  function filteredExpenses(today) {
    const r = range(listState.period, today);
    return NB.store.all('expenses')
      .filter((e) => !r || (e.date >= r[0] && e.date <= r[1]))
      .filter((e) => listState.category === 'all' || e.category === listState.category)
      .filter((e) => matches(listState.q, [e.vendor, e.description, e.notes, e.paidWith, T.category(e.category).name]))
      .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function filteredTrips(today) {
    const r = range(listState.period, today);
    return NB.store.all('mileage')
      .filter((t) => !r || (t.date >= r[0] && t.date <= r[1]))
      .filter((t) => matches(listState.q, [t.purpose, t.notes]))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function expensesPanel(list) {
    if (!NB.store.all('expenses').length) {
      return empty('No expenses yet', 'Add what you spend on materials, booth fees, shipping and the rest. Each one can keep a photo of its receipt.',
        link('expense-edit', {}, 'Add your first expense', 'class="btn btn-primary"'));
    }
    const spent = list.reduce((a, e) => a + (Math.round(e.amount) || 0), 0);
    const deductible = list.reduce((a, e) => a + T.deductible(e), 0);
    const byCat = new Map();
    list.forEach((e) => {
      const c = T.category(e.category);
      const row = byCat.get(c.id) || { c, amount: 0, count: 0 };
      row.amount += T.deductible(e);
      row.count += 1;
      byCat.set(c.id, row);
    });
    const cats = Array.from(byCat.values()).sort((a, b) => b.amount - a.amount);
    const top = cats[0];
    const max = top ? Math.max(top.amount, 1) : 1;
    const missing = list.filter((e) => !(e.receipts || []).length).length;
    return html`
      <section class="kpis kpis-3 kpis-tight" aria-label="Totals for this view">
        <div class="kpi"><p class="kpi-label">Spent</p><p class="kpi-value">${fmt.money(spent)}</p><p class="kpi-sub">${plural(list.length, 'expense')}</p></div>
        <div class="kpi"><p class="kpi-label">Write-offs</p><p class="kpi-value">${fmt.money(deductible)}</p><p class="kpi-sub">After business-use and meal limits</p></div>
        <div class="kpi"><p class="kpi-label">Receipts saved</p><p class="kpi-value">${list.length - missing} of ${list.length}</p>
          <p class="kpi-sub">${missing ? plural(missing, 'expense') + ' without a receipt' : 'Every expense has one'}</p></div>
      </section>
      ${list.length ? html`<div class="exp-grid">
        <div class="card card-flush"><table class="table table-rows">
          <thead><tr><th>Date</th><th>Vendor and what</th><th>Category</th><th>Paid with</th><th class="num">Amount</th><th class="num">Write-off</th></tr></thead>
          <tbody>${list.map((e) => {
            const c = T.category(e.category);
            const pct = T.businessPercent(e);
            return html`<tr data-go="expense-edit" data-id="${e.id}" class="is-clickable">
              <td data-label="Date">${fmt.date(e.date)}</td>
              <td data-label="Vendor and what">${link('expense-edit', { id: e.id }, e.vendor || e.description || c.name, 'class="strong"')}
                ${e.vendor && e.description ? html`<span class="cell-sub">${e.description}</span>` : ''}
                ${(e.receipts || []).length ? html`<span class="cell-sub receipt-flag">${icon('receipt')}Receipt saved</span>` : ''}</td>
              <td data-label="Category">${c.name}</td>
              <td data-label="Paid with">${e.paidWith || html`<span class="muted">—</span>`}</td>
              <td data-label="Amount" class="num">${fmt.money(e.amount)}${pct < 100 ? html`<span class="cell-sub">${pct}% business</span>` : ''}</td>
              <td data-label="Write-off" class="num">${fmt.money(T.deductible(e))}</td>
            </tr>`;
          })}</tbody>
        </table></div>
        <section class="card">
          <header class="card-head"><h2>By category</h2><p class="card-sub">Write-offs</p></header>
          <ul class="cat-bars">${cats.map((r) => html`<li>
            <div class="cat-bar-head"><span>${r.c.name}</span><span class="cat-bar-value">${fmt.money(r.amount)}</span></div>
            <span class="cat-bar" style="--w:${(r.amount / max).toFixed(4)}"></span>
            <span class="cat-bar-line">Line ${r.c.line} · ${plural(r.count, 'expense')}</span></li>`)}</ul>
        </section>
      </div>` : empty('Nothing here', 'No expenses match this period, category or search.')}`;
  }

  function tripsPanel(list) {
    const rates = NB.store.settings().mileageRates;
    if (!NB.store.all('mileage').length) {
      return empty('No trips logged yet', 'Log the miles you drive for the business: markets, supply runs, the post office. The IRS lets you write off each business mile.',
        link('trip-edit', {}, 'Log your first trip', 'class="btn btn-primary"'));
    }
    const miles = list.reduce((a, t) => a + (Number(t.miles) || 0), 0);
    const ded = list.reduce((a, t) => a + T.tripDeduction(t, rates), 0);
    return html`
      <section class="kpis kpis-3 kpis-tight" aria-label="Totals for this view">
        <div class="kpi"><p class="kpi-label">Business miles</p><p class="kpi-value">${fmt.qty(miles)}</p><p class="kpi-sub">${plural(list.length, 'trip')}</p></div>
        <div class="kpi"><p class="kpi-label">Mileage write-off</p><p class="kpi-value">${fmt.money(ded)}</p><p class="kpi-sub">At the IRS standard rate</p></div>
        <div class="kpi"><p class="kpi-label">Rate today</p><p class="kpi-value">${fmt.qty(T.mileageRate(Dates.today(), rates))}¢</p><p class="kpi-sub">per mile · ${link('settings', {}, 'change in Settings')}</p></div>
      </section>
      ${list.length ? html`<div class="card card-flush"><table class="table table-rows">
        <thead><tr><th>Date</th><th>Where and why</th><th class="num">Miles</th><th class="num">Rate</th><th class="num">Write-off</th></tr></thead>
        <tbody>${list.map((t) => html`<tr data-go="trip-edit" data-id="${t.id}" class="is-clickable">
          <td data-label="Date">${fmt.date(t.date)}</td>
          <td data-label="Where and why">${link('trip-edit', { id: t.id }, t.purpose || 'Business trip', 'class="strong"')}</td>
          <td data-label="Miles" class="num">${fmt.qty(t.miles)}</td>
          <td data-label="Rate" class="num">${fmt.qty(T.mileageRate(t.date, rates))}¢</td>
          <td data-label="Write-off" class="num">${fmt.money(T.tripDeduction(t, rates))}</td>
        </tr>`)}</tbody>
      </table></div>` : empty('Nothing here', 'No trips match this period or search.')}
      <p class="hint">Keep this log as you go: the IRS expects the date, where you went, why, and the miles for each trip.</p>`;
  }

  NB.views.expenses = {
    title: 'Expenses',
    render(root, params) {
      if (params && params.tab) listState.tab = params.tab === 'mileage' ? 'mileage' : 'expenses';
      const periods = [['this-month', 'This month'], ['last-month', 'Last month'], ['this-year', 'This year'], ['last-year', 'Last year'], ['all', 'All time']];
      root.innerHTML = out(html`<div class="page">
        <header class="page-head">
          <div><p class="eyebrow">Only you see this</p><h1>Expenses</h1></div>
          <div class="head-actions">
            <button type="button" class="btn btn-quiet" data-act="csv">${icon('download')}<span>Export CSV</span></button>
            ${link('trip-edit', {}, html`${icon('car')}<span>Log a trip</span>`, 'class="btn btn-quiet"')}
            ${link('expense-edit', {}, html`${icon('plus')}<span>Add expense</span>`, 'class="btn btn-primary"')}
          </div>
        </header>
        <div class="tabs" role="tablist">
          <button type="button" role="tab" data-tab="expenses">Expenses <span class="chip-n" data-count="expenses"></span></button>
          <button type="button" role="tab" data-tab="mileage">Mileage <span class="chip-n" data-count="mileage"></span></button>
        </div>
        <div class="toolbar">
          <label class="select-inline"><span class="sr-only">Period</span>
            <select id="exp-period">${periods.map((p) => html`<option value="${p[0]}" ${listState.period === p[0] ? raw('selected') : ''}>${p[1]}</option>`)}</select></label>
          <label class="select-inline" data-cat-filter><span class="sr-only">Category</span>
            <select id="exp-category">${categoryOptions(listState.category, true)}</select></label>
          <label class="search">${icon('search')}<input type="search" id="exp-search" value="${listState.q}" placeholder="Search vendor, item or note"
            aria-label="Search expenses" autocomplete="off"></label>
        </div>
        <div class="exp-results" data-results></div>
      </div>`);
      root.oninput = (e) => {
        if (e.target.id === 'exp-search') { listState.q = e.target.value; NB.views.expenses.update(root); }
      };
      root.onchange = (e) => {
        if (e.target.id === 'exp-period') listState.period = e.target.value;
        if (e.target.id === 'exp-category') listState.category = e.target.value;
        NB.views.expenses.update(root);
      };
      root.onclick = (e) => {
        const tab = e.target.closest('[data-tab]');
        if (tab) { listState.tab = tab.dataset.tab; NB.views.expenses.update(root); return; }
        const b = e.target.closest('[data-act="csv"]');
        if (b) NB.ui.busy(b, async () => {
          const today = Dates.today();
          const isTrips = listState.tab === 'mileage';
          const list = isTrips ? filteredTrips(today) : filteredExpenses(today);
          if (!list.length) { NB.ui.toast('There is nothing in this view to export.'); return; }
          const name = (isTrips ? 'mileage-log-' : 'expenses-') + today + '.csv';
          if (await NB.ui.saveFile(name, isTrips ? mileageCSV(list) : expensesCSV(list), 'text/csv')) NB.ui.toast('Exported ' + plural(list.length, isTrips ? 'trip' : 'expense'));
        });
      };
      NB.views.expenses.update(root);
    },
    update(root) {
      const box = root.querySelector('[data-results]');
      if (!box) return NB.views.expenses.render(root, {});
      const today = Dates.today();
      root.querySelectorAll('[data-tab]').forEach((t) => {
        const on = t.dataset.tab === listState.tab;
        t.classList.toggle('is-on', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      root.querySelector('[data-count="expenses"]').textContent = NB.store.all('expenses').length;
      root.querySelector('[data-count="mileage"]').textContent = NB.store.all('mileage').length;
      root.querySelector('[data-cat-filter]').hidden = listState.tab === 'mileage';
      box.innerHTML = out(listState.tab === 'mileage' ? tripsPanel(filteredTrips(today)) : expensesPanel(filteredExpenses(today)));
    },
  };

  // ---------------------------------------------------------------- expense form
  NB.views['expense-edit'] = {
    title: (p) => (p.id ? 'Edit expense' : 'Add expense'),
    live: false,
    render(root, params) {
      const existing = params.id ? NB.store.get('expenses', params.id) : null;
      if (params.id && !existing) {
        root.innerHTML = out(html`<div class="page">${empty('Expense not found', 'It may have been deleted.', link('expenses', {}, 'See all expenses', 'class="btn btn-quiet"'))}</div>`);
        return;
      }
      const today = Dates.today();
      const draft = existing ? clone(existing) : {
        id: uid(), date: today, amount: 0, vendor: '', description: '', category: params.category || 'materials',
        businessPercent: 100, paidWith: PAID_WITH[0], notes: '', receipts: [],
      };
      if (!Array.isArray(draft.receipts)) draft.receipts = [];
      const original = new Set((existing && existing.receipts || []).map((r) => r.id));
      const uploaded = []; // files added during this visit
      let dirty = false;
      const canAttach = NB.store.files.available();

      root.innerHTML = out(html`<div class="page page-editor">
        <button type="button" class="back-link" data-act="cancel">${icon('back')}<span>Expenses</span></button>
        <header class="page-head">
          <div><p class="eyebrow">Only you see this</p><h1>${existing ? 'Edit expense' : 'Add an expense'}</h1></div>
          <div class="head-actions">
            ${existing ? html`<button type="button" class="btn btn-icon btn-quiet" data-act="more" aria-label="More actions" aria-haspopup="menu">${icon('more')}</button>` : ''}
            <button type="button" class="btn btn-quiet" data-act="cancel">Cancel</button>
            <button type="submit" form="exp-form" class="btn btn-primary">${icon('check')}<span>Save expense</span></button>
          </div>
        </header>
        <form id="exp-form" class="editor" novalidate>
          <div class="editor-main">
            <section class="card form">
              <div class="form-grid">
                <label class="field"><span>Date</span><input type="date" name="date" id="exp-date" value="${draft.date}"></label>
                <label class="field"><span>Amount paid</span>
                  <input name="amount" id="exp-amount" class="num" inputmode="decimal" value="${draft.amount ? fmt.input(draft.amount) : ''}" placeholder="0.00" autocomplete="off"></label>
                <label class="field"><span>Vendor or store</span>
                  <input name="vendor" id="exp-vendor" value="${draft.vendor || ''}" placeholder="Michaels, Etsy, USPS…" autocomplete="off" list="exp-vendors"></label>
                <label class="field"><span>What it was for</span>
                  <input name="description" id="exp-desc" value="${draft.description || ''}" placeholder="Resin and molds" autocomplete="off"></label>
                <div class="field field-wide">
                  <label for="exp-category-pick">Category</label>
                  <select name="category" id="exp-category-pick">${categoryOptions(draft.category, false)}</select>
                  <span class="hint" data-cat-hint></span>
                </div>
                <label class="field"><span>Business use (%)</span>
                  <input name="businessPercent" id="exp-biz" class="num" inputmode="numeric" value="${T.businessPercent(draft)}" autocomplete="off">
                  <span class="hint">Under 100 for things you also use personally, like a phone.</span></label>
                <label class="field"><span>Paid with</span>
                  <select name="paidWith" id="exp-paid">${PAID_WITH.concat(PAID_WITH.includes(draft.paidWith) || !draft.paidWith ? [] : [draft.paidWith])
                    .map((p) => html`<option ${p === draft.paidWith ? raw('selected') : ''}>${p}</option>`)}</select></label>
                <label class="field field-wide"><span>Notes</span>
                  <textarea name="notes" id="exp-notes" rows="2" placeholder="Which market, what it was for, anything your tax preparer should know">${draft.notes || ''}</textarea></label>
              </div>
              <datalist id="exp-vendors">${Array.from(new Set(NB.store.all('expenses').map((e) => e.vendor).filter(Boolean))).sort().map((v) => html`<option value="${v}"></option>`)}</datalist>
            </section>
            <section class="card">
              <header class="card-head"><h2>Receipt</h2><p class="card-sub">Photos or PDFs, kept with this expense</p></header>
              ${canAttach ? html`
                <div class="receipts" data-receipts></div>
                <input type="file" id="exp-file" accept="image/*,application/pdf" multiple hidden>
                <button type="button" class="btn btn-quiet" data-act="attach">${icon('image')}<span>Add a receipt photo or PDF</span></button>
                <p class="hint">On a phone this opens the camera or your photos. Photos are resized to keep your books small.</p>`
              : html`${draft.receipts.length ? html`<div class="receipts" data-receipts></div>` : ''}
                <p class="muted small">Receipt photos can’t be added in this window. Keep the receipt somewhere safe and note where in the notes.</p>`}
            </section>
          </div>
          <aside class="editor-side">
            <section class="card totals-card">
              <header class="card-head"><h2>Write-off</h2></header>
              <dl class="totals" data-summary></dl>
              <p class="hint">This organizes your records; your tax preparer has the final say on what counts.</p>
            </section>
          </aside>
        </form>
      </div>`);

      const form = root.querySelector('#exp-form');
      const $ = (sel) => root.querySelector(sel);

      function renderReceipts() {
        const box = $('[data-receipts]');
        if (!box) return;
        box.innerHTML = out(receiptTiles(draft.receipts, canAttach));
        hydrate(box);
      }

      function sync() {
        const c = T.category(draft.category);
        $('[data-cat-hint]').textContent = c.hint + ' ' + lineText(c) + '.';
        const biz = T.businessPortion(draft);
        const ded = T.deductible(draft);
        const pct = T.businessPercent(draft);
        $('[data-summary]').innerHTML = out(html`
          <div><dt>Amount paid</dt><dd>${fmt.money(draft.amount)}</dd></div>
          ${pct < 100 ? html`<div class="totals-sub"><dt>Business share (${pct}%)</dt><dd>${fmt.money(biz)}</dd></div>` : ''}
          ${c.deductiblePercent ? html`<div class="totals-sub"><dt>Deductible part (${c.deductiblePercent}%)</dt><dd>${fmt.money(ded)}</dd></div>` : ''}
          <div class="totals-key"><dt>Write-off</dt><dd>${fmt.money(ded)}</dd></div>
          <div class="totals-sub"><dt>Goes on</dt><dd class="totals-line">Line ${c.line}</dd></div>`);
      }

      renderReceipts();
      sync();
      NB.app.setGuard(() => dirty, () => uploaded.forEach((id) => NB.store.files.remove(id)));

      root.oninput = (e) => {
        dirty = true;
        const el = e.target;
        if (el.id === 'exp-amount') { const v = fmt.parse(el.value); draft.amount = isNaN(v) ? 0 : Math.max(0, v); sync(); }
        if (el.id === 'exp-biz') { draft.businessPercent = Math.min(100, Math.max(0, Math.round(NB.ui.num(el.value)))); sync(); }
      };
      root.onchange = async (e) => {
        const el = e.target;
        dirty = true;
        if (el.id === 'exp-category-pick') {
          const c = T.category(el.value);
          draft.category = c.id;
          // A category with a usual business share (phone) suggests it when nothing was set.
          if (c.businessPercent && T.businessPercent(draft) === 100) {
            draft.businessPercent = c.businessPercent;
            $('#exp-biz').value = c.businessPercent;
          }
          sync();
        } else if (el.id === 'exp-file' && el.files && el.files.length) {
          const files = Array.from(el.files);
          el.value = '';
          await NB.ui.busy($('[data-act="attach"]'), async () => {
            for (const f of files) {
              const prepared = await prepareFile(f);
              const saved = await NB.store.files.add(prepared.blob, prepared.name);
              uploaded.push(saved.id);
              draft.receipts.push(saved);
            }
            renderReceipts();
            NB.ui.toast(files.length > 1 ? plural(files.length, 'receipt') + ' added' : 'Receipt added');
          });
        }
      };
      root._focusout = (e) => {
        if (e.target.id === 'exp-amount' && e.target.value) e.target.value = fmt.input(draft.amount);
      };
      root.onclick = async (e) => {
        const open = e.target.closest('[data-receipt]');
        if (open) { openReceipt(draft.receipts[+open.dataset.receipt]); return; }
        const rm = e.target.closest('[data-remove-receipt]');
        if (rm) {
          const [r] = draft.receipts.splice(+rm.dataset.removeReceipt, 1);
          if (r && uploaded.includes(r.id)) NB.store.files.remove(r.id);
          dirty = true;
          renderReceipts();
          return;
        }
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'attach') root.querySelector('#exp-file').click();
        else if (b.dataset.act === 'cancel') NB.app.back('expenses');
        else if (b.dataset.act === 'more') {
          NB.app.menu(b, [{ label: 'Delete expense', icon: 'trash', danger: true, run: async () => {
            const ok = await NB.ui.confirm({ title: 'Delete this expense?', message: 'It and its receipt photos will be removed. This cannot be undone.', confirm: 'Delete expense', danger: true });
            if (!ok) return;
            await NB.ui.busy(null, async () => {
              dirty = false;
              await NB.store.removeExpense(existing);
              uploaded.forEach((id) => NB.store.files.remove(id));
              NB.ui.toast('Expense deleted');
              NB.app.go('expenses', { tab: 'expenses' }, { replace: true });
            });
          } }]);
        }
      };
      root.onsubmit = async (e) => {
        e.preventDefault();
        const v = NB.ui.formValues(form);
        const rec = Object.assign(clone(draft), {
          date: v.date, vendor: (v.vendor || '').trim(), description: (v.description || '').trim(),
          category: v.category, paidWith: v.paidWith, notes: (v.notes || '').trim(),
        });
        if (!Dates.valid(rec.date)) return NB.ui.fieldError(form, 'date', 'Choose the date you paid.');
        if (!(rec.amount > 0)) return NB.ui.fieldError(form, 'amount', 'Enter what you paid.');
        if (!rec.vendor && !rec.description) return NB.ui.fieldError(form, 'vendor', 'Add the vendor or what it was for, so you can recognize it later.');
        await NB.ui.busy(document.querySelector('[form="exp-form"][type="submit"]'), async () => {
          await NB.store.save('expenses', rec);
          // Receipts taken off this expense are deleted once the change is saved.
          const kept = new Set(rec.receipts.map((r) => r.id));
          for (const id of original) if (!kept.has(id)) await NB.store.files.remove(id);
          dirty = false;
          NB.ui.toast(existing ? 'Expense updated' : 'Expense added');
          NB.app.go('expenses', { tab: 'expenses' }, { replace: true });
        });
      };
    },
  };

  // ---------------------------------------------------------------- trip form
  NB.views['trip-edit'] = {
    title: (p) => (p.id ? 'Edit trip' : 'Log a trip'),
    live: false,
    render(root, params) {
      const existing = params.id ? NB.store.get('mileage', params.id) : null;
      if (params.id && !existing) {
        root.innerHTML = out(html`<div class="page">${empty('Trip not found', 'It may have been deleted.', link('expenses', { tab: 'mileage' }, 'See the mileage log', 'class="btn btn-quiet"'))}</div>`);
        return;
      }
      const draft = existing ? clone(existing) : { id: uid(), date: Dates.today(), purpose: '', miles: 0, notes: '' };
      let dirty = false;
      const rates = NB.store.settings().mileageRates;
      const recent = Array.from(new Set(NB.store.all('mileage').sort((a, b) => b.date.localeCompare(a.date)).map((t) => t.purpose).filter(Boolean))).slice(0, 30);

      root.innerHTML = out(html`<div class="page page-narrow">
        <button type="button" class="back-link" data-act="cancel">${icon('back')}<span>Mileage log</span></button>
        <header class="page-head">
          <div><p class="eyebrow">Only you see this</p><h1>${existing ? 'Edit trip' : 'Log a trip'}</h1></div>
          <div class="head-actions">
            ${existing ? html`<button type="button" class="btn btn-icon btn-quiet" data-act="more" aria-label="More actions" aria-haspopup="menu">${icon('more')}</button>` : ''}
          </div>
        </header>
        <form id="trip-form" class="card form" novalidate>
          <div class="form-grid">
            <label class="field"><span>Date</span><input type="date" name="date" id="trip-date" value="${draft.date}"></label>
            <div class="field">
              <label for="trip-miles">Miles</label>
              <div class="field-row">
                <input name="miles" id="trip-miles" class="num" inputmode="decimal" value="${draft.miles ? fmt.qtyInput(draft.miles) : ''}" placeholder="0" autocomplete="off">
                <button type="button" class="btn btn-quiet" data-act="double" title="Double it for a round trip">× 2 round trip</button>
              </div>
            </div>
            <label class="field field-wide"><span>Where and why</span>
              <input name="purpose" id="trip-purpose" value="${draft.purpose || ''}" placeholder="Tucson Makers Market, round trip" autocomplete="off" list="trip-recent"></label>
            <label class="field field-wide"><span>Notes</span>
              <textarea name="notes" id="trip-notes" rows="2" placeholder="Odometer readings, stops along the way">${draft.notes || ''}</textarea></label>
          </div>
          <datalist id="trip-recent">${recent.map((r) => html`<option value="${r}"></option>`)}</datalist>
          <p class="trip-preview" data-preview></p>
          <div class="form-actions">
            <button type="button" class="btn btn-quiet" data-act="cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">${icon('check')}<span>Save trip</span></button>
          </div>
        </form>
      </div>`);

      const form = root.querySelector('#trip-form');
      const preview = () => {
        const date = form.querySelector('#trip-date').value || Dates.today();
        const rate = T.mileageRate(date, rates);
        form.querySelector('[data-preview]').textContent = draft.miles > 0
          ? fmt.qty(draft.miles) + ' miles × ' + fmt.qty(rate) + '¢ = ' + fmt.money(T.tripDeduction({ date, miles: draft.miles }, rates)) + ' write-off'
          : 'The IRS rate on this date is ' + fmt.qty(rate) + '¢ a mile.';
      };
      preview();
      NB.app.setGuard(() => dirty);
      if (!existing) form.querySelector('#trip-miles').focus();

      root.oninput = (e) => {
        dirty = true;
        if (e.target.id === 'trip-miles') draft.miles = Math.max(0, NB.ui.num(e.target.value));
        preview();
      };
      root.onchange = () => { dirty = true; preview(); };
      root.onclick = (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'double') {
          draft.miles = Math.round(draft.miles * 2 * 10) / 10;
          form.querySelector('#trip-miles').value = fmt.qtyInput(draft.miles);
          dirty = true;
          preview();
        } else if (b.dataset.act === 'cancel') NB.app.back('expenses', { tab: 'mileage' });
        else if (b.dataset.act === 'more') {
          NB.app.menu(b, [{ label: 'Delete trip', icon: 'trash', danger: true, run: async () => {
            const ok = await NB.ui.confirm({ title: 'Delete this trip?', message: 'It will be removed from your mileage log.', confirm: 'Delete trip', danger: true });
            if (!ok) return;
            await NB.ui.busy(null, async () => {
              dirty = false;
              await NB.store.remove('mileage', existing.id);
              NB.ui.toast('Trip deleted');
              NB.app.go('expenses', { tab: 'mileage' }, { replace: true });
            });
          } }]);
        }
      };
      root.onsubmit = async (e) => {
        e.preventDefault();
        const v = NB.ui.formValues(form);
        const rec = Object.assign(clone(draft), { date: v.date, purpose: (v.purpose || '').trim(), notes: (v.notes || '').trim() });
        if (!Dates.valid(rec.date)) return NB.ui.fieldError(form, 'date', 'Choose the date of the trip.');
        if (!(rec.miles > 0)) return NB.ui.fieldError(form, 'miles', 'Enter the business miles you drove.');
        if (!rec.purpose) return NB.ui.fieldError(form, 'purpose', 'Say where you went and why; the IRS expects it in a mileage log.');
        await NB.ui.busy(form.querySelector('[type="submit"]'), async () => {
          await NB.store.save('mileage', rec);
          dirty = false;
          NB.ui.toast(existing ? 'Trip updated' : 'Trip logged · ' + fmt.money(T.tripDeduction(rec, rates)) + ' write-off');
          NB.app.go('expenses', { tab: 'mileage' }, { replace: true });
        });
      };
    },
  };

  NB.expenses = { expensesCSV, mileageCSV, prepareFile, receiptTiles, hydrate, openReceipt, PAID_WITH };
})(window.NB = window.NB || {});
