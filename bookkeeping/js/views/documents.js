/* n0va Books · views/documents.js
 * Estimates and invoices: the lists, the document page and the editor. */
(function (NB) {
  'use strict';
  NB.views = NB.views || {};
  const { html, raw, out, icon, fmt, link, pill, empty } = NB.ui;
  const { Dates, matches, plural, clone, uid } = NB.util;

  const KIND = {
    estimate: { coll: 'estimates', one: 'estimate', One: 'Estimate', many: 'Estimates' },
    invoice: { coll: 'invoices', one: 'invoice', One: 'Invoice', many: 'Invoices' },
  };

  const FILTERS = {
    invoice: [['all', 'All'], ['collecting', 'Unpaid'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['draft', 'Drafts'], ['void', 'Void']],
    estimate: [['all', 'All'], ['sent', 'Awaiting reply'], ['accepted', 'Accepted'], ['invoiced', 'Invoiced'], ['draft', 'Drafts'], ['closed', 'Declined or expired']],
  };

  const listState = { invoice: { f: 'all', q: '' }, estimate: { f: 'all', q: '' } };

  const kindOf = (p) => (p && p.kind === 'estimate' ? 'estimate' : 'invoice');
  const byNewest = (a, b) => (b.issueDate || '').localeCompare(a.issueDate || '') || (b.seq || 0) - (a.seq || 0);

  function passes(kind, f, st) {
    if (f === 'all') return true;
    if (kind === 'invoice') return f === 'collecting' ? st.collecting : st.key === f;
    if (f === 'closed') return st.key === 'declined' || st.key === 'expired';
    return st.key === f;
  }

  function notFound(kind) {
    return out(html`<div class="page"><div class="empty">
      <span class="empty-mark">${icon('spark')}</span>
      <p class="empty-title">${KIND[kind].One} not found</p>
      <p class="empty-body">It may have been deleted.</p>
      ${link(KIND[kind].coll, {}, 'See all ' + KIND[kind].many.toLowerCase(), 'class="btn btn-quiet"')}</div></div>`);
  }

  // ---------------------------------------------------------------- lists
  function listView(kind) {
    const K = KIND[kind];
    const view = {
      title: K.many,
      render(root) {
        const ls = listState[kind];
        root.innerHTML = out(html`<div class="page">
          <header class="page-head">
            <div><h1>${K.many}</h1><p class="page-sub" data-count></p></div>
            <div class="head-actions">${link('doc-edit', { kind }, html`${icon('plus')}<span>New ${K.one}</span>`, 'class="btn btn-primary"')}</div>
          </header>
          <div class="toolbar">
            <div class="chips" role="group" aria-label="Show" data-chips></div>
            <label class="search">${icon('search')}<input type="search" id="${kind}-search" value="${ls.q}"
              placeholder="Search number, customer or project" aria-label="Search ${K.many.toLowerCase()}" autocomplete="off"></label>
          </div>
          <div data-results></div>
        </div>`);
        root.oninput = (e) => {
          if (e.target.id === kind + '-search') { ls.q = e.target.value; view.update(root); }
        };
        root.onclick = (e) => {
          const chip = e.target.closest('[data-filter]');
          if (chip) { ls.f = chip.dataset.filter; view.update(root); }
        };
        view.update(root);
      },
      update(root) {
        const box = root.querySelector('[data-results]');
        if (!box) return view.render(root);
        const ls = listState[kind];
        const data = NB.store.snapshot();
        const ix = NB.calc.index(data, Dates.today());
        const states = kind === 'invoice' ? ix.inv : ix.est;
        const customers = new Map(data.customers.map((c) => [c.id, c]));
        const docs = data[K.coll].slice().sort(byNewest);

        root.querySelector('[data-chips]').innerHTML = out(FILTERS[kind].map((f) => {
          const n = docs.filter((d) => passes(kind, f[0], states.get(d.id))).length;
          return html`<button type="button" class="chip${ls.f === f[0] ? ' is-on' : ''}" data-filter="${f[0]}" aria-pressed="${ls.f === f[0]}">
            ${f[1]}<span class="chip-n">${n}</span></button>`;
        }));
        root.querySelector('[data-count]').textContent = plural(docs.length, K.one);

        if (!docs.length) {
          box.innerHTML = out(empty('No ' + K.many.toLowerCase() + ' yet',
            kind === 'invoice' ? 'Create an invoice, or turn an accepted estimate into one.' : 'Estimates let customers approve a price (and a deposit) before you start.',
            link('doc-edit', { kind }, 'Create your first ' + K.one, 'class="btn btn-primary"')));
          return;
        }
        const list = docs
          .filter((d) => passes(kind, ls.f, states.get(d.id)))
          .filter((d) => {
            const c = customers.get(d.customerId) || {};
            return matches(ls.q, [d.number, d.title, c.name, c.company]);
          });
        if (!list.length) {
          box.innerHTML = out(empty('Nothing here', 'No ' + K.many.toLowerCase() + ' match this filter or search.'));
          return;
        }
        let sumTotal = 0;
        let sumBalance = 0;
        list.forEach((d) => {
          const st = states.get(d.id);
          if (st.key !== 'void') sumTotal += st.total;
          if (kind === 'invoice' && st.collecting) sumBalance += st.balance;
        });
        box.innerHTML = out(html`<div class="card card-flush"><table class="table table-rows">
          <thead><tr><th>Number</th><th>Customer</th><th>Project</th><th>Issued</th><th>${kind === 'invoice' ? 'Due' : 'Valid until'}</th>
            <th class="num">Total</th>${kind === 'invoice' ? html`<th class="num">Balance</th>` : ''}<th class="num">Status</th></tr></thead>
          <tbody>${list.map((d) => {
            const st = states.get(d.id);
            const c = customers.get(d.customerId);
            const due = kind === 'invoice' ? d.dueDate : d.validUntil;
            return html`<tr data-go="doc" data-kind="${kind}" data-id="${d.id}" class="is-clickable">
              <td data-label="Number">${link('doc', { kind, id: d.id }, d.number, 'class="mono strong"')}</td>
              <td data-label="Customer">${c ? c.name : html`<span class="muted">No customer</span>`}</td>
              <td data-label="Project">${d.title || html`<span class="muted">—</span>`}</td>
              <td data-label="Issued">${fmt.date(d.issueDate)}</td>
              <td data-label="${kind === 'invoice' ? 'Due' : 'Valid until'}">${due ? fmt.date(due) : html`<span class="muted">—</span>`}</td>
              <td data-label="Total" class="num">${fmt.money(st.total)}</td>
              ${kind === 'invoice' ? html`<td data-label="Balance" class="num">${st.collecting ? fmt.money(st.balance) : html`<span class="muted">—</span>`}</td>` : ''}
              <td data-label="Status" class="num">${pill(st.key, st.label)}</td>
            </tr>`;
          })}</tbody>
          <tfoot><tr><td colspan="5">${plural(list.length, K.one)}</td><td class="num">${fmt.money(sumTotal)}</td>
            ${kind === 'invoice' ? html`<td class="num">${fmt.money(sumBalance)}</td>` : ''}<td></td></tr></tfoot>
        </table></div>`);
      },
    };
    return view;
  }

  NB.views.invoices = listView('invoice');
  NB.views.estimates = listView('estimate');

  // ---------------------------------------------------------------- actions
  const now = () => new Date().toISOString();

  async function patch(kind, d, changes, message) {
    await NB.ui.busy(null, async () => {
      await NB.store.save(KIND[kind].coll, Object.assign(clone(d), changes));
      if (message) NB.ui.toast(message);
    });
  }

  async function convert(est) {
    const existing = est.invoiceId && NB.store.get('invoices', est.invoiceId);
    if (existing) { NB.app.go('doc', { kind: 'invoice', id: existing.id }); return; }
    await NB.ui.busy(null, async () => {
      const s = NB.store.settings();
      const today = Dates.today();
      const num = NB.store.peekNumber('invoice');
      const inv = {
        id: uid(), number: num.number, seq: num.seq, customerId: est.customerId, title: est.title,
        issueDate: today, dueDate: Dates.addDays(today, Number(s.docs.invoiceDays) || 0),
        items: clone(est.items || []).map((it) => Object.assign(it, { id: uid() })),
        discountType: est.discountType || 'none', discountPercent: est.discountPercent || 0, discountAmount: est.discountAmount || 0,
        shipping: est.shipping || 0, taxRate: est.taxRate || 0, taxShipping: !!est.taxShipping,
        notes: s.docs.invoiceNotes, paymentLink: s.docs.paymentLink || '', internalNotes: '', status: 'draft', estimateId: est.id,
      };
      await NB.store.save('invoices', inv);
      await NB.store.claimNumber('invoice', num.seq);
      await NB.store.save('estimates', Object.assign(clone(est), { invoiceId: inv.id, status: 'accepted', acceptedAt: est.acceptedAt || now() }));
      NB.ui.toast('Invoice ' + inv.number + ' created from ' + est.number);
      NB.app.go('doc', { kind: 'invoice', id: inv.id });
    });
  }

  async function duplicate(kind, d) {
    await NB.ui.busy(null, async () => {
      const s = NB.store.settings();
      const today = Dates.today();
      const num = NB.store.peekNumber(kind);
      const copy = clone(d);
      ['createdAt', 'updatedAt', 'sentAt', 'acceptedAt', 'declinedAt', 'voidedAt', 'invoiceId', 'estimateId', 'sample'].forEach((k) => delete copy[k]);
      Object.assign(copy, { id: uid(), number: num.number, seq: num.seq, status: 'draft', issueDate: today });
      copy.items = (copy.items || []).map((it) => Object.assign(it, { id: uid() }));
      if (kind === 'invoice') copy.dueDate = Dates.addDays(today, Number(s.docs.invoiceDays) || 0);
      else copy.validUntil = Dates.addDays(today, Number(s.docs.estimateDays) || 0);
      const saved = await NB.store.save(KIND[kind].coll, copy);
      await NB.store.claimNumber(kind, num.seq);
      NB.ui.toast(KIND[kind].One + ' ' + saved.number + ' created as a copy');
      NB.app.go('doc-edit', { kind, id: saved.id }, { replace: false });
    });
  }

  async function voidInvoice(inv) {
    const ok = await NB.ui.confirm({
      title: 'Void ' + inv.number + '?',
      message: 'The invoice keeps its number but no longer counts as owed. Use this instead of deleting an invoice you already sent.',
      confirm: 'Void invoice',
      danger: true,
    });
    if (ok) patch('invoice', inv, { status: 'void', voidedAt: now() }, inv.number + ' voided');
  }

  async function removeDoc(kind, d, paymentCount) {
    if (kind === 'invoice' && paymentCount) {
      NB.ui.modal({
        title: "This invoice can't be deleted",
        body: html`<p class="dlg-text">${d.number} has ${plural(paymentCount, 'payment')} recorded against it. Delete those payments first, or void the invoice to keep the record.</p>`,
        foot: html`<button type="button" class="btn btn-primary" data-close>OK</button>`,
      });
      return;
    }
    const ok = await NB.ui.confirm({
      title: 'Delete ' + d.number + '?',
      message: kind === 'invoice' && d.status !== 'draft'
        ? 'If you already sent this invoice, voiding it keeps a cleaner record. Deleting cannot be undone.'
        : 'This cannot be undone.',
      confirm: 'Delete ' + KIND[kind].one,
      danger: true,
    });
    if (!ok) return;
    await NB.ui.busy(null, async () => {
      await NB.store.remove(KIND[kind].coll, d.id);
      if (kind === 'invoice' && d.estimateId) {
        const est = NB.store.get('estimates', d.estimateId);
        if (est && est.invoiceId === d.id) {
          const e2 = clone(est);
          delete e2.invoiceId;
          await NB.store.save('estimates', e2);
        }
      }
      NB.ui.toast(d.number + ' deleted');
      NB.app.go(KIND[kind].coll, {}, { replace: true });
    });
  }

  // ---------------------------------------------------------------- document page
  function timeline(kind, d, payments) {
    const items = [];
    const day = (ts) => (ts ? fmt.date(String(ts).slice(0, 10)) : '');
    items.push({ when: d.createdAt, text: 'Created' });
    if (d.sentAt) items.push({ when: d.sentAt, text: 'Marked as sent' });
    if (d.acceptedAt) items.push({ when: d.acceptedAt, text: 'Accepted' });
    if (d.declinedAt) items.push({ when: d.declinedAt, text: 'Declined' });
    payments.forEach((p) => items.push({ when: p.date + 'T12:00:00', text: 'Payment of ' + fmt.money(p.amount) }));
    if (d.voidedAt) items.push({ when: d.voidedAt, text: 'Voided' });
    items.sort((a, b) => String(a.when).localeCompare(String(b.when)));
    return html`<ol class="timeline">${items.map((it) => html`<li><span class="tl-dot"></span><span class="tl-text">${it.text}</span><span class="tl-when">${day(it.when)}</span></li>`)}</ol>`;
  }

  NB.views.doc = {
    title(p) {
      const kind = kindOf(p);
      const d = NB.store.get(KIND[kind].coll, p.id);
      return d ? KIND[kind].One + ' ' + d.number : KIND[kind].One;
    },
    render(root, params) {
      const kind = kindOf(params);
      const K = KIND[kind];
      const d = NB.store.get(K.coll, params.id);
      if (!d) { root.innerHTML = notFound(kind); return; }
      const s = NB.store.settings();
      const today = Dates.today();
      const customer = NB.store.get('customers', d.customerId);
      const isInvoice = kind === 'invoice';
      const payments = isInvoice ? NB.store.all('payments').filter((p) => p.invoiceId === d.id).sort((a, b) => a.date.localeCompare(b.date)) : [];
      const state = isInvoice ? NB.calc.invoiceState(d, payments, today) : null;
      const est = isInvoice ? null : NB.calc.estimateState(d, today);
      const st = state || est;
      const t = st.totals;
      const linkedInvoice = !isInvoice && d.invoiceId ? NB.store.get('invoices', d.invoiceId) : null;
      const sourceEstimate = isInvoice && d.estimateId ? NB.store.get('estimates', d.estimateId) : null;
      const ctx = { settings: s, logo: NB.store.logo(), customer, state, estState: est };

      let primary = '';
      if (isInvoice && st.key !== 'void' && st.balance > 0) {
        primary = link('payment-edit', { invoiceId: d.id }, html`${icon('payment')}<span>Record payment</span>`, 'class="btn btn-primary"');
      } else if (!isInvoice && st.key !== 'invoiced' && st.key !== 'declined') {
        primary = html`<button type="button" class="btn btn-primary" data-act="convert">${icon('invoice')}<span>Turn into invoice</span></button>`;
      } else if (linkedInvoice) {
        primary = link('doc', { kind: 'invoice', id: linkedInvoice.id }, html`${icon('invoice')}<span>Open ${linkedInvoice.number}</span>`, 'class="btn btn-primary"');
      }

      root.innerHTML = out(html`<div class="page page-doc">
        ${link(K.coll, {}, html`${icon('back')}<span>${K.many}</span>`, 'class="back-link"')}
        <header class="page-head">
          <div>
            <p class="eyebrow">${pill(st.key, st.label)}</p>
            <h1>${K.One} <span class="mono">${d.number}</span></h1>
            <p class="page-sub">${customer ? link('customer', { id: customer.id }, customer.name) : 'No customer'}${d.title ? ' · ' + d.title : ''}</p>
          </div>
          <div class="head-actions">
            ${d.status === 'draft' && st.key !== 'void' ? html`<button type="button" class="btn btn-quiet" data-act="sent">${icon('send')}<span>Mark as sent</span></button>` : ''}
            ${primary}
          </div>
        </header>

        <div class="doc-toolbar" role="toolbar" aria-label="${K.One} actions">
          <button type="button" class="btn btn-quiet" data-act="pdf">${icon('download')}<span>Download PDF</span></button>
          ${NB.env.canPrint ? html`<button type="button" class="btn btn-quiet" data-act="print">${icon('print')}<span>Print</span></button>` : ''}
          <button type="button" class="btn btn-quiet" data-act="message">${icon('copy')}<span>Message to send</span></button>
          ${link('doc-edit', { kind, id: d.id }, html`${icon('edit')}<span>Edit</span>`, 'class="btn btn-quiet"')}
          <button type="button" class="btn btn-icon btn-quiet" data-act="more" aria-label="More actions" aria-haspopup="menu">${icon('more')}</button>
        </div>

        <div class="doc-layout">
          <div class="doc-paper">${NB.sheet.documentSheet(kind, d, ctx)}</div>
          <aside class="doc-side">
            <section class="card">
              <header class="card-head"><h2>${isInvoice ? 'Balance' : 'Summary'}</h2></header>
              <dl class="facts">
                <div><dt>Total</dt><dd>${fmt.money(t.total)}</dd></div>
                ${isInvoice ? html`
                  <div><dt>Paid</dt><dd>${fmt.money(st.paid)}</dd></div>
                  <div class="facts-key"><dt>${st.balance < 0 ? 'Overpaid' : 'Balance due'}</dt><dd>${fmt.money(Math.abs(st.balance))}</dd></div>
                  <div><dt>Due</dt><dd>${fmt.date(d.dueDate)}${st.collecting ? html` <span class="muted">(${st.key === 'overdue' ? plural(st.daysOverdue, 'day') + ' late' : fmt.relative(st.dueIn)})</span>` : ''}</dd></div>`
                : html`
                  ${t.deposit ? html`<div class="facts-key"><dt>Deposit to start</dt><dd>${fmt.money(t.deposit)}</dd></div>` : ''}
                  <div><dt>Valid until</dt><dd>${fmt.date(d.validUntil)}${st.key === 'sent' && st.expiresIn !== null ? html` <span class="muted">(${fmt.relative(st.expiresIn)})</span>` : ''}</dd></div>`}
              </dl>
              ${!isInvoice && (st.key === 'sent' || st.key === 'expired' || st.key === 'draft') ? html`<div class="side-actions">
                <button type="button" class="btn btn-quiet btn-sm" data-act="accept">${icon('check')}<span>Mark accepted</span></button>
                <button type="button" class="btn btn-quiet btn-sm" data-act="decline">${icon('x')}<span>Mark declined</span></button></div>` : ''}
              ${linkedInvoice ? html`<p class="side-note">Became ${link('doc', { kind: 'invoice', id: linkedInvoice.id }, 'invoice ' + linkedInvoice.number)}.</p>` : ''}
              ${sourceEstimate ? html`<p class="side-note">Created from ${link('doc', { kind: 'estimate', id: sourceEstimate.id }, 'estimate ' + sourceEstimate.number)}.</p>` : ''}
            </section>
            ${isInvoice ? html`<section class="card">
              <header class="card-head"><h2>Payments</h2>${st.balance > 0 && st.key !== 'void' ? link('payment-edit', { invoiceId: d.id }, 'Record', 'class="card-link"') : ''}</header>
              ${payments.length ? html`<ul class="list list-tight">${payments.map((p) => html`<li>${link('payment', { id: p.id }, html`
                <span class="list-main"><span class="list-title">${fmt.money(p.amount)}</span>
                  <span class="list-meta">${fmt.date(p.date)} · ${p.methodName || ''}</span></span>
                <span class="list-side"><span class="mono small">${p.receiptNumber}</span></span>`, 'class="list-link"')}</li>`)}</ul>`
                : html`<p class="muted small">No payments yet. When the customer pays through Square, record it here to issue a receipt.</p>`}
            </section>` : ''}
            <section class="card">
              <header class="card-head"><h2>History</h2></header>
              ${timeline(kind, d, payments)}
            </section>
            ${d.internalNotes ? html`<section class="card"><header class="card-head"><h2>Private notes</h2></header>
              <div class="prose">${NB.sheet.lines(d.internalNotes).map((l) => html`<p>${l}</p>`)}</div></section>` : ''}
          </aside>
        </div>
      </div>`);

      root.onclick = (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const act = b.dataset.act;
        if (act === 'pdf') NB.ui.busy(b, () => NB.pdf.download(kind, d));
        else if (act === 'print') window.print();
        else if (act === 'message') NB.sheet.messageDialog(kind, d, ctx);
        else if (act === 'sent') patch(kind, d, { status: 'sent', sentAt: now() }, d.number + ' marked as sent');
        else if (act === 'convert') convert(d);
        else if (act === 'accept') patch(kind, d, { status: 'accepted', acceptedAt: now() }, d.number + ' accepted');
        else if (act === 'decline') patch(kind, d, { status: 'declined', declinedAt: now() }, d.number + ' declined');
        else if (act === 'more') {
          const items = [
            { label: 'Edit', icon: 'edit', run: () => NB.app.go('doc-edit', { kind, id: d.id }) },
            { label: 'Duplicate', icon: 'copy', run: () => duplicate(kind, d) },
          ];
          if (d.status !== 'draft' && st.key !== 'void' && !(isInvoice && payments.length)) {
            items.push({ label: 'Move back to draft', icon: 'undo', run: () => patch(kind, d, { status: 'draft' }, d.number + ' is a draft again') });
          }
          if (!isInvoice && (st.key === 'accepted' || st.key === 'declined')) {
            items.push({ label: 'Reopen (awaiting reply)', icon: 'undo', run: () => patch(kind, d, { status: 'sent' }, d.number + ' reopened') });
          }
          if (isInvoice && st.key === 'void') items.push({ label: 'Restore invoice', icon: 'undo', run: () => patch(kind, d, { status: 'sent', voidedAt: null }, d.number + ' restored') });
          if (isInvoice && st.key !== 'void') items.push({ label: 'Void invoice', icon: 'ban', run: () => voidInvoice(d) });
          items.push({ sep: true }, { label: 'Delete ' + K.one, icon: 'trash', danger: true, run: () => removeDoc(kind, d, payments.length) });
          NB.app.menu(b, items);
        }
      };
    },
  };

  // ---------------------------------------------------------------- editor
  function blankItem() {
    return { id: uid(), description: '', details: '', qty: 1, unitPrice: 0 };
  }

  function newDoc(kind, s, today, customerId) {
    const num = NB.store.peekNumber(kind);
    const d = {
      id: uid(), number: num.number, seq: num.seq, customerId: customerId || '', title: '', issueDate: today, items: [blankItem()],
      discountType: 'none', discountPercent: 0, discountAmount: 0, shipping: 0, taxRate: Number(s.docs.taxRate) || 0,
      taxShipping: !!s.docs.taxShipping, notes: kind === 'invoice' ? s.docs.invoiceNotes : s.docs.estimateNotes, internalNotes: '', status: 'draft',
    };
    if (kind === 'invoice') Object.assign(d, { dueDate: Dates.addDays(today, Number(s.docs.invoiceDays) || 0), paymentLink: s.docs.paymentLink || '' });
    else Object.assign(d, { validUntil: Dates.addDays(today, Number(s.docs.estimateDays) || 0), depositPercent: Number(s.docs.depositPercent) || 0 });
    return d;
  }

  // Everything you have sold before, newest price first, for the item picker.
  function pastItems() {
    const seen = new Map();
    const docs = NB.store.all('invoices').concat(NB.store.all('estimates')).sort(byNewest);
    docs.forEach((d) => (d.items || []).forEach((it) => {
      const key = (it.description || '').trim().toLowerCase();
      if (key && !seen.has(key)) seen.set(key, it);
    }));
    return Array.from(seen.values()).slice(0, 300);
  }

  function customerOptions(selected) {
    const list = NB.store.all('customers')
      .filter((c) => !c.archived || c.id === selected)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return html`<option value="">Choose a customer…</option>
      ${list.map((c) => html`<option value="${c.id}" ${c.id === selected ? raw('selected') : ''}>${c.name}${c.company ? ' · ' + c.company : ''}</option>`)}`;
  }

  function itemRow(it, i, amount) {
    return html`<div class="item-row" data-row="${i}">
      <div class="item-desc">
        <input class="item-name" data-f="description" list="past-items" value="${it.description}" placeholder="What are you making?"
          aria-label="Item ${i + 1}" autocomplete="off">
        <textarea class="item-details" data-f="details" rows="1" placeholder="Details (optional)" aria-label="Item ${i + 1} details">${it.details || ''}</textarea>
      </div>
      <label class="item-num"><span class="item-label">Qty</span>
        <input class="num" data-f="qty" inputmode="decimal" value="${fmt.qtyInput(it.qty)}" aria-label="Item ${i + 1} quantity" autocomplete="off"></label>
      <label class="item-num"><span class="item-label">Price</span>
        <input class="num" data-f="unitPrice" inputmode="decimal" value="${fmt.input(it.unitPrice)}" aria-label="Item ${i + 1} price" autocomplete="off"></label>
      <div class="item-amount"><span class="item-label">Amount</span><output data-amount="${i}">${fmt.money(amount)}</output></div>
      <button type="button" class="btn btn-icon btn-quiet btn-sm item-remove" data-act="remove-item" aria-label="Remove item ${i + 1}">${icon('x')}</button>
    </div>`;
  }

  NB.views['doc-edit'] = {
    title: (p) => (p.id ? 'Edit ' : 'New ') + KIND[kindOf(p)].one,
    live: false,
    render(root, params) {
      const kind = kindOf(params);
      const K = KIND[kind];
      const isInvoice = kind === 'invoice';
      const s = NB.store.settings();
      const today = Dates.today();
      const existing = params.id ? NB.store.get(K.coll, params.id) : null;
      if (params.id && !existing) { root.innerHTML = notFound(kind); return; }
      const isNew = !existing;
      const draft = existing ? clone(existing) : newDoc(kind, s, today, params.customerId);
      if (!draft.items || !draft.items.length) draft.items = [blankItem()];
      const originalNumber = draft.number;
      const paidSoFar = isInvoice && existing ? NB.calc.paidByInvoice(NB.store.all('payments')).get(existing.id) || 0 : 0;
      const past = pastItems();
      const pastByName = new Map(past.map((it) => [it.description.trim().toLowerCase(), it]));
      let dirty = false;
      const sym = fmt.symbol();

      const terms = [[0, 'On receipt'], [7, '7 days'], [14, '14 days'], [30, '30 days']];

      root.innerHTML = out(html`<div class="page page-editor">
        <button type="button" class="back-link" data-act="cancel">${icon('back')}<span>${existing ? K.One + ' ' + existing.number : K.many}</span></button>
        <header class="page-head">
          <div><h1>${isNew ? 'New ' + K.one : 'Edit ' + K.one + ' ' + existing.number}</h1>
            <p class="page-sub">${isNew ? 'Saved as a draft until you mark it as sent.' : pill(isInvoice ? NB.calc.invoiceState(existing, paidSoFar, today).key : NB.calc.estimateState(existing, today).key,
              isInvoice ? NB.calc.invoiceState(existing, paidSoFar, today).label : NB.calc.estimateState(existing, today).label)}</p></div>
          <div class="head-actions">
            <button type="button" class="btn btn-quiet" data-act="cancel">Cancel</button>
            <button type="submit" form="doc-form" class="btn btn-primary">${icon('check')}<span>Save ${K.one}</span></button>
          </div>
        </header>

        <form id="doc-form" class="editor" novalidate>
          <div class="editor-main">
            <section class="card form">
              <div class="form-grid">
                <div class="field field-wide">
                  <label for="doc-customer">Customer</label>
                  <div class="field-row">
                    <select name="customerId" id="doc-customer">${customerOptions(draft.customerId)}</select>
                    <button type="button" class="btn btn-quiet" data-act="new-customer">${icon('plus')}<span>New</span></button>
                  </div>
                </div>
                <label class="field field-wide"><span>Project or title (optional)</span>
                  <input name="title" id="doc-title" value="${draft.title}" placeholder="Bridal party earrings" autocomplete="off"></label>
                <label class="field"><span>${K.One} number</span>
                  <input name="number" id="doc-number" class="mono" value="${draft.number}" autocomplete="off"></label>
                <label class="field"><span>Issue date</span>
                  <input type="date" name="issueDate" id="doc-issue" value="${draft.issueDate}"></label>
                ${isInvoice ? html`
                  <label class="field"><span>Due date</span><input type="date" name="dueDate" id="doc-due" value="${draft.dueDate}"></label>
                  <div class="field"><span id="terms-label">Payment terms</span>
                    <div class="seg" role="group" aria-labelledby="terms-label">${terms.map((t) => html`<button type="button" data-terms="${t[0]}">${t[1]}</button>`)}</div></div>`
                : html`
                  <label class="field"><span>Valid until</span><input type="date" name="validUntil" id="doc-valid" value="${draft.validUntil}"></label>`}
              </div>
            </section>

            <section class="card">
              <header class="card-head"><h2>Items</h2><p class="card-sub">Start typing to reuse something you've sold before</p></header>
              <div class="items">
                <div class="items-head" aria-hidden="true"><span>Item</span><span class="num">Qty</span><span class="num">Price (${sym})</span><span class="num">Amount</span><span></span></div>
                <div data-items></div>
              </div>
              <button type="button" class="btn btn-quiet add-item" data-act="add-item">${icon('plus')}<span>Add item</span></button>
              <datalist id="past-items">${past.map((it) => html`<option value="${it.description}"></option>`)}</datalist>
            </section>

            <section class="card form">
              <div class="form-grid">
                ${isInvoice ? html`<label class="field field-wide"><span>Square payment link (optional)</span>
                  <input type="url" name="paymentLink" id="doc-link" value="${draft.paymentLink || ''}" placeholder="https://square.link/u/…" autocomplete="off">
                  <span class="hint">Paste a Square payment link for this invoice. It prints as a clickable link and a QR code.</span></label>` : ''}
                <label class="field field-wide"><span>Notes for the customer</span>
                  <textarea name="notes" id="doc-notes" rows="3">${draft.notes || ''}</textarea></label>
                <label class="field field-wide"><span>Private notes (never printed)</span>
                  <textarea name="internalNotes" id="doc-internal" rows="2" placeholder="Materials, supplier order numbers, reminders">${draft.internalNotes || ''}</textarea></label>
              </div>
            </section>
          </div>

          <aside class="editor-side">
            <section class="card totals-card">
              <header class="card-head"><h2>Totals</h2></header>
              <dl class="totals">
                <div><dt>Subtotal</dt><dd data-t="subtotal"></dd></div>
                <div class="totals-control">
                  <dt><label for="doc-discount-type">Discount</label></dt>
                  <dd class="control-pair">
                    <select id="doc-discount-type" name="discountType" aria-label="Discount type">
                      <option value="none" ${draft.discountType === 'none' || !draft.discountType ? raw('selected') : ''}>None</option>
                      <option value="percent" ${draft.discountType === 'percent' ? raw('selected') : ''}>Percent</option>
                      <option value="amount" ${draft.discountType === 'amount' ? raw('selected') : ''}>Amount</option>
                    </select>
                    <input id="doc-discount-value" class="num" inputmode="decimal" aria-label="Discount value" autocomplete="off"
                      value="${draft.discountType === 'amount' ? fmt.input(draft.discountAmount) : draft.discountType === 'percent' ? fmt.qtyInput(draft.discountPercent) : ''}">
                  </dd>
                </div>
                <div class="totals-sub" data-row="discount"><dt></dt><dd data-t="discount"></dd></div>
                <div class="totals-control">
                  <dt><label for="doc-shipping">Shipping (${sym})</label></dt>
                  <dd><input id="doc-shipping" class="num" inputmode="decimal" value="${draft.shipping ? fmt.input(draft.shipping) : ''}" placeholder="0.00" autocomplete="off"></dd>
                </div>
                <div class="totals-control">
                  <dt><label for="doc-tax">${s.docs.taxLabel || 'Tax'} (%)</label></dt>
                  <dd><input id="doc-tax" class="num" inputmode="decimal" value="${draft.taxRate ? fmt.qtyInput(draft.taxRate) : ''}" placeholder="0" autocomplete="off"></dd>
                </div>
                <div class="totals-check"><label class="check"><input type="checkbox" id="doc-tax-shipping" ${draft.taxShipping ? 'checked' : ''}><span>Charge tax on shipping</span></label></div>
                <div class="totals-sub"><dt>${s.docs.taxLabel || 'Tax'}</dt><dd data-t="tax"></dd></div>
                <div class="totals-total"><dt>Total</dt><dd data-t="total"></dd></div>
                ${isInvoice ? (paidSoFar ? html`
                  <div class="totals-sub"><dt>Paid so far</dt><dd>${fmt.money(paidSoFar)}</dd></div>
                  <div class="totals-key"><dt>Balance due</dt><dd data-t="balance"></dd></div>` : '')
                : html`
                  <div class="totals-control">
                    <dt><label for="doc-deposit">Deposit to start (%)</label></dt>
                    <dd><input id="doc-deposit" class="num" inputmode="decimal" value="${draft.depositPercent ? fmt.qtyInput(draft.depositPercent) : ''}" placeholder="0" autocomplete="off"></dd>
                  </div>
                  <div class="totals-key"><dt>Deposit</dt><dd data-t="deposit"></dd></div>`}
              </dl>
            </section>
          </aside>
        </form>
      </div>`);

      const form = root.querySelector('#doc-form');
      const itemsBox = root.querySelector('[data-items]');

      function renderItems(focusIndex) {
        const t = NB.calc.totals(draft);
        itemsBox.innerHTML = out(draft.items.map((it, i) => itemRow(it, i, t.lines[i])));
        itemsBox.querySelectorAll('.item-details').forEach(grow);
        if (focusIndex !== undefined) {
          const el = itemsBox.querySelector('[data-row="' + focusIndex + '"] .item-name');
          if (el) el.focus();
        }
      }

      function recalc() {
        const t = NB.calc.totals(draft);
        t.lines.forEach((amt, i) => {
          const o = itemsBox.querySelector('[data-amount="' + i + '"]');
          if (o) o.textContent = fmt.money(amt);
        });
        const set = (k, v) => { const el = root.querySelector('[data-t="' + k + '"]'); if (el) el.textContent = v; };
        set('subtotal', fmt.money(t.subtotal));
        set('discount', t.discount ? '−' + fmt.money(t.discount) : fmt.money(0));
        set('tax', fmt.money(t.tax));
        set('total', fmt.money(t.total));
        set('deposit', fmt.money(t.deposit));
        set('balance', fmt.money(t.total - paidSoFar));
        const dv = root.querySelector('#doc-discount-value');
        dv.hidden = draft.discountType === 'none' || !draft.discountType;
        dv.placeholder = draft.discountType === 'percent' ? '%' : '0.00';
        root.querySelector('[data-row="discount"]').hidden = !t.discount;
      }

      function grow(ta) {
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight + 2, 200) + 'px';
      }

      renderItems();
      recalc();
      NB.app.setGuard(() => dirty);

      root.oninput = (e) => {
        dirty = true;
        const el = e.target;
        const row = el.closest('[data-row]');
        if (row && el.dataset.f) {
          const it = draft.items[+row.dataset.row];
          const f = el.dataset.f;
          if (f === 'qty') it.qty = NB.ui.num(el.value);
          else if (f === 'unitPrice') { const v = fmt.parse(el.value); it.unitPrice = isNaN(v) ? 0 : v; }
          else it[f] = el.value;
          if (f === 'details') grow(el);
          recalc();
          return;
        }
        if (el.id === 'doc-discount-value') {
          if (draft.discountType === 'percent') draft.discountPercent = NB.ui.num(el.value);
          else { const v = fmt.parse(el.value); draft.discountAmount = isNaN(v) ? 0 : v; }
        } else if (el.id === 'doc-shipping') {
          const v = fmt.parse(el.value); draft.shipping = isNaN(v) ? 0 : Math.max(0, v);
        } else if (el.id === 'doc-tax') draft.taxRate = Math.max(0, NB.ui.num(el.value));
        else if (el.id === 'doc-deposit') draft.depositPercent = Math.min(100, Math.max(0, NB.ui.num(el.value)));
        recalc();
      };

      root.onchange = async (e) => {
        const el = e.target;
        dirty = true;
        if (el.id === 'doc-discount-type') {
          draft.discountType = el.value;
          const dv = root.querySelector('#doc-discount-value');
          dv.value = el.value === 'percent' ? (draft.discountPercent ? fmt.qtyInput(draft.discountPercent) : '') : el.value === 'amount' ? (draft.discountAmount ? fmt.input(draft.discountAmount) : '') : '';
          recalc();
          if (el.value !== 'none') dv.focus();
        } else if (el.id === 'doc-tax-shipping') {
          draft.taxShipping = el.checked;
          recalc();
        } else if (el.dataset.f === 'description') {
          // Picked something sold before: fill in its price and details if those are still empty.
          const row = el.closest('[data-row]');
          const it = draft.items[+row.dataset.row];
          const known = pastByName.get(el.value.trim().toLowerCase());
          if (known) {
            if (!it.unitPrice) {
              it.unitPrice = known.unitPrice || 0;
              row.querySelector('[data-f="unitPrice"]').value = fmt.input(it.unitPrice);
            }
            if (!it.details && known.details) {
              it.details = known.details;
              const ta = row.querySelector('[data-f="details"]');
              ta.value = known.details;
              grow(ta);
            }
            recalc();
          }
        }
      };

      // Tidy number fields when leaving them.
      root._focusout = (e) => {
        const el = e.target;
        const row = el.closest && el.closest('[data-row]');
        if (row && el.dataset.f === 'unitPrice') el.value = fmt.input(draft.items[+row.dataset.row].unitPrice);
        else if (row && el.dataset.f === 'qty') el.value = fmt.qtyInput(draft.items[+row.dataset.row].qty);
        else if (el.id === 'doc-shipping' && el.value) el.value = fmt.input(draft.shipping);
        else if (el.id === 'doc-discount-value' && el.value && draft.discountType === 'amount') el.value = fmt.input(draft.discountAmount);
      };

      root.onclick = async (e) => {
        const b = e.target.closest('[data-act], [data-terms]');
        if (!b) return;
        if (b.dataset.terms !== undefined) {
          const issue = form.querySelector('#doc-issue').value || today;
          form.querySelector('#doc-due').value = Dates.addDays(issue, +b.dataset.terms);
          dirty = true;
          return;
        }
        const act = b.dataset.act;
        if (act === 'add-item') {
          draft.items.push(blankItem());
          renderItems(draft.items.length - 1);
          recalc();
          dirty = true;
        } else if (act === 'remove-item') {
          const i = +b.closest('[data-row]').dataset.row;
          draft.items.splice(i, 1);
          if (!draft.items.length) draft.items.push(blankItem());
          renderItems(Math.min(i, draft.items.length - 1));
          recalc();
          dirty = true;
        } else if (act === 'new-customer') {
          const c = await NB.customers.quickAdd();
          if (c) {
            draft.customerId = c.id;
            form.querySelector('#doc-customer').innerHTML = out(customerOptions(c.id));
            dirty = true;
          }
        } else if (act === 'cancel') {
          if (existing) NB.app.back('doc', { kind, id: existing.id });
          else NB.app.back(K.coll);
        }
      };

      root.onsubmit = async (e) => {
        e.preventDefault();
        const v = NB.ui.formValues(form);
        const rec = Object.assign(clone(draft), {
          customerId: v.customerId,
          title: (v.title || '').trim(),
          number: (v.number || '').trim(),
          issueDate: v.issueDate,
          notes: (v.notes || '').trim(),
          internalNotes: (v.internalNotes || '').trim(),
        });
        if (isInvoice) Object.assign(rec, { dueDate: v.dueDate, paymentLink: (v.paymentLink || '').trim() });
        else rec.validUntil = v.validUntil;
        rec.items = rec.items
          .map((it) => Object.assign(it, { description: (it.description || '').trim(), details: (it.details || '').trim() }))
          .filter((it) => it.description || it.unitPrice);

        if (!rec.customerId) return NB.ui.fieldError(form, 'customerId', 'Choose who this ' + K.one + ' is for, or add a new customer.');
        if (!rec.items.length) {
          NB.ui.toast('Add at least one item with a description or a price.', 'error');
          const first = itemsBox.querySelector('.item-name');
          if (first) first.focus();
          return;
        }
        if (!Dates.valid(rec.issueDate)) return NB.ui.fieldError(form, 'issueDate', 'Choose the date you are issuing this ' + K.one + '.');
        const second = isInvoice ? 'dueDate' : 'validUntil';
        if (!Dates.valid(rec[second])) return NB.ui.fieldError(form, second, isInvoice ? 'Choose when payment is due.' : 'Choose how long this estimate is valid.');
        if (rec[second] < rec.issueDate) return NB.ui.fieldError(form, second, 'This date is before the issue date.');
        if (rec.paymentLink && !/^https?:\/\/\S+$/i.test(rec.paymentLink)) return NB.ui.fieldError(form, 'paymentLink', 'Paste the full link, starting with https://');

        // New documents take the next free number at save time, unless it was edited by hand.
        if (isNew && rec.number === originalNumber) {
          const fresh = NB.store.peekNumber(kind);
          rec.number = fresh.number;
          rec.seq = fresh.seq;
        } else if (rec.number !== originalNumber) {
          if (!rec.number) return NB.ui.fieldError(form, 'number', 'Give this ' + K.one + ' a number.');
          if (NB.store.numberTaken(kind, rec.number, rec.id)) return NB.ui.fieldError(form, 'number', rec.number + ' is already used by another ' + K.one + '.');
          rec.seq = NB.store.seqFromNumber(kind, rec.number);
        }

        await NB.ui.busy(form.ownerDocument.querySelector('[form="doc-form"][type="submit"]'), async () => {
          const saved = await NB.store.save(K.coll, rec);
          if (rec.seq) await NB.store.claimNumber(kind, rec.seq);
          dirty = false;
          NB.ui.toast(K.One + ' ' + saved.number + ' saved');
          NB.app.go('doc', { kind, id: saved.id }, { replace: true });
        });
      };
    },
  };

  NB.documents = { convert, duplicate, KIND };
})(window.NB = window.NB || {});
