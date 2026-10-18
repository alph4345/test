/* n0va Books · tax.js
 * Tax-time math for a US sole proprietor: expense categories mapped to Schedule C
 * (Form 1040), IRS standard mileage rates, the sales tax inside payments, and the
 * tax-year summary. Pure functions, no DOM or storage. This organizes records; it is
 * not tax advice, and a tax preparer may classify some items differently. */
(function (NB) {
  'use strict';
  const { roundMinor, clamp, Dates } = NB.util;

  // Schedule C lines used here (2025 form: other expenses moved to line 27b).
  const LINES = {
    '8': 'Advertising',
    '9': 'Car and truck expenses',
    '10': 'Commissions and fees',
    '11': 'Contract labor',
    '15': 'Insurance (other than health)',
    '17': 'Legal and professional services',
    '18': 'Office expense',
    '20b': 'Rent or lease: other business property',
    '21': 'Repairs and maintenance',
    '22': 'Supplies',
    '23': 'Taxes and licenses',
    '24a': 'Travel',
    '24b': 'Deductible meals',
    '25': 'Utilities',
    '27b': 'Other expenses',
    '36': 'Purchases (items to resell)',
    '38': 'Materials and supplies',
    '39': 'Other costs',
  };
  const EXPENSE_LINES = ['8', '9', '10', '11', '15', '17', '18', '20b', '21', '22', '23', '24a', '24b', '25', '27b'];
  const COGS_LINES = ['36', '38', '39'];

  const CATEGORIES = [
    { id: 'materials', group: 'Cost of goods sold', line: '38', name: 'Materials for products',
      hint: 'Resin, beads, wire, LEDs, fabric: anything that becomes part of what you sell.' },
    { id: 'resale', group: 'Cost of goods sold', line: '36', name: 'Items bought to resell',
      hint: 'Finished goods you buy and sell as they are.' },
    { id: 'packaging', group: 'Cost of goods sold', line: '39', name: 'Product packaging',
      hint: 'Boxes, bags, cards and tags that go out with what you sell.' },
    { id: 'booth', group: 'Selling', line: '20b', name: 'Booth and market fees',
      hint: 'Craft fair booth, table and vendor fees.' },
    { id: 'fees', group: 'Selling', line: '10', name: 'Marketplace and payment fees',
      hint: 'Etsy, marketplace or PayPal fees. Square fees on payments you record here are added automatically, so leave those out.' },
    { id: 'shipping', group: 'Selling', line: '27b', name: 'Shipping and postage',
      hint: 'Postage, shipping labels and mailers.' },
    { id: 'advertising', group: 'Selling', line: '8', name: 'Advertising and marketing',
      hint: 'Ads, business cards, flyers, banners and giveaways.' },
    { id: 'supplies', group: 'Studio', line: '22', name: 'Shop supplies',
      hint: 'Things used up running the business that don’t go into products: cleaning supplies, display props, booth tape.' },
    { id: 'tools', group: 'Studio', line: '22', name: 'Tools and equipment',
      hint: 'Tools, displays, a tent. An item over $2,500 may need to be depreciated instead; ask your tax preparer.' },
    { id: 'office', group: 'Studio', line: '18', name: 'Office supplies and software',
      hint: 'Printer ink, paper, design apps, website and domain fees, subscriptions.' },
    { id: 'phone', group: 'Studio', line: '25', name: 'Phone and internet', businessPercent: 50,
      hint: 'For a personal phone or home internet, set how much of its use is for the business.' },
    { id: 'rent', group: 'Studio', line: '20b', name: 'Studio or storage rent',
      hint: 'A rented studio, workshop or storage unit. A studio in your home goes on the Taxes page instead.' },
    { id: 'utilities', group: 'Studio', line: '25', name: 'Studio utilities',
      hint: 'Power and water for a separate studio. A studio in your home goes on the Taxes page instead.' },
    { id: 'repairs', group: 'Studio', line: '21', name: 'Repairs and maintenance',
      hint: 'Fixing tools and equipment.' },
    { id: 'insurance', group: 'Studio', line: '15', name: 'Business insurance',
      hint: 'Liability insurance for markets, product or equipment insurance. Not health insurance.' },
    { id: 'parking', group: 'Travel', line: '9', name: 'Parking and tolls',
      hint: 'Parking and tolls on business trips. These count on top of mileage.' },
    { id: 'travel', group: 'Travel', line: '24a', name: 'Travel: lodging and airfare',
      hint: 'Hotels and flights for out-of-town shows.' },
    { id: 'meals', group: 'Travel', line: '24b', name: 'Meals while traveling', deductiblePercent: 50,
      hint: 'Meals on overnight business trips. Generally 50% deductible.' },
    { id: 'licenses', group: 'Professional and other', line: '23', name: 'Licenses, permits and fees',
      hint: 'Business license, seller’s permit, Arizona TPT license.' },
    { id: 'professional', group: 'Professional and other', line: '17', name: 'Accountant and legal',
      hint: 'Tax preparation, bookkeeping help, legal advice.' },
    { id: 'contract', group: 'Professional and other', line: '11', name: 'Contract help',
      hint: 'People you pay who aren’t employees: a booth helper, a photographer.' },
    { id: 'education', group: 'Professional and other', line: '27b', name: 'Classes and education',
      hint: 'Workshops, courses and books that improve your craft or business.' },
    { id: 'bank', group: 'Professional and other', line: '27b', name: 'Bank fees',
      hint: 'Account fees, check orders, wire fees.' },
    { id: 'other', group: 'Professional and other', line: '27b', name: 'Other business expense',
      hint: 'Anything else ordinary and necessary for the business.' },
  ];
  const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.id, c]));

  // IRS business standard mileage rates (cents per mile), each from its start date.
  const MILEAGE_RATES = [
    { from: '2024-01-01', cents: 67 },
    { from: '2025-01-01', cents: 70 },
    { from: '2026-01-01', cents: 72.5 },
    { from: '2026-07-01', cents: 76 },
  ];

  function category(id) {
    return CATEGORY_MAP.get(id) || CATEGORY_MAP.get('other');
  }

  function businessPercent(e) {
    const v = e && e.businessPercent;
    return clamp(v === undefined || v === null || v === '' ? 100 : Number(v) || 0, 0, 100);
  }

  // The business share of what was spent.
  function businessPortion(e) {
    return roundMinor(((Math.round(e.amount) || 0) * businessPercent(e)) / 100);
  }

  // What can be written off: the business share, limited for meals.
  function deductible(e) {
    const limit = category(e.category).deductiblePercent;
    return roundMinor((businessPortion(e) * (limit === undefined ? 100 : limit)) / 100);
  }

  function mileageRate(date, rates) {
    const list = (rates && rates.length ? rates : MILEAGE_RATES).slice().sort((a, b) => a.from.localeCompare(b.from));
    let rate = list[0];
    for (const r of list) if (r.from <= date) rate = r;
    return Number(rate.cents) || 0;
  }

  function tripDeduction(trip, rates) {
    return roundMinor((Number(trip.miles) || 0) * mileageRate(trip.date, rates));
  }

  // The sales tax inside a payment: its share of the invoice's tax, or what was entered
  // on a payment that has no invoice. Sales tax is collected for the state, not income.
  function paymentSalesTax(p, invoice) {
    const amount = Math.round(p.amount) || 0;
    if (invoice) {
      const t = NB.calc.totals(invoice);
      if (t.total <= 0 || t.tax <= 0) return 0;
      return Math.min(t.tax, roundMinor((amount * t.tax) / t.total));
    }
    return clamp(Math.round(p.salesTax) || 0, 0, Math.max(amount, 0));
  }

  // Sales tax already inside a tax-included amount: 108.70 at 8.7% holds 8.70.
  function taxIncluded(amount, rate) {
    const r = Number(rate) || 0;
    return r > 0 ? roundMinor((amount * r) / (100 + r)) : 0;
  }

  // US estimated tax due dates for a tax year; a weekend date moves to Monday.
  function quarterlyDates(year) {
    const y = Number(year);
    return [[y, 4, 15], [y, 6, 15], [y, 9, 15], [y + 1, 1, 15]].map(([yy, m, d]) => {
      const date = new Date(yy, m - 1, d);
      while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
      return Dates.iso(date);
    });
  }

  const add = (obj, key, v) => { obj[key] = (obj[key] || 0) + v; };

  // A Schedule C-shaped summary for one calendar year, cash basis.
  // inputs: { beginInventory, endInventory, homeSqft, homeMonths } (money in cents).
  function taxYear(data, year, opts) {
    const o = opts || {};
    const inputs = o.inputs || {};
    const inYear = (d) => String(d || '').slice(0, 4) === String(year);
    const invoices = new Map((data.invoices || []).map((i) => [i.id, i]));

    let received = 0;
    let salesTax = 0;
    let paymentFees = 0;
    const payments = (data.payments || []).filter((p) => inYear(p.date));
    payments.forEach((p) => {
      received += Math.round(p.amount) || 0;
      salesTax += paymentSalesTax(p, invoices.get(p.invoiceId));
      paymentFees += Math.round(p.fee) || 0;
    });
    const grossReceipts = received - salesTax;

    const lines = {};
    const byCategory = {};
    let spent = 0;
    const expenses = (data.expenses || []).filter((e) => inYear(e.date));
    expenses.forEach((e) => {
      const c = category(e.category);
      const ded = deductible(e);
      spent += Math.round(e.amount) || 0;
      add(lines, c.line, ded);
      const row = byCategory[c.id] || (byCategory[c.id] = { id: c.id, name: c.name, line: c.line, spent: 0, deductible: 0, count: 0 });
      row.spent += Math.round(e.amount) || 0;
      row.deductible += ded;
      row.count += 1;
    });

    // Fees taken by Square on recorded payments: commissions and fees (line 10).
    add(lines, '10', paymentFees);

    const trips = (data.mileage || []).filter((t) => inYear(t.date));
    const miles = trips.reduce((a, t) => a + (Number(t.miles) || 0), 0);
    const mileageDeduction = trips.reduce((a, t) => a + tripDeduction(t, o.mileageRates), 0);
    add(lines, '9', mileageDeduction);

    const begin = Math.max(0, Math.round(inputs.beginInventory) || 0);
    const end = Math.max(0, Math.round(inputs.endInventory) || 0);
    const cogsRaw = begin + (lines['36'] || 0) + (lines['38'] || 0) + (lines['39'] || 0) - end;
    const cogs = Math.max(0, cogsRaw);
    const grossProfit = grossReceipts - cogs;
    const totalExpenses = EXPENSE_LINES.reduce((a, l) => a + (lines[l] || 0), 0);
    const tentative = grossProfit - totalExpenses;

    // Simplified home office method: $5 a square foot, up to 300, for the months used,
    // and never more than the profit before it.
    const sqft = clamp(Number(inputs.homeSqft) || 0, 0, 300);
    const months = clamp(inputs.homeMonths === undefined ? 12 : Number(inputs.homeMonths) || 0, 0, 12);
    const homeFull = roundMinor((sqft * 500 * months) / 12);
    const homeOffice = Math.min(homeFull, Math.max(0, tentative));

    const netProfit = tentative - homeOffice;
    const seBase = roundMinor(Math.max(0, netProfit) * 0.9235);
    const seTax = seBase >= 40000 ? roundMinor(seBase * 0.153) : 0;

    const warnings = [];
    if (cogsRaw < 0) warnings.push('Ending inventory is more than your starting inventory plus purchases, so cost of goods sold shows as zero.');
    if (homeFull > homeOffice) warnings.push('The home studio deduction is limited to your profit before it; the rest can carry over to next year.');

    return {
      year: Number(year), payments: payments.length, received, salesTax, grossReceipts, paymentFees,
      expenses: expenses.length, spent, lines, byCategory,
      trips: trips.length, miles, mileageDeduction,
      cogs: { begin, purchases: lines['36'] || 0, materials: lines['38'] || 0, other: lines['39'] || 0, end, total: cogs },
      grossProfit, totalExpenses, tentative,
      home: { sqft, months, amount: homeOffice, full: homeFull },
      netProfit, seBase, seTax, warnings,
    };
  }

  // Sales tax charged, by tax profile: invoices by issue date (not drafts or void),
  // plus payments recorded without an invoice. Sorted by tax, largest first.
  function salesTaxReport(data, from, to, labelFor) {
    const rows = new Map();
    const row = (key, name, rate) => {
      if (!rows.has(key)) rows.set(key, { key, name, rate, sales: 0, taxable: 0, tax: 0, count: 0 });
      return rows.get(key);
    };
    const within = (d) => d >= from && d <= to;
    (data.invoices || []).forEach((inv) => {
      if (inv.status === 'draft' || inv.status === 'void' || !within(inv.issueDate || '')) return;
      const t = NB.calc.totals(inv);
      const rate = t.taxRate;
      const key = rate > 0 ? inv.taxProfileId || 'rate:' + rate : 'none';
      const r = row(key, rate > 0 ? labelFor(inv.taxProfileId, inv.taxLabel, rate) : 'No sales tax charged', rate);
      r.sales += t.afterDiscount + t.shipping;
      r.taxable += rate > 0 ? t.taxable : 0;
      r.tax += t.tax;
      r.count += 1;
    });
    (data.payments || []).forEach((p) => {
      if (p.invoiceId || !within(p.date || '')) return;
      const tax = paymentSalesTax(p, null);
      const key = tax > 0 ? p.taxProfileId || 'unassigned' : 'none';
      const r = row(key, tax > 0 ? labelFor(p.taxProfileId, '', null) : 'No sales tax charged', null);
      r.sales += (Math.round(p.amount) || 0) - tax;
      r.taxable += tax > 0 ? (Math.round(p.amount) || 0) - tax : 0;
      r.tax += tax;
      r.count += 1;
    });
    return Array.from(rows.values()).sort((a, b) => b.tax - a.tax || a.name.localeCompare(b.name));
  }

  NB.tax = {
    LINES, EXPENSE_LINES, COGS_LINES, CATEGORIES, MILEAGE_RATES,
    category, businessPercent, businessPortion, deductible, mileageRate, tripDeduction,
    paymentSalesTax, taxIncluded, quarterlyDates, taxYear, salesTaxReport,
  };
})(typeof window !== 'undefined' ? (window.NB = window.NB || {}) : (globalThis.NB = globalThis.NB || {}));
