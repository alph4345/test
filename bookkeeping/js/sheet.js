/* n0va Books · sheet.js
 * Estimates, invoices and receipts as paper sheets (screen preview and print),
 * plus the QR code for a payment link and the ready-to-send messages. */
(function (NB) {
  'use strict';
  const { html, raw, fmt } = NB.ui;
  const { firstName } = NB.util;

  function lines(text) {
    return String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }

  function customerAddress(c) {
    if (!c) return [];
    const cityLine = [c.city, [c.region, c.postal].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return [c.address1, c.address2, cityLine, c.country].filter(Boolean);
  }

  // QR code as an SVG path (one subpath per run of dark modules).
  function qrSVG(text, cls) {
    if (!text || typeof globalThis.qrcode !== 'function') return '';
    let qr;
    try {
      qr = globalThis.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
    } catch (e) {
      return '';
    }
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!qr.isDark(r, c)) { c++; continue; }
        const start = c;
        while (c < n && qr.isDark(r, c)) c++;
        d += 'M' + (start + 2) + ' ' + (r + 2) + 'h' + (c - start) + 'v1h-' + (c - start) + 'z';
      }
    }
    const size = n + 4;
    return '<svg class="' + (cls || 'qr') + '" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="QR code for the payment link" shape-rendering="crispEdges">' +
      '<rect width="' + size + '" height="' + size + '" fill="#ffffff"/><path fill="#1d1838" d="' + d + '"/></svg>';
  }

  function qrMatrix(text) {
    if (!text || typeof globalThis.qrcode !== 'function') return null;
    try {
      const qr = globalThis.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr;
    } catch (e) {
      return null;
    }
  }

  function fromBlock(s) {
    const b = s.business;
    return html`<div class="sh-party">
      <div class="sh-label">From</div>
      <div class="sh-strong">${b.name}</div>
      ${b.owner ? html`<div>${b.owner}</div>` : ''}
      ${lines(b.address).map((l) => html`<div>${l}</div>`)}
      ${b.email ? html`<div>${b.email}</div>` : ''}
      ${b.phone ? html`<div>${b.phone}</div>` : ''}
      ${b.website ? html`<div>${b.website}</div>` : ''}
      ${b.taxId ? html`<div class="sh-muted">Tax ID ${b.taxId}</div>` : ''}
    </div>`;
  }

  function toBlock(label, c) {
    if (!c) return html`<div class="sh-party"><div class="sh-label">${label}</div><div class="sh-muted">No customer</div></div>`;
    return html`<div class="sh-party">
      <div class="sh-label">${label}</div>
      <div class="sh-strong">${c.name}</div>
      ${c.company ? html`<div>${c.company}</div>` : ''}
      ${customerAddress(c).map((l) => html`<div>${l}</div>`)}
      ${c.email ? html`<div>${c.email}</div>` : ''}
      ${c.phone ? html`<div>${c.phone}</div>` : ''}
    </div>`;
  }

  function head(s, logo, kindLabel, number) {
    return html`<header class="sh-head">
      <div class="sh-brand">${raw(NB.brand.lockup(s, logo, 'sheet'))}</div>
      <div class="sh-title">
        <div class="sh-kind">${kindLabel}</div>
        <div class="sh-num">${number || ''}</div>
      </div>
    </header>`;
  }

  function stamp(text, tone) {
    return html`<div class="sh-stamp sh-stamp-${tone}" aria-hidden="true">${text}</div>`;
  }

  function foot(s) {
    return s.brand.footer ? html`<footer class="sh-foot">${s.brand.footer}</footer>` : '';
  }

  // Estimate or invoice.
  function documentSheet(kind, d, ctx) {
    const s = ctx.settings;
    const t = NB.calc.totals(d);
    const isInvoice = kind === 'invoice';
    const state = ctx.state;
    // Offer the payment link only while something is still owed.
    const link = isInvoice && (!state || (state.balance > 0 && state.key !== 'void')) ? d.paymentLink || '' : '';
    const meta = isInvoice
      ? [['Issued', fmt.date(d.issueDate)], ['Due', fmt.date(d.dueDate)]]
      : [['Issued', fmt.date(d.issueDate)], ['Valid until', fmt.date(d.validUntil)]];
    const headline = isInvoice
      ? ['Balance due', fmt.money(state ? Math.max(state.balance, 0) : t.total)]
      : [t.deposit ? 'Deposit to start' : 'Estimate total', fmt.money(t.deposit || t.total)];
    const taxLabel = (s.docs.taxLabel || 'Tax') + (t.taxRate ? ' (' + fmt.qty(t.taxRate) + '%)' : '');

    const rows = (d.items || []).map((it, i) => html`<tr>
      <td><div class="sh-item">${it.description || 'Item'}</div>${it.details ? html`<div class="sh-item-detail">${it.details}</div>` : ''}</td>
      <td class="num">${fmt.qty(it.qty)}</td>
      <td class="num">${fmt.money(it.unitPrice)}</td>
      <td class="num">${fmt.money(t.lines[i])}</td>
    </tr>`);

    const totalRows = [];
    totalRows.push(['Subtotal', fmt.money(t.subtotal)]);
    if (t.discount) totalRows.push([d.discountType === 'percent' ? 'Discount (' + fmt.qty(d.discountPercent) + '%)' : 'Discount', '−' + fmt.money(t.discount)]);
    if (t.shipping) totalRows.push(['Shipping', fmt.money(t.shipping)]);
    if (t.tax || t.taxRate) totalRows.push([taxLabel, fmt.money(t.tax)]);

    let stampEl = '';
    if (isInvoice && state) {
      if (state.key === 'paid') stampEl = stamp('Paid', 'good');
      else if (state.key === 'void') stampEl = stamp('Void', 'muted');
    } else if (!isInvoice && ctx.estState && (ctx.estState.key === 'accepted' || ctx.estState.key === 'invoiced')) {
      stampEl = stamp('Accepted', 'good');
    }

    return html`<article class="sheet sheet-${kind}">
      ${stampEl}
      ${head(s, ctx.logo, isInvoice ? 'Invoice' : 'Estimate', d.number)}
      <section class="sh-parties">
        ${fromBlock(s)}
        ${toBlock(isInvoice ? 'Bill to' : 'Prepared for', ctx.customer)}
        <dl class="sh-meta">
          ${meta.map((m) => html`<div><dt>${m[0]}</dt><dd>${m[1]}</dd></div>`)}
          <div class="sh-meta-key"><dt>${headline[0]}</dt><dd>${headline[1]}</dd></div>
        </dl>
      </section>
      ${d.title ? html`<p class="sh-project"><span class="sh-label">Project</span>${d.title}</p>` : ''}
      <table class="sh-items">
        <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>
        <tbody>${rows.length ? rows : html`<tr><td colspan="4" class="sh-muted">No items yet</td></tr>`}</tbody>
      </table>
      <section class="sh-bottom">
        <div class="sh-notes">
          ${link ? html`<div class="sh-pay">
            ${raw(qrSVG(link, 'sh-qr'))}
            <div><div class="sh-label">Pay online with Square</div>
              <div class="sh-link">${link}</div>
              ${s.docs.paymentInstructions ? html`<div class="sh-muted">${s.docs.paymentInstructions}</div>` : ''}</div>
          </div>` : isInvoice && s.docs.paymentInstructions ? html`<div class="sh-note"><div class="sh-label">How to pay</div><p>${s.docs.paymentInstructions}</p></div>` : ''}
          ${d.notes ? html`<div class="sh-note"><div class="sh-label">Notes</div>${lines(d.notes).map((l) => html`<p>${l}</p>`)}</div>` : ''}
        </div>
        <dl class="sh-totals">
          ${totalRows.map((r) => html`<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`)}
          <div class="sh-total"><dt>Total</dt><dd>${fmt.money(t.total)}</dd></div>
          ${isInvoice && state && state.paid ? html`<div><dt>Paid</dt><dd>−${fmt.money(state.paid)}</dd></div>
            <div class="sh-total sh-balance"><dt>${state.balance < 0 ? 'Credit' : 'Balance due'}</dt><dd>${fmt.money(Math.abs(state.balance))}</dd></div>` : ''}
          ${!isInvoice && t.deposit ? html`<div class="sh-deposit"><dt>Deposit to start (${fmt.qty(t.depositPercent)}%)</dt><dd>${fmt.money(t.deposit)}</dd></div>` : ''}
        </dl>
      </section>
      ${foot(s)}
    </article>`;
  }

  function receiptSheet(p, ctx) {
    const s = ctx.settings;
    const inv = ctx.invoice;
    const st = ctx.invoiceState;
    return html`<article class="sheet sheet-receipt">
      ${stamp('Received', 'good')}
      ${head(s, ctx.logo, 'Receipt', p.receiptNumber)}
      <section class="sh-received">
        <div class="sh-label">Payment received</div>
        <div class="sh-amount">${fmt.money(p.amount)}</div>
        <div class="sh-muted">${fmt.date(p.date, { year: 'numeric', month: 'long', day: 'numeric' })} · ${p.methodName || 'Payment'}</div>
      </section>
      <section class="sh-parties">
        ${toBlock('Received from', ctx.customer)}
        ${fromBlock(s)}
      </section>
      <dl class="sh-facts">
        ${inv ? html`<div><dt>Applied to</dt><dd>Invoice ${inv.number}${inv.title ? ' · ' + inv.title : ''}</dd></div>` : ''}
        ${p.memo ? html`<div><dt>For</dt><dd>${p.memo}</dd></div>` : ''}
        ${p.reference ? html`<div><dt>Reference</dt><dd>${p.reference}</dd></div>` : ''}
        ${inv && st ? html`<div><dt>Invoice total</dt><dd>${fmt.money(st.total)}</dd></div>
          <div><dt>Paid to date</dt><dd>${fmt.money(st.paid)}</dd></div>
          <div class="sh-facts-key"><dt>${st.balance < 0 ? 'Credit' : 'Balance remaining'}</dt><dd>${fmt.money(Math.abs(st.balance))}</dd></div>` : ''}
      </dl>
      ${s.docs.receiptNote ? html`<p class="sh-note sh-muted">${s.docs.receiptNote}</p>` : ''}
      ${foot(s)}
    </article>`;
  }

  // ---------------------------------------------------------------- messages
  function signature(s) {
    return [s.business.owner, s.business.name].filter(Boolean).join('\n');
  }

  function message(kind, rec, ctx) {
    const s = ctx.settings;
    const c = ctx.customer;
    const hi = 'Hi ' + (c ? firstName(c.name) : 'there') + ',';
    let subject = '';
    let body = '';
    if (kind === 'invoice') {
      const st = ctx.state;
      subject = 'Invoice ' + rec.number + ' from ' + s.business.name;
      body = hi + '\n\nHere is invoice ' + rec.number + (rec.title ? ' for ' + rec.title : '') + ': ' +
        fmt.money(st ? st.balance : NB.calc.totals(rec).total) + (st && st.paid ? ' left to pay' : '') + ', due ' + fmt.date(rec.dueDate) + '.\n';
      if (rec.paymentLink) body += '\nYou can pay securely online with Square here:\n' + rec.paymentLink + '\n';
      body += '\nThank you so much for supporting handmade!\n\n' + signature(s);
    } else if (kind === 'estimate') {
      const t = NB.calc.totals(rec);
      subject = 'Estimate ' + rec.number + ' from ' + s.business.name;
      body = hi + '\n\nHere is estimate ' + rec.number + (rec.title ? ' for ' + rec.title : '') + ': ' + fmt.money(t.total) + '.';
      if (t.deposit) body += ' A ' + fmt.qty(t.depositPercent) + '% deposit (' + fmt.money(t.deposit) + ') gets your piece started.';
      if (rec.validUntil) body += ' This estimate is good until ' + fmt.date(rec.validUntil) + '.';
      body += '\n\nJust reply to let me know if you would like to go ahead, or if you want to change anything.\n\n' + signature(s);
    } else {
      const st = ctx.invoiceState;
      subject = 'Receipt ' + rec.receiptNumber + ' from ' + s.business.name;
      body = hi + '\n\nThank you! I received your payment of ' + fmt.money(rec.amount) + ' on ' + fmt.date(rec.date) +
        (ctx.invoice ? ' for invoice ' + ctx.invoice.number : rec.memo ? ' for ' + rec.memo : '') + '. Your receipt number is ' + rec.receiptNumber + '.';
      if (st && st.balance > 0) body += ' The remaining balance is ' + fmt.money(st.balance) + '.';
      if (st && st.balance <= 0 && ctx.invoice) body += ' That invoice is now paid in full.';
      body += '\n\n' + signature(s);
    }
    return { to: c ? c.email || '' : '', subject, body };
  }

  // Dialog with the message ready to copy (and an email link where that works).
  function messageDialog(kind, rec, ctx) {
    const m = message(kind, rec, ctx);
    const mailto = 'mailto:' + encodeURIComponent(m.to) + '?subject=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.body);
    NB.ui.modal({
      title: 'Message for ' + (ctx.customer ? ctx.customer.name : 'your customer'),
      wide: true,
      body: html`<div class="msg">
        <div class="msg-row"><span class="msg-label">To</span><span class="msg-value">${m.to || 'No email saved for this customer'}</span></div>
        <div class="msg-row"><span class="msg-label">Subject</span><span class="msg-value">${m.subject}</span></div>
        <label class="field"><span>Message</span><textarea id="msg-body" rows="11">${m.body}</textarea></label>
        <p class="hint">Download the PDF too, then attach it to your email or text.</p>
      </div>`,
      foot: html`${m.to && !NB.env.hosted ? html`<a class="btn btn-quiet" href="${mailto}">${NB.ui.icon('mail')} Open in email app</a>` : ''}
        <button type="button" class="btn btn-quiet" data-copy-subject>Copy subject</button>
        <button type="button" class="btn btn-primary" data-copy-body>${NB.ui.icon('copy')} Copy message</button>`,
      onMount(el) {
        el.querySelector('[data-copy-subject]').addEventListener('click', async () => {
          NB.ui.toast((await NB.ui.copyText(m.subject)) ? 'Subject copied' : 'Select the subject and copy it');
        });
        el.querySelector('[data-copy-body]').addEventListener('click', async () => {
          const text = el.querySelector('#msg-body').value;
          if (await NB.ui.copyText(text)) NB.ui.toast('Message copied');
          else {
            el.querySelector('#msg-body').select();
            NB.ui.toast('Press Ctrl+C (or ⌘C) to copy the selected message');
          }
        });
      },
    });
  }

  NB.sheet = { documentSheet, receiptSheet, qrSVG, qrMatrix, message, messageDialog, customerAddress, lines };
})(window.NB = window.NB || {});
