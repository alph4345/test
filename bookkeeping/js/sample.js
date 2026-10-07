/* n0va Books · sample.js
 * Example books for trying the app. Everything is marked `sample: true` so it can be
 * removed in one step, and dates are relative to today so the screens look current.
 * People are fictional: example.com addresses and 555-01xx phone numbers. */
(function (NB) {
  'use strict';
  const { Dates } = NB.util;

  const ITEMS = {
    earrings: { description: 'Glow-pulse earrings, rose gold', details: 'Supercapacitor LEDs, charge by USB-C in minutes', unitPrice: 4800 },
    pendant: { description: 'Glow-pulse pendant, rose gold', details: 'Matches the earrings; 18" chain', unitPrice: 5600 },
    oracle: { description: 'Pocket tarot oracle (e-ink)', details: 'Draws a new card at the press of a button', unitPrice: 9500 },
    keychain: { description: 'Custom name keychain', details: '', unitPrice: 1800 },
    keychainWholesale: { description: 'Custom name keychain (wholesale)', details: '', unitPrice: 900 },
    coasters: { description: 'Resin coaster set (4)', details: '', unitPrice: 3600 },
    coastersWholesale: { description: 'Resin coaster set (4, wholesale)', details: '', unitPrice: 1800 },
    musicBox: { description: 'Music box charm', details: 'Plays one tune you choose', unitPrice: 4200 },
    engraving: { description: 'Custom engraving', details: '', unitPrice: 1200 },
    wrap: { description: 'Gift wrap & card', details: '', unitPrice: 500 },
  };

  function item(key, qty, overrides) {
    return Object.assign({ id: 'it-' + Math.random().toString(36).slice(2, 10), qty: qty }, ITEMS[key], overrides || {});
  }

  function build(today, settings) {
    const D = (n) => Dates.addDays(today, n);
    const at = (iso) => {
      const d = Dates.parse(iso);
      d.setHours(12, 0, 0, 0);
      return d.toISOString();
    };
    const num = (kind, seq) => settings.numbering[kind].prefix + String(seq).padStart(settings.numbering.pad || 4, '0');
    const methods = settings.paymentMethods;
    const fallback = NB.store ? NB.store.DEFAULT_METHODS : [];
    const method = (id) => methods.find((m) => m.id === id) || fallback.find((m) => m.id === id) || { id, name: id };
    const base = (date) => ({ sample: true, createdAt: at(date), updatedAt: at(date) });
    const docBase = {
      discountType: 'none', discountPercent: 0, discountAmount: 0, shipping: 0, taxRate: 0, taxShipping: false, internalNotes: '',
    };

    const customers = [
      Object.assign(base(D(-260)), {
        id: 'sample-juniper', name: 'Juniper Hale', company: '', email: 'juniper@example.com', phone: '(555) 010-4417',
        social: '@juniper.makes', address1: '2210 SE Alder St', address2: '', city: 'Portland', region: 'OR', postal: '97214', country: '',
        tags: ['market regular'], notes: 'Found us at the spring makers market. Loves anything that glows.', archived: false,
      }),
      Object.assign(base(D(-25)), {
        id: 'sample-marisol', name: 'Marisol Vega', company: '', email: 'marisol.vega@example.com', phone: '(555) 010-2290',
        social: '', address1: '418 N 4th Ave', address2: 'Apt 3', city: 'Tucson', region: 'AZ', postal: '85705', country: '',
        tags: ['custom order', 'wedding'], notes: 'Bridal party set for the wedding. Rose gold only, no nickel (sensitive ears).', archived: false,
      }),
      Object.assign(base(D(-130)), {
        id: 'sample-oddfellows', name: 'Theo Park', company: 'Odd Fellows Coffee', email: 'theo@example.com', phone: '(555) 010-7731',
        social: '', address1: '95 Market St', address2: '', city: 'Bend', region: 'OR', postal: '97701', country: '',
        tags: ['wholesale'], notes: 'Wholesale at 50% of retail, Net 30. Restocks before the holidays.', archived: false,
      }),
      Object.assign(base(D(-215)), {
        id: 'sample-priya', name: 'Priya Raman', company: '', email: 'priya.r@example.com', phone: '',
        social: '@priya.reads', address1: '77 Linden Ave', address2: '', city: 'Ithaca', region: 'NY', postal: '14850', country: '',
        tags: ['instagram'], notes: 'Ships to NY, so sales tax applies.', archived: false,
      }),
      Object.assign(base(D(-95)), {
        id: 'sample-sam', name: 'Sam Okafor', company: '', email: 'sam.okafor@example.com', phone: '(555) 010-8862',
        social: '', address1: '', address2: '', city: 'Spokane', region: 'WA', postal: '', country: '',
        tags: ['gift'], notes: 'Birthday gift for his sister in early December.', archived: false,
      }),
    ];

    const estimates = [
      Object.assign(base(D(-20)), docBase, {
        id: 'sample-est-1', number: num('estimate', 1), seq: 1, customerId: 'sample-marisol', title: 'Bridal party earrings',
        issueDate: D(-20), validUntil: D(10), items: [item('earrings', 6), item('wrap', 6)],
        discountType: 'percent', discountPercent: 10, depositPercent: 50,
        notes: settings.docs.estimateNotes, status: 'accepted', sentAt: at(D(-20)), acceptedAt: at(D(-13)), invoiceId: 'sample-inv-3',
      }),
      Object.assign(base(D(-10)), docBase, {
        id: 'sample-est-2', number: num('estimate', 2), seq: 2, customerId: 'sample-sam', title: 'Birthday music box',
        issueDate: D(-10), validUntil: D(20), items: [item('musicBox', 1), item('engraving', 1, { details: 'Name on the lid' }), item('wrap', 1)],
        depositPercent: 50, notes: settings.docs.estimateNotes, status: 'sent', sentAt: at(D(-10)),
      }),
      Object.assign(base(D(-1)), docBase, {
        id: 'sample-est-3', number: num('estimate', 3), seq: 3, customerId: 'sample-oddfellows', title: 'Holiday restock',
        issueDate: D(-1), validUntil: D(29), items: [item('keychainWholesale', 36), item('coastersWholesale', 12)],
        depositPercent: 0, notes: 'Wholesale pricing. Ships two weeks after approval.', status: 'draft',
      }),
    ];

    const invoices = [
      Object.assign(base(D(-62)), docBase, {
        id: 'sample-inv-1', number: num('invoice', 1), seq: 1, customerId: 'sample-juniper', title: 'Earrings and keychains',
        issueDate: D(-62), dueDate: D(-48), items: [item('earrings', 1), item('keychain', 2, { details: 'JUNE and ROWAN' })],
        notes: settings.docs.invoiceNotes, paymentLink: '', status: 'sent', sentAt: at(D(-62)),
      }),
      Object.assign(base(D(-40)), docBase, {
        id: 'sample-inv-2', number: num('invoice', 2), seq: 2, customerId: 'sample-oddfellows', title: 'Fall wholesale order',
        issueDate: D(-40), dueDate: D(-10), items: [item('keychainWholesale', 24), item('coastersWholesale', 6)],
        notes: 'Net 30. Thanks for stocking handmade!', paymentLink: '', status: 'sent', sentAt: at(D(-40)),
      }),
      Object.assign(base(D(-12)), docBase, {
        id: 'sample-inv-3', number: num('invoice', 3), seq: 3, customerId: 'sample-marisol', title: 'Bridal party earrings',
        issueDate: D(-12), dueDate: D(18), items: [item('earrings', 6), item('wrap', 6)],
        discountType: 'percent', discountPercent: 10, notes: 'The 50% deposit is received. The balance is due before the wedding.',
        paymentLink: '', status: 'sent', sentAt: at(D(-12)), estimateId: 'sample-est-1',
      }),
      Object.assign(base(D(-3)), docBase, {
        id: 'sample-inv-4', number: num('invoice', 4), seq: 4, customerId: 'sample-priya', title: 'Tarot oracle, engraved',
        issueDate: D(-3), dueDate: D(11), items: [item('oracle', 1), item('engraving', 1, { details: 'Moon phases on the back' })],
        shipping: 850, taxRate: 8, notes: settings.docs.invoiceNotes, paymentLink: 'https://example.com/pay/sample-invoice',
        status: 'sent', sentAt: at(D(-3)),
      }),
      Object.assign(base(D(0)), docBase, {
        id: 'sample-inv-5', number: num('invoice', 5), seq: 5, customerId: 'sample-juniper', title: 'Matching pendant',
        issueDate: D(0), dueDate: D(14), items: [item('pendant', 1)], notes: settings.docs.invoiceNotes, paymentLink: '', status: 'draft',
      }),
    ];

    const pay = (seq, date, amount, methodId, extra) => {
      const m = method(methodId);
      return Object.assign(base(date), {
        id: 'sample-pay-' + seq, receiptNumber: num('receipt', seq), receiptSeq: seq, date, amount,
        methodId: m.id, methodName: m.name, fee: NB.calc.feeFor(m, amount), reference: '', customerId: null, invoiceId: null, memo: '', notes: '',
      }, extra);
    };

    const payments = [
      pay(1, D(-250), 4200, 'square-in-person', { customerId: 'sample-juniper', memo: 'Music box charm, spring makers market' }),
      pay(2, D(-210), 9500, 'square-online', { customerId: 'sample-priya', memo: 'Pocket tarot oracle' }),
      pay(3, D(-160), 6400, 'cash', { customerId: 'sample-juniper', memo: 'Custom keychains, summer craft fair' }),
      pay(4, D(-120), 18000, 'check', { customerId: 'sample-oddfellows', memo: 'Spring wholesale restock', reference: 'Check #1027' }),
      pay(5, D(-90), 3600, 'square-in-person', { customerId: 'sample-sam', memo: 'Resin coaster set' }),
      pay(6, D(-60), 8400, 'square-in-person', { customerId: 'sample-juniper', invoiceId: 'sample-inv-1', reference: 'Square receipt 7HQ2' }),
      pay(7, D(-20), 15000, 'check', { customerId: 'sample-oddfellows', invoiceId: 'sample-inv-2', reference: 'Check #1042' }),
      pay(8, D(-11), 14310, 'square-online', { customerId: 'sample-marisol', invoiceId: 'sample-inv-3', reference: 'Square receipt 3MZK', memo: 'Deposit' }),
      pay(9, D(-2), 3600, 'square-in-person', { customerId: 'sample-priya', memo: 'Two keychains for book club' }),
    ];

    return { customers, estimates, invoices, payments };
  }

  NB.sample = { build };
})(window.NB = window.NB || {});
