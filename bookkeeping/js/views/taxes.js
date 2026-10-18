/* n0va Books · views/taxes.js
 * The year at tax time, laid out like Schedule C (Form 1040): income, cost of goods
 * sold, expenses by line, home studio, net profit, a self-employment tax estimate,
 * estimated-tax dates and the sales tax collected for state returns. */
(function (NB) {
  'use strict';
  NB.views = NB.views || {};
  const { html, out, icon, fmt, link } = NB.ui;
  const { Dates, plural, Money } = NB.util;
  const T = NB.tax;

  const state = { year: null, quarter: 'year' };

  function yearsWithData(today) {
    const years = new Set([today.slice(0, 4)]);
    const add = (d) => { if (d && /^\d{4}/.test(d)) years.add(d.slice(0, 4)); };
    NB.store.all('payments').forEach((p) => add(p.date));
    NB.store.all('expenses').forEach((e) => add(e.date));
    NB.store.all('mileage').forEach((t) => add(t.date));
    NB.store.all('invoices').forEach((i) => add(i.issueDate));
    return Array.from(years).sort().reverse();
  }

  function quarterRange(year, q) {
    if (q === 'year') return [year + '-01-01', year + '-12-31'];
    const n = Number(q.slice(1));
    const start = String((n - 1) * 3 + 1).padStart(2, '0');
    const end = Dates.addMonths(year + '-' + String(n * 3).padStart(2, '0'), 0);
    return [year + '-' + start + '-01', end + '-31'];
  }

  function profileName(id, label, rate) {
    const p = NB.store.taxProfile(id);
    if (p) return p.name;
    if (label) return label + (rate ? ' (' + fmt.qty(rate) + '%)' : '');
    return rate ? 'Custom rate ' + fmt.qty(rate) + '%' : 'Sales tax, no profile';
  }

  function row(label, amount, opts) {
    const o = opts || {};
    return html`<div class="${o.cls || ''}"><dt>${label}${o.line ? html` <span class="line-ref">${o.line}</span>` : ''}${o.sub ? html`<span class="dt-sub">${o.sub}</span>` : ''}</dt>
      <dd>${o.minus && amount ? '−' : ''}${fmt.money(Math.abs(amount))}</dd></div>`;
  }

  function summaryCSV(y, salesRows) {
    const cur = NB.store.settings().docs.currency;
    const m = (v) => Money.toInput(v || 0, cur);
    const rows = [];
    const push = (section, line, what, amount) => rows.push({ section, line, what, amount: m(amount) });
    push('Income', '', 'Payments received', y.received);
    push('Income', '', 'Sales tax inside payments (not income)', -y.salesTax);
    push('Income', '1', 'Gross receipts', y.grossReceipts);
    push('Cost of goods sold', '35', 'Inventory at start of year', y.cogs.begin);
    push('Cost of goods sold', '36', T.LINES['36'], y.cogs.purchases);
    push('Cost of goods sold', '38', T.LINES['38'], y.cogs.materials);
    push('Cost of goods sold', '39', T.LINES['39'], y.cogs.other);
    push('Cost of goods sold', '41', 'Inventory at end of year', y.cogs.end);
    push('Cost of goods sold', '42', 'Cost of goods sold (line 4)', y.cogs.total);
    push('Profit', '7', 'Gross income', y.grossProfit);
    T.EXPENSE_LINES.forEach((l) => { if (y.lines[l]) push('Expenses', l, T.LINES[l], y.lines[l]); });
    Object.values(y.byCategory).sort((a, b) => a.line.localeCompare(b.line, undefined, { numeric: true })).forEach((c) => {
      push('Expense detail', c.line, c.name + ' (' + c.count + ')', c.deductible);
    });
    push('Expense detail', '10', 'Square fees on recorded payments', y.paymentFees);
    push('Expense detail', '9', 'Mileage: ' + NB.util.fmtQty(y.miles, 'en-US') + ' business miles', y.mileageDeduction);
    push('Expenses', '28', 'Total expenses', y.totalExpenses);
    push('Profit', '29', 'Tentative profit', y.tentative);
    push('Profit', '30', 'Home studio, simplified method (' + y.home.sqft + ' sq ft, ' + y.home.months + ' months)', y.home.amount);
    push('Profit', '31', 'Net profit or loss', y.netProfit);
    push('Estimate', '', 'Self-employment tax estimate (Schedule SE)', y.seTax);
    salesRows.forEach((r) => push('Sales tax collected', '', r.name + ' · taxable sales ' + m(r.taxable), r.tax));
    return NB.util.csv(rows, [
      { label: 'Section', value: (r) => r.section },
      { label: 'Schedule C line', value: (r) => r.line },
      { label: 'Description', value: (r) => r.what },
      { label: 'Amount', value: (r) => r.amount },
    ]);
  }

  NB.views.taxes = {
    title: 'Taxes',
    live: false,
    render(root, params) {
      const s = NB.store.settings();
      const today = Dates.today();
      const years = yearsWithData(today);
      if (params && params.year) state.year = String(params.year);
      if (!state.year || !years.includes(state.year)) state.year = today.slice(0, 4);
      const year = state.year;
      const inputs = NB.store.taxYearInputs(year);
      const data = NB.store.snapshot();
      const y = T.taxYear(data, year, { inputs, mileageRates: s.mileageRates });
      const [qFrom, qTo] = quarterRange(year, state.quarter);
      const salesRows = T.salesTaxReport(data, qFrom, qTo, profileName);
      const taxedRows = salesRows.filter((r) => r.key !== 'none');
      const untaxed = salesRows.find((r) => r.key === 'none');
      const due = T.quarterlyDates(year);
      const nextDue = due.find((d) => d >= today);
      const costs = y.cogs.total + y.totalExpenses + y.home.amount;
      const byLine = {};
      Object.values(y.byCategory).forEach((c) => { (byLine[c.line] = byLine[c.line] || []).push(c); });
      const ratesUsed = Array.from(new Set(data.mileage.filter((t) => String(t.date).startsWith(year)).map((t) => T.mileageRate(t.date, s.mileageRates))));
      const focusId = document.activeElement && document.activeElement.id;

      root.innerHTML = out(html`<div class="page page-taxes">
        <header class="page-head">
          <div><p class="eyebrow">For you and your tax preparer</p><h1>Taxes for ${year}</h1></div>
          <div class="head-actions">
            <div class="chips" role="group" aria-label="Tax year">${years.slice(0, 5).map((yr) => html`<button type="button" class="chip${yr === year ? ' is-on' : ''}" data-year="${yr}" aria-pressed="${yr === year}">${yr}</button>`)}</div>
            <button type="button" class="btn btn-primary" data-act="csv">${icon('download')}<span>Download summary</span></button>
          </div>
        </header>
        <p class="tax-disclaimer">${icon('alert')}<span>This lays out your records the way Schedule C (Form 1040) does for a sole proprietor. It isn’t tax advice, and your tax preparer may sort some items differently. Amounts are cash basis: money in and out during ${year}.</span></p>

        <section class="kpis" aria-label="${year} at a glance">
          <div class="kpi"><p class="kpi-label">Gross receipts</p><p class="kpi-value">${fmt.money(y.grossReceipts)}</p><p class="kpi-sub">${plural(y.payments, 'payment')}, less sales tax</p></div>
          <div class="kpi"><p class="kpi-label">Costs and write-offs</p><p class="kpi-value">${fmt.money(costs)}</p><p class="kpi-sub">${plural(y.expenses, 'expense')} · ${fmt.qty(y.miles)} miles</p></div>
          <div class="kpi"><p class="kpi-label">Net profit</p><p class="kpi-value${y.netProfit < 0 ? ' is-negative' : ''}">${y.netProfit < 0 ? '−' : ''}${fmt.money(Math.abs(y.netProfit))}</p><p class="kpi-sub">Schedule C, line 31</p></div>
          <div class="kpi"><p class="kpi-label">Self-employment tax</p><p class="kpi-value">${fmt.money(y.seTax)}</p><p class="kpi-sub">Rough estimate${nextDue ? html` · next payment due ${fmt.date(nextDue)}` : ''}</p></div>
        </section>

        ${y.warnings.map((w) => html`<div class="banner banner-warn">${icon('alert')}<p>${w}</p></div>`)}

        <div class="tax-grid">
          <div class="tax-col">
            <section class="card">
              <header class="card-head"><h2>Income</h2><p class="card-sub">Part I</p></header>
              <dl class="ledger">
                ${row('Payments received', y.received, { sub: plural(y.payments, 'payment') + ' recorded in ' + year })}
                ${row('Sales tax inside those payments', y.salesTax, { minus: true, sub: 'Collected for the state, so not your income' })}
                ${row('Gross receipts', y.grossReceipts, { line: 'Line 1', cls: 'ledger-total' })}
              </dl>
              <p class="hint">Square may send you a Form 1099-K for card payments. Its total includes sales tax and fees, so compare it with “Payments received”, not gross receipts.</p>
            </section>

            <form class="card" id="tax-cogs" novalidate>
              <header class="card-head"><h2>Cost of goods sold</h2><p class="card-sub">Part III</p></header>
              <dl class="ledger">
                <div class="ledger-input"><dt>Inventory on January 1 <span class="line-ref">Line 35</span></dt>
                  <dd><input name="beginInventory" id="tax-begin" class="num" inputmode="decimal" value="${y.cogs.begin ? fmt.input(y.cogs.begin) : ''}" placeholder="0.00" aria-label="Inventory on January 1" autocomplete="off"></dd></div>
                ${row(T.LINES['36'], y.cogs.purchases, { line: 'Line 36' })}
                ${row('Materials for products', y.cogs.materials, { line: 'Line 38' })}
                ${row('Packaging and other costs', y.cogs.other, { line: 'Line 39' })}
                <div class="ledger-input"><dt>Inventory on December 31 <span class="line-ref">Line 41</span></dt>
                  <dd><input name="endInventory" id="tax-end" class="num" inputmode="decimal" value="${y.cogs.end ? fmt.input(y.cogs.end) : ''}" placeholder="0.00" aria-label="Inventory on December 31" autocomplete="off"></dd></div>
                ${row('Cost of goods sold', y.cogs.total, { line: 'Line 42', cls: 'ledger-total' })}
              </dl>
              <p class="hint">At the end of the year, add up what you paid for the materials and finished pieces still on your shelves. That’s your December 31 inventory, and next year’s January 1.</p>
            </form>

            <section class="card">
              <header class="card-head"><h2>Expenses</h2><p class="card-sub">Part II · ${link('expenses', {}, 'See all expenses')}</p></header>
              <dl class="ledger">
                ${T.EXPENSE_LINES.filter((l) => y.lines[l]).map((l) => html`
                  ${row(T.LINES[l], y.lines[l], { line: 'Line ' + l, cls: 'ledger-line' })}
                  ${(byLine[l] || []).map((c) => row(c.name, c.deductible, { cls: 'ledger-detail', sub: plural(c.count, 'expense') }))}
                  ${l === '10' && y.paymentFees ? row('Square fees on recorded payments', y.paymentFees, { cls: 'ledger-detail', sub: 'Added from your payments' }) : ''}
                  ${l === '9' && y.mileageDeduction ? row('Business mileage', y.mileageDeduction, { cls: 'ledger-detail', sub: fmt.qty(y.miles) + ' miles at ' + ratesUsed.map((r) => fmt.qty(r) + '¢').join(' and ') }) : ''}`)}
                ${y.totalExpenses ? '' : html`<div><dt class="muted">No expenses recorded for ${year} yet.</dt><dd></dd></div>`}
                ${row('Total expenses', y.totalExpenses, { line: 'Line 28', cls: 'ledger-total' })}
              </dl>
            </section>
          </div>

          <div class="tax-col">
            <form class="card" id="tax-home" novalidate>
              <header class="card-head"><h2>Home studio</h2><p class="card-sub">Line 30, simplified method</p></header>
              <p class="hint">If part of your home is used regularly and only for the business, you can deduct $5 a square foot, up to 300 square feet.</p>
              <div class="form-grid home-grid">
                <label class="field"><span>Square feet</span><input name="homeSqft" id="tax-sqft" class="num" inputmode="numeric" value="${y.home.sqft || ''}" placeholder="0" autocomplete="off"></label>
                <label class="field"><span>Months used in ${year}</span><input name="homeMonths" id="tax-months" class="num" inputmode="numeric" value="${y.home.months}" autocomplete="off"></label>
              </div>
              <dl class="ledger">${row('Home studio deduction', y.home.amount, { line: 'Line 30', cls: 'ledger-total' })}</dl>
            </form>

            <section class="card">
              <header class="card-head"><h2>Profit</h2></header>
              <dl class="ledger">
                ${row('Gross receipts', y.grossReceipts, { line: 'Line 1' })}
                ${row('Cost of goods sold', y.cogs.total, { line: 'Line 4', minus: true })}
                ${row('Gross income', y.grossProfit, { line: 'Line 7', cls: 'ledger-line' })}
                ${row('Expenses', y.totalExpenses, { line: 'Line 28', minus: true })}
                ${row('Home studio', y.home.amount, { line: 'Line 30', minus: true })}
                <div class="ledger-total"><dt>Net ${y.netProfit < 0 ? 'loss' : 'profit'} <span class="line-ref">Line 31</span></dt><dd>${y.netProfit < 0 ? '−' : ''}${fmt.money(Math.abs(y.netProfit))}</dd></div>
              </dl>
              <div class="se-box">
                <p><strong>Self-employment tax: about ${fmt.money(y.seTax)}</strong></p>
                <p class="hint">${y.seTax
                  ? 'Social Security and Medicare for the self-employed: 15.3% of 92.35% of net profit. Half of it is deductible on Schedule 1. Income tax comes on top and depends on the rest of your return.'
                  : 'Owed once net earnings from the business reach $400 for the year (15.3% of 92.35% of net profit).'}</p>
                <p class="due-label">Estimated tax payments for ${year}</p>
                <ul class="due-list">${due.map((d, i) => html`<li class="${d === nextDue ? 'is-next' : d < today ? 'is-past' : ''}"><span>${['1st', '2nd', '3rd', '4th'][i]} payment</span><span>${fmt.date(d)}</span></li>`)}</ul>
                <p class="hint">Estimated payments are generally needed if you’ll owe $1,000 or more for the year. Your tax preparer can work out the amounts.</p>
              </div>
            </section>

            <section class="card">
              <header class="card-head"><h2>Sales tax collected</h2>
                <div class="chips chips-tight" role="group" aria-label="Period">${['year', 'q1', 'q2', 'q3', 'q4'].map((q) => html`<button type="button" class="chip chip-sm${state.quarter === q ? ' is-on' : ''}" data-quarter="${q}" aria-pressed="${state.quarter === q}">${q === 'year' ? 'Year' : q.toUpperCase()}</button>`)}</div>
              </header>
              ${taxedRows.length ? html`<div class="table-scroll"><table class="table table-compact">
                <thead><tr><th>Profile</th><th class="num">Taxable sales</th><th class="num">Tax</th></tr></thead>
                <tbody>${taxedRows.map((r) => html`<tr><td>${r.name}<span class="cell-sub">${plural(r.count, 'sale')}</span></td><td class="num">${fmt.money(r.taxable)}</td><td class="num">${fmt.money(r.tax)}</td></tr>`)}</tbody>
                <tfoot><tr><td>Total</td><td class="num">${fmt.money(taxedRows.reduce((a, r) => a + r.taxable, 0))}</td><td class="num">${fmt.money(taxedRows.reduce((a, r) => a + r.tax, 0))}</td></tr></tfoot>
              </table></div>` : html`<p class="muted small">No sales tax charged in this period.</p>`}
              ${untaxed ? html`<p class="hint">Sales with no sales tax: ${fmt.money(untaxed.sales)} (${plural(untaxed.count, 'sale')}).</p>` : ''}
              <p class="hint">From invoice dates (not drafts or void) and sales recorded without an invoice. Report and pay this to your state, like an Arizona TPT return; it isn’t income.</p>
            </section>

            <section class="card">
              <header class="card-head"><h2>Keep for your records</h2></header>
              <ul class="keep-list">
                <li>Receipts for expenses. Add photos to each expense here, or keep the paper ones together by year.</li>
                <li>Your mileage log: date, where, why and miles for each trip.</li>
                <li>Any Form 1099-K or 1099-NEC you receive (Square, Etsy, PayPal).</li>
                <li>Your inventory count at the end of the year.</li>
                <li>Sales tax returns and payment confirmations.</li>
                <li>A backup of these books from Settings → Backup and data. The IRS generally asks you to keep records for at least three years.</li>
              </ul>
            </section>
          </div>
        </div>
      </div>`);

      if (focusId) {
        const el = root.querySelector('#' + focusId);
        if (el) el.focus();
      }

      root.onclick = (e) => {
        const yb = e.target.closest('[data-year]');
        if (yb) { state.year = yb.dataset.year; NB.views.taxes.render(root, {}); return; }
        const qb = e.target.closest('[data-quarter]');
        if (qb) { state.quarter = qb.dataset.quarter; NB.views.taxes.render(root, {}); return; }
        const b = e.target.closest('[data-act="csv"]');
        if (b) NB.ui.busy(b, async () => {
          const allYear = T.salesTaxReport(data, year + '-01-01', year + '-12-31', profileName).filter((r) => r.key !== 'none');
          const name = 'tax-summary-' + year + '.csv';
          if (await NB.ui.saveFile(name, summaryCSV(y, allYear), 'text/csv')) NB.ui.toast('Saved ' + name);
        });
      };
      // Year-end figures save when you leave a field.
      root.onchange = async (e) => {
        const el = e.target;
        if (!el.closest('#tax-cogs, #tax-home')) return;
        const values = {};
        if (el.name === 'beginInventory' || el.name === 'endInventory') {
          const v = fmt.parse(el.value);
          values[el.name] = isNaN(v) ? 0 : Math.max(0, v);
        } else if (el.name === 'homeSqft') {
          values.homeSqft = Math.min(300, Math.max(0, Math.round(NB.ui.num(el.value))));
        } else if (el.name === 'homeMonths') {
          values.homeMonths = Math.min(12, Math.max(0, Math.round(NB.ui.num(el.value))));
        } else return;
        await NB.ui.busy(null, async () => {
          await NB.store.saveTaxYearInputs(year, values);
          NB.views.taxes.render(root, {});
        });
      };
      root.onsubmit = (e) => e.preventDefault();
    },
  };

  NB.taxes = { summaryCSV };
})(window.NB = window.NB || {});
