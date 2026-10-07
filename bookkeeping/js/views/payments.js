/* n0va Books · views/payments.js
 * Payments: the list, the receipt page and the form for recording a payment
 * (Square or otherwise), with the processing fee worked out from the method's rate. */
(function (NB) {
  'use strict';
  NB.views = NB.views || {};
  const { html, raw, out, icon, fmt, link, pill, empty } = NB.ui;
  const { Dates, matches, plural, clone, uid, Money } = NB.util;

  const listState = { q: '', method: 'all', period: 'all' };

  function periodRange(key, today) {
    const ym = Dates.month(today);
    const y = today.slice(0, 4);
    if (key === 'this-month') return [ym + '-01', ym + '-31'];
    if (key === 'last-month') { const m = Dates.addMonths(ym, -1); return [m + '-01', m + '-31']; }
    if (key === 'this-year') return [y + '-01-01', y + '-12-31'];
    if (key === 'last-year') { const ly = String(+y - 1); return [ly + '-01-01', ly + '-12-31']; }
    if (key === 'last-12') return [Dates.addMonths(ym, -11) + '-01', ym + '-31'];
    return null;
  }

  function feeText(m) {
    if (!m) return '';
    const parts = [];
    if (m.feePercent) parts.push(fmt.qty(m.feePercent) + '%');
    if (m.feeFixed) parts.push(fmt.money(m.feeFixed));
    let s = parts.join(' + ');
    if (m.feeMin) s += (s ? ', ' : '') + 'minimum ' + fmt.money(m.feeMin);
    return s || 'No fee';
  }

  function filtered(data, today) {
    const range = periodRange(listState.period, today);
    const customers = new Map(data.customers.map((c) => [c.id, c]));
    const invoices = new Map(data.invoices.map((i) => [i.id, i]));
    return data.payments
      .filter((p) => !range || (p.date >= range[0] && p.date <= range[1]))
      .filter((p) => listState.method === 'all' || p.methodId === listState.method)
      .filter((p) => matches(listState.q, [p.receiptNumber, p.reference, p.memo, p.methodName,
        (customers.get(p.customerId) || {}).name, (invoices.get(p.invoiceId) || {}).number]))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.receiptSeq || 0) - (a.receiptSeq || 0));
  }

  function exportCSV(list) {
    const customers = new Map(NB.store.all('customers').map((c) => [c.id, c]));
    const invoices = new Map(NB.store.all('invoices').map((i) => [i.id, i]));
    const cur = NB.store.settings().docs.currency;
    const m = (v) => Money.toInput(v, cur);
    return NB.util.csv(list.slice().reverse(), [
      { label: 'Date', value: (p) => p.date },
      { label: 'Receipt', value: (p) => p.receiptNumber },
      { label: 'Customer', value: (p) => (customers.get(p.customerId) || {}).name || '' },
      { label: 'Invoice', value: (p) => (invoices.get(p.invoiceId) || {}).number || '' },
      { label: 'For', value: (p) => p.memo || '' },
      { label: 'Method', value: (p) => p.methodName || '' },
      { label: 'Reference', value: (p) => p.reference || '' },
      { label: 'Amount', value: (p) => m(p.amount) },
      { label: 'Fee', value: (p) => m(p.fee || 0) },
      { label: 'Net', value: (p) => m((p.amount || 0) - (p.fee || 0)) },
    ]);
  }

  // ---------------------------------------------------------------- list
  NB.views.payments = {
    title: 'Payments',
    render(root) {
      const s = NB.store.settings();
      const periods = [['all', 'All time'], ['this-month', 'This month'], ['last-month', 'Last month'], ['last-12', 'Last 12 months'], ['this-year', 'This year'], ['last-year', 'Last year']];
      root.innerHTML = out(html`<div class="page">
        <header class="page-head">
          <div><h1>Payments</h1><p class="page-sub" data-count></p></div>
          <div class="head-actions">
            <button type="button" class="btn btn-quiet" data-act="csv">${icon('download')}<span>Export CSV</span></button>
            ${link('payment-edit', {}, html`${icon('plus')}<span>Record payment</span>`, 'class="btn btn-primary"')}
          </div>
        </header>
        <div class="toolbar">
          <label class="select-inline"><span class="sr-only">Period</span>
            <select id="pay-period">${periods.map((p) => html`<option value="${p[0]}" ${listState.period === p[0] ? raw('selected') : ''}>${p[1]}</option>`)}</select></label>
          <label class="select-inline"><span class="sr-only">Method</span>
            <select id="pay-method"><option value="all">All methods</option>
              ${s.paymentMethods.map((m) => html`<option value="${m.id}" ${listState.method === m.id ? raw('selected') : ''}>${m.name}</option>`)}</select></label>
          <label class="search">${icon('search')}<input type="search" id="pay-search" value="${listState.q}"
            placeholder="Search customer, receipt, invoice or reference" aria-label="Search payments" autocomplete="off"></label>
        </div>
        <div data-results></div>
      </div>`);
      root.oninput = (e) => {
        if (e.target.id === 'pay-search') { listState.q = e.target.value; NB.views.payments.update(root); }
      };
      root.onchange = (e) => {
        if (e.target.id === 'pay-period') { listState.period = e.target.value; NB.views.payments.update(root); }
        if (e.target.id === 'pay-method') { listState.method = e.target.value; NB.views.payments.update(root); }
      };
      root.onclick = (e) => {
        const b = e.target.closest('[data-act="csv"]');
        if (!b) return;
        NB.ui.busy(b, async () => {
          const list = filtered(NB.store.snapshot(), Dates.today());
          if (!list.length) { NB.ui.toast('There are no payments in this view to export.'); return; }
          const ok = await NB.ui.saveFile('payments-' + Dates.today() + '.csv', exportCSV(list), 'text/csv');
          if (ok) NB.ui.toast('Exported ' + plural(list.length, 'payment'));
        });
      };
      NB.views.payments.update(root);
    },
    update(root) {
      const box = root.querySelector('[data-results]');
      if (!box) return NB.views.payments.render(root);
      const data = NB.store.snapshot();
      const today = Dates.today();
      root.querySelector('[data-count]').textContent = plural(data.payments.length, 'payment');
      if (!data.payments.length) {
        box.innerHTML = out(empty('No payments yet', 'Each time a customer pays, through Square, cash or anything else, record it here and send them a receipt.',
          link('payment-edit', {}, 'Record your first payment', 'class="btn btn-primary"')));
        return;
      }
      const list = filtered(data, today);
      const customers = new Map(data.customers.map((c) => [c.id, c]));
      const invoices = new Map(data.invoices.map((i) => [i.id, i]));
      const gross = list.reduce((a, p) => a + (p.amount || 0), 0);
      const fees = list.reduce((a, p) => a + (p.fee || 0), 0);
      box.innerHTML = out(html`
        <section class="kpis kpis-3 kpis-tight" aria-label="Totals for this view">
          <div class="kpi"><p class="kpi-label">Received</p><p class="kpi-value">${fmt.money(gross)}</p><p class="kpi-sub">${plural(list.length, 'payment')}</p></div>
          <div class="kpi"><p class="kpi-label">Processing fees</p><p class="kpi-value">${fmt.money(fees)}</p><p class="kpi-sub">${gross ? fmt.qty(Math.round((fees / gross) * 1000) / 10) + '% of what came in' : '—'}</p></div>
          <div class="kpi"><p class="kpi-label">Net</p><p class="kpi-value">${fmt.money(gross - fees)}</p><p class="kpi-sub">After fees</p></div>
        </section>
        ${list.length ? html`<div class="card card-flush"><table class="table table-rows">
          <thead><tr><th>Date</th><th>Receipt</th><th>Customer</th><th>For</th><th>Method</th><th class="num">Amount</th><th class="num">Fee</th><th class="num">Net</th></tr></thead>
          <tbody>${list.map((p) => {
            const c = customers.get(p.customerId);
            const inv = invoices.get(p.invoiceId);
            return html`<tr data-go="payment" data-id="${p.id}" class="is-clickable">
              <td data-label="Date">${fmt.date(p.date)}</td>
              <td data-label="Receipt">${link('payment', { id: p.id }, p.receiptNumber, 'class="mono strong"')}</td>
              <td data-label="Customer">${c ? c.name : html`<span class="muted">—</span>`}</td>
              <td data-label="For">${inv ? html`<span class="mono">${inv.number}</span>` : p.memo || html`<span class="muted">—</span>`}</td>
              <td data-label="Method">${p.methodName || ''}${p.reference ? html`<span class="cell-sub">${p.reference}</span>` : ''}</td>
              <td data-label="Amount" class="num">${fmt.money(p.amount)}</td>
              <td data-label="Fee" class="num">${p.fee ? fmt.money(p.fee) : html`<span class="muted">—</span>`}</td>
              <td data-label="Net" class="num">${fmt.money((p.amount || 0) - (p.fee || 0))}</td>
            </tr>`;
          })}</tbody>
        </table></div>` : empty('Nothing here', 'No payments match this period, method or search.')}`);
    },
  };

  // ---------------------------------------------------------------- receipt page
  NB.views.payment = {
    title: (p) => { const pay = NB.store.get('payments', p.id); return pay ? 'Receipt ' + pay.receiptNumber : 'Receipt'; },
    render(root, params) {
      const p = NB.store.get('payments', params.id);
      if (!p) {
        root.innerHTML = out(html`<div class="page"><div class="empty"><span class="empty-mark">${icon('spark')}</span>
          <p class="empty-title">Payment not found</p><p class="empty-body">It may have been deleted.</p>
          ${link('payments', {}, 'See all payments', 'class="btn btn-quiet"')}</div></div>`);
        return;
      }
      const s = NB.store.settings();
      const customer = NB.store.get('customers', p.customerId);
      const invoice = NB.store.get('invoices', p.invoiceId);
      const invState = invoice ? NB.calc.invoiceState(invoice, NB.store.all('payments'), Dates.today()) : null;
      const ctx = { settings: s, logo: NB.store.logo(), customer, invoice, invoiceState: invState };
      const method = NB.store.method(p.methodId);

      root.innerHTML = out(html`<div class="page page-doc">
        ${link('payments', {}, html`${icon('back')}<span>Payments</span>`, 'class="back-link"')}
        <header class="page-head">
          <div>
            <p class="eyebrow">${pill('paid', 'Received')}</p>
            <h1>Receipt <span class="mono">${p.receiptNumber}</span></h1>
            <p class="page-sub">${customer ? link('customer', { id: customer.id }, customer.name) : 'No customer'} · ${fmt.date(p.date)}</p>
          </div>
          <div class="head-actions">
            ${invoice ? link('doc', { kind: 'invoice', id: invoice.id }, html`${icon('invoice')}<span>Open ${invoice.number}</span>`, 'class="btn btn-quiet"') : ''}
          </div>
        </header>
        <div class="doc-toolbar" role="toolbar" aria-label="Receipt actions">
          <button type="button" class="btn btn-quiet" data-act="pdf">${icon('download')}<span>Download PDF</span></button>
          ${NB.env.canPrint ? html`<button type="button" class="btn btn-quiet" data-act="print">${icon('print')}<span>Print</span></button>` : ''}
          <button type="button" class="btn btn-quiet" data-act="message">${icon('copy')}<span>Message to send</span></button>
          ${link('payment-edit', { id: p.id }, html`${icon('edit')}<span>Edit</span>`, 'class="btn btn-quiet"')}
          <button type="button" class="btn btn-icon btn-quiet" data-act="more" aria-label="More actions" aria-haspopup="menu">${icon('more')}</button>
        </div>
        <div class="doc-layout">
          <div class="doc-paper">${NB.sheet.receiptSheet(p, ctx)}</div>
          <aside class="doc-side">
            <section class="card">
              <header class="card-head"><h2>For your books</h2></header>
              <dl class="facts">
                <div><dt>Received</dt><dd>${fmt.money(p.amount)}</dd></div>
                <div><dt>Processing fee</dt><dd>${fmt.money(p.fee || 0)}</dd></div>
                <div class="facts-key"><dt>Net</dt><dd>${fmt.money((p.amount || 0) - (p.fee || 0))}</dd></div>
                <div><dt>Method</dt><dd>${p.methodName || ''}</dd></div>
                ${method ? html`<div><dt>Rate</dt><dd>${feeText(method)}</dd></div>` : ''}
                ${p.reference ? html`<div><dt>Reference</dt><dd>${p.reference}</dd></div>` : ''}
              </dl>
              ${invoice && invState ? html`<p class="side-note">Applied to ${link('doc', { kind: 'invoice', id: invoice.id }, invoice.number)}:
                ${invState.balance > 0 ? fmt.money(invState.balance) + ' still due.' : 'paid in full.'}</p>` : ''}
            </section>
            ${p.notes ? html`<section class="card"><header class="card-head"><h2>Private notes</h2></header>
              <div class="prose">${NB.sheet.lines(p.notes).map((l) => html`<p>${l}</p>`)}</div></section>` : ''}
          </aside>
        </div>
      </div>`);

      root.onclick = (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const act = b.dataset.act;
        if (act === 'pdf') NB.ui.busy(b, () => NB.pdf.download('receipt', p));
        else if (act === 'print') window.print();
        else if (act === 'message') NB.sheet.messageDialog('receipt', p, ctx);
        else if (act === 'more') {
          NB.app.menu(b, [
            { label: 'Edit payment', icon: 'edit', run: () => NB.app.go('payment-edit', { id: p.id }) },
            { sep: true },
            { label: 'Delete payment', icon: 'trash', danger: true, run: () => removePayment(p, invoice) },
          ]);
        }
      };
    },
  };

  async function removePayment(p, invoice) {
    const ok = await NB.ui.confirm({
      title: 'Delete receipt ' + p.receiptNumber + '?',
      message: 'The payment of ' + fmt.money(p.amount) + ' will be removed' + (invoice ? ' and ' + invoice.number + ' will show it as unpaid again' : '') +
        '. Delete it only if it was recorded by mistake. Refunds made in Square are not undone here.',
      confirm: 'Delete payment',
      danger: true,
    });
    if (!ok) return;
    await NB.ui.busy(null, async () => {
      await NB.store.remove('payments', p.id);
      NB.ui.toast('Payment ' + p.receiptNumber + ' deleted');
      NB.app.go('payments', {}, { replace: true });
    });
  }

  // ---------------------------------------------------------------- record / edit
  function invoiceOptions(selectedId, excludePaymentId) {
    const today = Dates.today();
    const payments = NB.store.all('payments').filter((p) => p.id !== excludePaymentId);
    const paid = NB.calc.paidByInvoice(payments);
    const customers = new Map(NB.store.all('customers').map((c) => [c.id, c]));
    const groups = new Map();
    NB.store.all('invoices')
      .sort((a, b) => (a.issueDate || '').localeCompare(b.issueDate || ''))
      .forEach((inv) => {
        const st = NB.calc.invoiceState(inv, paid.get(inv.id) || 0, today);
        if (inv.id !== selectedId && (st.key === 'void' || st.balance <= 0)) return;
        const c = customers.get(inv.customerId);
        const key = c ? c.name : 'No customer';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ inv, st });
      });
    const names = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
    return html`<option value="">No invoice (a sale or deposit without one)</option>
      ${names.map((n) => html`<optgroup label="${n}">${groups.get(n).map((g) => html`<option value="${g.inv.id}" ${g.inv.id === selectedId ? raw('selected') : ''}>
        ${g.inv.number}${g.inv.title ? ' · ' + g.inv.title : ''} · ${fmt.money(Math.max(g.st.balance, 0))} due</option>`)}</optgroup>`)}`;
  }

  function customerOptions(selected) {
    const list = NB.store.all('customers').filter((c) => !c.archived || c.id === selected).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return html`<option value="">No customer (walk-up sale)</option>
      ${list.map((c) => html`<option value="${c.id}" ${c.id === selected ? raw('selected') : ''}>${c.name}${c.company ? ' · ' + c.company : ''}</option>`)}`;
  }

  NB.views['payment-edit'] = {
    title: (p) => (p.id ? 'Edit payment' : 'Record payment'),
    live: false,
    render(root, params) {
      const s = NB.store.settings();
      const today = Dates.today();
      const existing = params.id ? NB.store.get('payments', params.id) : null;
      if (params.id && !existing) { root.innerHTML = out(empty('Payment not found', 'It may have been deleted.')); return; }
      const methods = s.paymentMethods;
      const firstSquare = methods.find((m) => /square/i.test(m.name)) || methods[0];
      const draft = existing ? clone(existing) : {
        id: uid(), date: today, amount: 0, methodId: firstSquare ? firstSquare.id : '', reference: '', fee: 0,
        customerId: params.customerId || '', invoiceId: params.invoiceId || '', memo: '', notes: '',
      };
      let feeAuto = !existing || (existing.fee || 0) === NB.calc.feeFor(NB.store.method(existing.methodId), existing.amount);
      let dirty = false;

      const otherPaid = (invoiceId) => NB.store.all('payments').filter((p) => p.invoiceId === invoiceId && p.id !== draft.id).reduce((a, p) => a + (p.amount || 0), 0);
      const invInfo = (invoiceId) => {
        const inv = NB.store.get('invoices', invoiceId);
        if (!inv) return null;
        const t = NB.calc.totals(inv);
        const before = t.total - otherPaid(inv.id);
        const est = inv.estimateId ? NB.store.get('estimates', inv.estimateId) : null;
        const deposit = est && !otherPaid(inv.id) ? NB.calc.totals(est).deposit : 0;
        return { inv, total: t.total, before, deposit };
      };

      if (!existing && draft.invoiceId) {
        const info = invInfo(draft.invoiceId);
        if (info) {
          draft.customerId = info.inv.customerId;
          draft.amount = Math.max(info.before, 0);
        } else draft.invoiceId = '';
      }
      if (!existing) draft.fee = NB.calc.feeFor(NB.store.method(draft.methodId), draft.amount);

      root.innerHTML = out(html`<div class="page page-editor">
        <button type="button" class="back-link" data-act="cancel">${icon('back')}<span>${existing ? 'Receipt ' + existing.receiptNumber : 'Payments'}</span></button>
        <header class="page-head">
          <div><h1>${existing ? 'Edit payment' : 'Record a payment'}</h1>
            <p class="page-sub">${existing ? 'Receipt ' + existing.receiptNumber : 'Saving issues a receipt you can download or send.'}</p></div>
          <div class="head-actions">
            <button type="button" class="btn btn-quiet" data-act="cancel">Cancel</button>
            <button type="submit" form="pay-form" class="btn btn-primary">${icon('check')}<span>${existing ? 'Save payment' : 'Save and issue receipt'}</span></button>
          </div>
        </header>
        <form id="pay-form" class="editor" novalidate>
          <div class="editor-main">
            <section class="card form">
              <div class="form-grid">
                <label class="field field-wide"><span>Invoice</span>
                  <select name="invoiceId" id="pay-invoice">${invoiceOptions(draft.invoiceId, draft.id)}</select></label>
                <div class="field field-wide" data-customer-field>
                  <label for="pay-customer">Customer</label>
                  <div class="field-row">
                    <select name="customerId" id="pay-customer">${customerOptions(draft.customerId)}</select>
                    <button type="button" class="btn btn-quiet" data-act="new-customer">${icon('plus')}<span>New</span></button>
                  </div>
                </div>
                <label class="field"><span>Date received</span><input type="date" name="date" id="pay-date" value="${draft.date}"></label>
                <div class="field">
                  <label for="pay-amount">Amount received</label>
                  <input name="amount" id="pay-amount" class="num" inputmode="decimal" value="${draft.amount ? fmt.input(draft.amount) : ''}" placeholder="0.00" autocomplete="off">
                  <div class="quick" data-quick></div>
                </div>
                <label class="field"><span>Paid by</span>
                  <select name="methodId" id="pay-method">${methods.map((m) => html`<option value="${m.id}" ${m.id === draft.methodId ? raw('selected') : ''}>${m.name}</option>`)}</select></label>
                <label class="field"><span>Square receipt or transaction ID</span>
                  <input name="reference" id="pay-ref" value="${draft.reference || ''}" placeholder="Optional, helps you match it later" autocomplete="off"></label>
                <div class="field">
                  <label for="pay-fee">Processing fee</label>
                  <input name="fee" id="pay-fee" class="num" inputmode="decimal" value="${fmt.input(draft.fee || 0)}" autocomplete="off">
                  <span class="hint" data-fee-hint></span>
                </div>
                <label class="field field-wide"><span>What it was for (printed on the receipt)</span>
                  <input name="memo" id="pay-memo" value="${draft.memo || ''}" placeholder="Deposit, balance, market custom order…" autocomplete="off"></label>
                <label class="field field-wide"><span>Private notes (never printed)</span>
                  <textarea name="notes" id="pay-notes" rows="2">${draft.notes || ''}</textarea></label>
              </div>
            </section>
          </div>
          <aside class="editor-side">
            <section class="card totals-card">
              <header class="card-head"><h2>Summary</h2></header>
              <dl class="totals" data-summary></dl>
              <p class="hint">Fees are estimates from the rate in Settings. Your Square dashboard shows the exact fee for each payment.</p>
            </section>
          </aside>
        </form>
      </div>`);

      const form = root.querySelector('#pay-form');
      const $ = (sel) => root.querySelector(sel);

      function sync() {
        const info = draft.invoiceId ? invInfo(draft.invoiceId) : null;
        $('[data-customer-field]').hidden = !!info;
        const method = NB.store.method(draft.methodId);
        if (feeAuto) {
          draft.fee = NB.calc.feeFor(method, draft.amount);
          const feeEl = $('#pay-fee');
          if (document.activeElement !== feeEl) feeEl.value = fmt.input(draft.fee);
        }
        $('[data-fee-hint]').innerHTML = out(feeAuto
          ? html`Estimated at ${feeText(method)}.`
          : html`Entered by hand. <button type="button" class="linkish" data-act="refee">Use ${feeText(method)}</button>`);
        const quick = [];
        if (info && info.before > 0) quick.push(html`<button type="button" class="chip chip-sm" data-amount="${info.before}">Full balance ${fmt.money(info.before)}</button>`);
        if (info && info.deposit > 0 && info.deposit < info.before) quick.push(html`<button type="button" class="chip chip-sm" data-amount="${info.deposit}">Deposit ${fmt.money(info.deposit)}</button>`);
        $('[data-quick]').innerHTML = out(quick);
        const after = info ? info.before - draft.amount : null;
        $('[data-summary]').innerHTML = out(html`
          <div><dt>Amount</dt><dd>${fmt.money(draft.amount)}</dd></div>
          <div><dt>Processing fee</dt><dd>−${fmt.money(draft.fee || 0)}</dd></div>
          <div class="totals-total"><dt>You keep</dt><dd>${fmt.money(draft.amount - (draft.fee || 0))}</dd></div>
          ${info ? html`
            <div class="totals-sub"><dt>${info.inv.number} balance before</dt><dd>${fmt.money(info.before)}</dd></div>
            <div class="totals-key"><dt>${after < 0 ? 'Overpaid by' : 'Balance after'}</dt><dd>${fmt.money(Math.abs(after))}</dd></div>` : ''}`);
      }

      sync();
      NB.app.setGuard(() => dirty);

      root.oninput = (e) => {
        dirty = true;
        const el = e.target;
        if (el.id === 'pay-amount') {
          const v = fmt.parse(el.value);
          draft.amount = isNaN(v) ? 0 : v;
          sync();
        } else if (el.id === 'pay-fee') {
          const v = fmt.parse(el.value);
          draft.fee = isNaN(v) ? 0 : Math.max(0, v);
          feeAuto = false;
          sync();
        }
      };
      root.onchange = (e) => {
        dirty = true;
        const el = e.target;
        if (el.id === 'pay-invoice') {
          draft.invoiceId = el.value;
          const info = el.value ? invInfo(el.value) : null;
          if (info) {
            draft.customerId = info.inv.customerId;
            $('#pay-customer').innerHTML = out(customerOptions(draft.customerId));
            if (!draft.amount || !existing) {
              draft.amount = Math.max(info.before, 0);
              $('#pay-amount').value = fmt.input(draft.amount);
            }
          }
          sync();
        } else if (el.id === 'pay-customer') {
          draft.customerId = el.value;
        } else if (el.id === 'pay-method') {
          draft.methodId = el.value;
          sync();
        }
      };
      root._focusout = (e) => {
        if (e.target.id === 'pay-amount' && e.target.value) e.target.value = fmt.input(draft.amount);
        if (e.target.id === 'pay-fee') e.target.value = fmt.input(draft.fee || 0);
      };
      root.onclick = async (e) => {
        const q = e.target.closest('[data-amount]');
        if (q) {
          draft.amount = +q.dataset.amount;
          $('#pay-amount').value = fmt.input(draft.amount);
          dirty = true;
          sync();
          return;
        }
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'refee') { feeAuto = true; sync(); }
        else if (b.dataset.act === 'new-customer') {
          const c = await NB.customers.quickAdd();
          if (c) { draft.customerId = c.id; $('#pay-customer').innerHTML = out(customerOptions(c.id)); dirty = true; }
        } else if (b.dataset.act === 'cancel') {
          if (existing) NB.app.back('payment', { id: existing.id });
          else NB.app.back('payments');
        }
      };
      root.onsubmit = async (e) => {
        e.preventDefault();
        const v = NB.ui.formValues(form);
        const method = NB.store.method(v.methodId);
        const rec = Object.assign(clone(draft), {
          date: v.date,
          methodId: v.methodId,
          methodName: method ? method.name : draft.methodName || '',
          reference: (v.reference || '').trim(),
          memo: (v.memo || '').trim(),
          notes: (v.notes || '').trim(),
          invoiceId: v.invoiceId || null,
          customerId: v.invoiceId ? (NB.store.get('invoices', v.invoiceId) || {}).customerId || null : v.customerId || null,
        });
        if (!(rec.amount > 0)) return NB.ui.fieldError(form, 'amount', 'Enter the amount you received.');
        if (!Dates.valid(rec.date)) return NB.ui.fieldError(form, 'date', 'Choose the date you were paid.');
        if (rec.fee > rec.amount) return NB.ui.fieldError(form, 'fee', 'The fee is larger than the payment.');
        await NB.ui.busy(document.querySelector('[form="pay-form"][type="submit"]'), async () => {
          if (!existing) {
            const num = NB.store.peekNumber('receipt');
            rec.receiptNumber = num.number;
            rec.receiptSeq = num.seq;
          }
          const saved = await NB.store.save('payments', rec);
          if (!existing) await NB.store.claimNumber('receipt', saved.receiptSeq);
          dirty = false;
          NB.ui.toast(existing ? 'Payment updated' : 'Payment recorded · receipt ' + saved.receiptNumber);
          NB.app.go('payment', { id: saved.id }, { replace: true });
        });
      };
    },
  };

  NB.payments = { feeText, exportCSV };
})(window.NB = window.NB || {});
