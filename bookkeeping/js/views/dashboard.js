/* n0va Books · views/dashboard.js
 * Overview: what customers owe, what came in, and what needs a nudge today. */
(function (NB) {
  'use strict';
  NB.views = NB.views || {};
  const { html, out, icon, fmt, link, pill, empty } = NB.ui;
  const { Dates, firstName, plural, Money, clamp } = NB.util;

  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  function compact(minor) {
    const s = NB.store.settings();
    try {
      return new Intl.NumberFormat(s.docs.locale, {
        style: 'currency', currency: s.docs.currency, notation: 'compact', maximumFractionDigits: 1,
      }).format(minor / Money.factor(s.docs.currency));
    } catch (e) {
      return fmt.money(minor);
    }
  }

  function niceStep(x) {
    if (x <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(x)));
    const n = x / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }

  // ---------------------------------------------------------------- chart
  function chart(months) {
    const s = NB.store.settings();
    const factor = Money.factor(s.docs.currency);
    const max = Math.max.apply(null, months.map((m) => m.gross));
    if (max <= 0) return empty('No payments in the last 12 months', 'Payments you record will show here, month by month.');
    const step = Math.max(1, niceStep(max / factor / 3));
    const top = Math.ceil(max / factor / step) * step;
    const ticks = [];
    for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
    const last = months.length - 1;
    const h = (m) => (m.gross / factor / top).toFixed(4);
    return html`<div class="chart" data-chart>
      <div class="chart-plot">
        ${ticks.map((v) => html`<div class="gl" style="--y:${(v / top).toFixed(4)}"><span>${compact(Math.round(v * factor))}</span></div>`)}
        <div class="chart-cols">
          ${months.map((m, i) => html`<button type="button" class="col${i === last ? ' is-current' : ''}" data-i="${i}"
            aria-label="${Dates.monthLabel(m.month, s.docs.locale, 'long')}: ${fmt.money(m.gross)} received">
            <span class="bar" style="--h:${h(m)}"></span>
            ${i === last && m.gross > 0 ? html`<span class="bar-val" style="--h:${h(m)}">${compact(m.gross)}</span>` : ''}
          </button>`)}
        </div>
      </div>
      <div class="chart-x" aria-hidden="true">${months.map((m, i) => html`<span class="${i === last ? 'is-current' : ''}">${Dates.monthLabel(m.month, s.docs.locale)}</span>`)}</div>
      <div class="chart-tip" role="status" hidden></div>
    </div>
    <details class="chart-table">
      <summary>Show as a table</summary>
      <div class="table-scroll"><table class="table table-compact">
        <thead><tr><th>Month</th><th class="num">Received</th><th class="num">Fees</th><th class="num">Net</th><th class="num">Payments</th></tr></thead>
        <tbody>${months.slice().reverse().map((m) => html`<tr>
          <td>${Dates.monthLabel(m.month, s.docs.locale, 'long')}</td><td class="num">${fmt.money(m.gross)}</td>
          <td class="num">${fmt.money(m.fees)}</td><td class="num">${fmt.money(m.net)}</td><td class="num">${m.count}</td></tr>`)}</tbody>
      </table></div>
    </details>`;
  }

  function bindChart(root, months) {
    const el = root.querySelector('[data-chart]');
    if (!el) return;
    const tip = el.querySelector('.chart-tip');
    const locale = NB.store.settings().docs.locale;
    let active = null;
    const show = (col) => {
      if (active) active.classList.remove('is-hover');
      active = col;
      col.classList.add('is-hover');
      const m = months[+col.dataset.i];
      tip.innerHTML = out(html`<strong>${fmt.money(m.gross)}</strong>
        <span>${Dates.monthLabel(m.month, locale, 'long')}</span>
        ${m.count ? html`<span>${plural(m.count, 'payment')} · ${fmt.money(m.fees)} fees · ${fmt.money(m.net)} net</span>` : html`<span>No payments</span>`}`);
      tip.hidden = false;
      const box = el.getBoundingClientRect();
      const bar = col.querySelector('.bar').getBoundingClientRect();
      const half = tip.offsetWidth / 2;
      tip.style.left = clamp(bar.left + bar.width / 2 - box.left, half, box.width - half) + 'px';
      tip.style.top = Math.max(tip.offsetHeight, bar.top - box.top - 10) + 'px';
    };
    const hide = () => {
      tip.hidden = true;
      if (active) active.classList.remove('is-hover');
      active = null;
    };
    el.addEventListener('pointerover', (e) => { const c = e.target.closest('.col'); if (c) show(c); });
    el.addEventListener('pointerleave', hide);
    el.addEventListener('focusin', (e) => { const c = e.target.closest('.col'); if (c) show(c); });
    el.addEventListener('focusout', hide);
  }

  // ---------------------------------------------------------------- attention list
  function attention(data, ix, today) {
    const customers = new Map(data.customers.map((c) => [c.id, c]));
    const who = (id) => (customers.get(id) || {}).name || 'No customer';
    const rows = [];
    data.invoices.forEach((inv) => {
      const st = ix.inv.get(inv.id);
      if (st.key === 'overdue') {
        rows.push({ rank: 0, sort: -st.daysOverdue, tone: 'overdue', tag: 'Overdue', kind: 'invoice', rec: inv, who: who(inv.customerId),
          meta: plural(st.daysOverdue, 'day') + ' overdue', amount: st.balance });
      } else if (st.collecting && st.dueIn !== null && st.dueIn <= 7) {
        rows.push({ rank: 1, sort: st.dueIn, tone: 'soon', tag: 'Due soon', kind: 'invoice', rec: inv, who: who(inv.customerId),
          meta: 'Due ' + fmt.relative(st.dueIn), amount: st.balance });
      } else if (st.key === 'draft') {
        rows.push({ rank: 4, sort: 0, tone: 'draft', tag: 'Draft', kind: 'invoice', rec: inv, who: who(inv.customerId),
          meta: 'Not sent yet', amount: st.total });
      }
    });
    data.estimates.forEach((est) => {
      const st = ix.est.get(est.id);
      if (st.key === 'accepted') {
        rows.push({ rank: 2, sort: 0, tone: 'accepted', tag: 'Accepted', kind: 'estimate', rec: est, who: who(est.customerId),
          meta: 'Ready to invoice', amount: st.total });
      } else if (st.key === 'sent') {
        const age = Dates.diff(est.issueDate, today);
        if (age >= 3 || (st.expiresIn !== null && st.expiresIn <= 7)) {
          rows.push({ rank: 3, sort: st.expiresIn === null ? 999 : st.expiresIn, tone: 'sent', tag: 'Awaiting reply', kind: 'estimate', rec: est,
            who: who(est.customerId), meta: 'Sent ' + fmt.relative(-age) + (st.expiresIn !== null ? ' · expires ' + fmt.relative(st.expiresIn) : ''), amount: st.total });
        }
      } else if (st.key === 'draft') {
        rows.push({ rank: 4, sort: 1, tone: 'draft', tag: 'Draft', kind: 'estimate', rec: est, who: who(est.customerId), meta: 'Not sent yet', amount: st.total });
      }
    });
    rows.sort((a, b) => a.rank - b.rank || a.sort - b.sort);
    return rows;
  }

  // ---------------------------------------------------------------- welcome
  function welcome() {
    const where = NB.store.mode === 'cloud'
      ? 'Your books are saved to your claude.ai account, so they are there on any device you sign in from.'
      : NB.store.mode === 'local'
        ? 'Your books are saved in this browser on this device. Download a backup from Settings now and then.'
        : '';
    return html`<div class="page">
      <section class="welcome">
        <p class="eyebrow">n0va Books</p>
        <h1>Your shop's books, all in one place</h1>
        <p class="lede">Keep customer details together, send estimates and invoices with your branding,
          and record what you take through Square with a receipt for each payment.</p>
        <ol class="steps">
          <li><span class="step-n">1</span><div><strong>Add your business details</strong>
            <p>Your address, email and logo go on every estimate, invoice and receipt.</p>
            ${link('settings', {}, 'Open settings', 'class="btn btn-quiet btn-sm"')}</div></li>
          <li><span class="step-n">2</span><div><strong>Add your first customer</strong>
            <p>Name, email, phone, shipping address and notes like ring sizes or allergies.</p>
            ${link('customer-edit', {}, 'Add a customer', 'class="btn btn-quiet btn-sm"')}</div></li>
          <li><span class="step-n">3</span><div><strong>Send an estimate or an invoice</strong>
            <p>Estimates can ask for a deposit. Turn an accepted one into an invoice in one click.</p>
            ${link('doc-edit', { kind: 'estimate' }, 'New estimate', 'class="btn btn-quiet btn-sm"')}</div></li>
          <li><span class="step-n">4</span><div><strong>Record payments as they come in</strong>
            <p>Note the Square reference, see the processing fee, and send a receipt.</p>
            ${link('payment-edit', {}, 'Record a payment', 'class="btn btn-quiet btn-sm"')}</div></li>
        </ol>
        <div class="welcome-sample">
          <div><strong>Want to look around first?</strong>
            <p>Load five example customers with estimates, invoices and payments. Remove them in one click when you're ready.</p></div>
          <button type="button" class="btn btn-primary" data-act="sample">${icon('spark')} Explore with sample data</button>
        </div>
        ${where ? html`<p class="hint">${where}</p>` : ''}
      </section>
    </div>`;
  }

  // ---------------------------------------------------------------- page
  function render(root) {
    const s = NB.store.settings();
    const today = Dates.today();
    if (NB.store.isEmpty()) {
      root.innerHTML = out(welcome());
      root.onclick = (e) => {
        const b = e.target.closest('[data-act="sample"]');
        if (b) NB.ui.busy(b, async () => {
          await NB.store.loadSample();
          NB.ui.toast('Sample data loaded');
        });
      };
      return;
    }

    const data = NB.store.snapshot();
    const ix = NB.calc.index(data, today);
    const thisMonth = Dates.month(today);
    const year = today.slice(0, 4);

    let owed = 0, owedCount = 0, overdue = 0, overdueCount = 0;
    ix.inv.forEach((st) => {
      if (st.collecting) { owed += st.balance; owedCount += 1; }
      if (st.key === 'overdue') { overdue += st.balance; overdueCount += 1; }
    });
    const monthPays = data.payments.filter((p) => Dates.month(p.date) === thisMonth);
    const yearPays = data.payments.filter((p) => String(p.date).slice(0, 4) === year);
    const sumOf = (list, k) => list.reduce((a, p) => a + (Math.round(p[k]) || 0), 0);
    const months = NB.calc.monthly(data.payments, thisMonth, 12);
    const rows = attention(data, ix, today);
    const recent = data.payments.slice().sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)).slice(0, 6);
    const customers = new Map(data.customers.map((c) => [c.id, c]));
    const owner = s.business.owner ? ', ' + firstName(s.business.owner) : '';

    root.innerHTML = out(html`<div class="page">
      <header class="page-head">
        <div>
          <p class="eyebrow">${fmt.dateLong(today)}</p>
          <h1>${greeting()}${owner}</h1>
        </div>
        <div class="head-actions">
          ${link('payment-edit', {}, html`${icon('payment')}<span>Record payment</span>`, 'class="btn btn-quiet"')}
          ${link('doc-edit', { kind: 'estimate' }, html`${icon('estimate')}<span>New estimate</span>`, 'class="btn btn-quiet"')}
          ${link('doc-edit', { kind: 'invoice' }, html`${icon('plus')}<span>New invoice</span>`, 'class="btn btn-primary"')}
        </div>
      </header>

      <section class="kpis" aria-label="Summary">
        <div class="kpi">
          <p class="kpi-label">Owed to you</p>
          <p class="kpi-value">${fmt.money(owed)}</p>
          <p class="kpi-sub">${owedCount ? plural(owedCount, 'unpaid invoice') : 'Nothing outstanding'}</p>
        </div>
        <div class="kpi">
          <p class="kpi-label">Overdue</p>
          <p class="kpi-value">${fmt.money(overdue)}</p>
          <p class="kpi-sub">${overdueCount ? html`${pill('overdue', plural(overdueCount, 'invoice'))} past due` : 'Nothing overdue'}</p>
        </div>
        <div class="kpi">
          <p class="kpi-label">Received in ${Dates.monthLabel(thisMonth, s.docs.locale, 'name')}</p>
          <p class="kpi-value">${fmt.money(sumOf(monthPays, 'amount'))}</p>
          <p class="kpi-sub">${fmt.money(sumOf(monthPays, 'fee'))} fees · ${fmt.money(sumOf(monthPays, 'amount') - sumOf(monthPays, 'fee'))} net</p>
        </div>
        <div class="kpi">
          <p class="kpi-label">Received in ${year}</p>
          <p class="kpi-value">${fmt.money(sumOf(yearPays, 'amount'))}</p>
          <p class="kpi-sub">${plural(yearPays.length, 'payment')} · ${fmt.money(sumOf(yearPays, 'fee'))} fees</p>
        </div>
      </section>

      <div class="dash-grid">
        <section class="card">
          <header class="card-head"><h2>Money received</h2><p class="card-sub">Last 12 months, before fees</p></header>
          ${chart(months)}
        </section>

        <section class="card">
          <header class="card-head"><h2>Needs attention</h2><p class="card-sub">${rows.length ? plural(rows.length, 'item') : 'All caught up'}</p></header>
          ${rows.length ? html`<ul class="list">${rows.slice(0, 7).map((r) => html`<li>
            ${link('doc', { kind: r.kind, id: r.rec.id }, html`
              <span class="list-main"><span class="list-title">${r.who}</span>
                <span class="list-meta"><span class="mono">${r.rec.number}</span> · ${r.meta}</span></span>
              <span class="list-side">${pill(r.tone, r.tag)}<span class="list-amount">${fmt.money(r.amount)}</span></span>`, 'class="list-link"')}
          </li>`)}</ul>
          ${rows.length > 7 ? html`<p class="card-foot">${link('invoices', {}, 'See all invoices')} · ${link('estimates', {}, 'See all estimates')}</p>` : ''}`
          : empty('You’re all caught up', 'Nothing is overdue or waiting on a reply.')}
        </section>

        <section class="card dash-wide">
          <header class="card-head"><h2>Recent payments</h2>${link('payments', {}, 'All payments', 'class="card-link"')}</header>
          ${recent.length ? html`<ul class="list">${recent.map((p) => html`<li>
            ${link('payment', { id: p.id }, html`
              <span class="list-main"><span class="list-title">${(customers.get(p.customerId) || {}).name || p.memo || 'Payment'}</span>
                <span class="list-meta">${fmt.date(p.date)} · <span class="mono">${p.receiptNumber}</span> · ${p.methodName || ''}</span></span>
              <span class="list-side"><span class="list-amount">${fmt.money(p.amount)}</span></span>`, 'class="list-link"')}
          </li>`)}</ul>` : empty('No payments yet', 'Record a payment when a customer pays you through Square, in cash or any other way.')}
        </section>
      </div>
    </div>`);
    bindChart(root, months);
  }

  NB.views.dashboard = { title: 'Overview', render };
})(window.NB = window.NB || {});
