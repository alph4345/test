/* n0va Books · calc.js
 * Pure bookkeeping math: document totals, invoice and estimate status,
 * processing fees and monthly rollups. No DOM, no storage. */
(function (NB) {
  'use strict';
  const { roundMinor, clamp, Dates } = NB.util;

  function lineAmount(item) {
    return roundMinor((Number(item && item.qty) || 0) * (Number(item && item.unitPrice) || 0));
  }

  // Totals for an estimate or invoice. Discount comes off the items; tax applies to the
  // discounted items (plus shipping when taxShipping is on); a deposit is a share of the total.
  function totals(doc) {
    const items = (doc && doc.items) || [];
    const lines = items.map(lineAmount);
    const subtotal = lines.reduce((a, b) => a + b, 0);

    let discount = 0;
    if (doc.discountType === 'percent') {
      discount = roundMinor((subtotal * clamp(Number(doc.discountPercent) || 0, 0, 100)) / 100);
    } else if (doc.discountType === 'amount') {
      discount = Math.round(Number(doc.discountAmount) || 0);
    }
    discount = clamp(discount, 0, Math.max(subtotal, 0));

    const afterDiscount = subtotal - discount;
    const shipping = Math.max(0, Math.round(Number(doc.shipping) || 0));
    const taxRate = Math.max(0, Number(doc.taxRate) || 0);
    const taxable = Math.max(0, afterDiscount + (doc.taxShipping ? shipping : 0));
    const tax = roundMinor((taxable * taxRate) / 100);
    const total = afterDiscount + shipping + tax;
    const depositPercent = clamp(Number(doc.depositPercent) || 0, 0, 100);
    const deposit = depositPercent ? roundMinor((total * depositPercent) / 100) : 0;

    return { lines, subtotal, discount, afterDiscount, shipping, taxRate, taxable, tax, total, depositPercent, deposit };
  }

  function paidByInvoice(payments) {
    const map = new Map();
    for (const p of payments || []) {
      if (!p.invoiceId) continue;
      map.set(p.invoiceId, (map.get(p.invoiceId) || 0) + (Math.round(p.amount) || 0));
    }
    return map;
  }

  const INVOICE_LABELS = {
    draft: 'Draft',
    open: 'Unpaid',
    partial: 'Partly paid',
    overdue: 'Overdue',
    paid: 'Paid',
    void: 'Void',
  };

  // `paid` is either the amount already paid or the list of all payments.
  function invoiceState(inv, paid, today) {
    const t = totals(inv);
    const paidAmount = typeof paid === 'number' ? paid : paidByInvoice(paid).get(inv.id) || 0;
    const balance = t.total - paidAmount;
    let key;
    if (inv.status === 'void') key = 'void';
    else if (inv.status === 'draft' && paidAmount === 0) key = 'draft';
    else if (balance <= 0) key = 'paid';
    else if (inv.dueDate && today > inv.dueDate) key = 'overdue';
    else if (paidAmount > 0) key = 'partial';
    else key = 'open';
    return {
      key,
      label: INVOICE_LABELS[key],
      totals: t,
      total: t.total,
      paid: paidAmount,
      balance: key === 'void' ? 0 : balance,
      daysOverdue: key === 'overdue' ? Dates.diff(inv.dueDate, today) : 0,
      dueIn: inv.dueDate ? Dates.diff(today, inv.dueDate) : null,
      collecting: key === 'open' || key === 'partial' || key === 'overdue',
    };
  }

  const ESTIMATE_LABELS = {
    draft: 'Draft',
    sent: 'Awaiting reply',
    accepted: 'Accepted',
    declined: 'Declined',
    expired: 'Expired',
    invoiced: 'Invoiced',
  };

  function estimateState(est, today) {
    let key;
    if (est.invoiceId) key = 'invoiced';
    else if (est.status === 'accepted' || est.status === 'declined' || est.status === 'draft') key = est.status;
    else if (est.validUntil && today > est.validUntil) key = 'expired';
    else key = 'sent';
    const t = totals(est);
    return {
      key,
      label: ESTIMATE_LABELS[key],
      totals: t,
      total: t.total,
      expiresIn: est.validUntil ? Dates.diff(today, est.validUntil) : null,
    };
  }

  // Processing fee for a payment: percent + fixed, never below the method's minimum.
  // feeFixed and feeMin are minor units.
  function feeFor(method, amount) {
    if (!method || !(amount > 0)) return 0;
    const pct = Number(method.feePercent) || 0;
    const fixed = Math.round(Number(method.feeFixed) || 0);
    const min = Math.round(Number(method.feeMin) || 0);
    if (!pct && !fixed && !min) return 0;
    return Math.min(amount, Math.max(roundMinor((amount * pct) / 100) + fixed, min));
  }

  // Money received per calendar month, oldest first, ending with endMonth ('YYYY-MM').
  function monthly(payments, endMonth, count) {
    const buckets = [];
    for (let i = count - 1; i >= 0; i--) {
      buckets.push({ month: Dates.addMonths(endMonth, -i), gross: 0, fees: 0, net: 0, count: 0 });
    }
    const at = new Map(buckets.map((b, i) => [b.month, i]));
    for (const p of payments || []) {
      const i = at.get(Dates.month(p.date));
      if (i === undefined) continue;
      buckets[i].gross += Math.round(p.amount) || 0;
      buckets[i].fees += Math.round(p.fee) || 0;
      buckets[i].count += 1;
    }
    buckets.forEach((b) => { b.net = b.gross - b.fees; });
    return buckets;
  }

  // One pass over everything a screen needs: invoice and estimate states and
  // per-customer balances.
  function index(data, today) {
    const paid = paidByInvoice(data.payments);
    const inv = new Map();
    const est = new Map();
    const byCustomer = new Map();
    const cust = (id) => {
      if (!byCustomer.has(id)) byCustomer.set(id, { open: 0, overdue: 0, paid: 0, invoices: 0, estimates: 0, payments: 0, last: '' });
      return byCustomer.get(id);
    };
    for (const i of data.invoices) {
      const s = invoiceState(i, paid.get(i.id) || 0, today);
      inv.set(i.id, s);
      const c = cust(i.customerId);
      c.invoices += 1;
      if (s.collecting) c.open += s.balance;
      if (s.key === 'overdue') c.overdue += s.balance;
      if (i.issueDate > c.last) c.last = i.issueDate;
    }
    for (const e of data.estimates) {
      est.set(e.id, estimateState(e, today));
      const c = cust(e.customerId);
      c.estimates += 1;
      if (e.issueDate > c.last) c.last = e.issueDate;
    }
    for (const p of data.payments) {
      if (!p.customerId) continue;
      const c = cust(p.customerId);
      c.paid += Math.round(p.amount) || 0;
      c.payments += 1;
      if (p.date > c.last) c.last = p.date;
    }
    return { inv, est, byCustomer, paid };
  }

  NB.calc = { lineAmount, totals, paidByInvoice, invoiceState, estimateState, feeFor, monthly, index, INVOICE_LABELS, ESTIMATE_LABELS };
})(typeof window !== 'undefined' ? (window.NB = window.NB || {}) : (globalThis.NB = globalThis.NB || {}));
