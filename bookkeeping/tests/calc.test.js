// Unit tests for the money math. Run with: node --test bookkeeping/tests
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

require('../js/util.js');
require('../js/calc.js');
const { Money, Dates, roundMinor, csv } = globalThis.NB.util;
const { totals, invoiceState, estimateState, feeFor, monthly, index } = globalThis.NB.calc;

test('roundMinor rounds half away from zero without float noise', () => {
  assert.equal(roundMinor(1.005 * 100), 101);
  assert.equal(roundMinor(2998.5), 2999);
  assert.equal(roundMinor(-2.5), -3);
  assert.equal(roundMinor(0.1 * 3 * 1000), 300);
  assert.equal(Object.is(roundMinor(-0.2), 0), true);
});

test('Money.parse reads what people type', () => {
  assert.equal(Money.parse('12', 'USD'), 1200);
  assert.equal(Money.parse('12.5', 'USD'), 1250);
  assert.equal(Money.parse('$1,234.56', 'USD'), 123456);
  assert.equal(Money.parse('1.234,56', 'EUR'), 123456);
  assert.equal(Money.parse('12,50', 'EUR'), 1250);
  assert.equal(Money.parse('1,234', 'USD'), 123400);
  assert.equal(Money.parse('(5.00)', 'USD'), -500);
  assert.equal(Money.parse('', 'USD'), 0);
  assert.ok(Number.isNaN(Money.parse('abc', 'USD')));
  assert.equal(Money.parse('1500', 'JPY'), 1500);
});

test('parseDecimal reads quantities with either decimal mark', () => {
  const { parseDecimal } = globalThis.NB.util;
  assert.equal(parseDecimal('1,5'), 1.5);
  assert.equal(parseDecimal('2.25'), 2.25);
  assert.equal(parseDecimal('1,000'), 1000);
  assert.equal(parseDecimal('1.234,5'), 1234.5);
  assert.equal(parseDecimal(''), 0);
  assert.ok(Number.isNaN(parseDecimal('x')));
});

test('Money.format and toInput respect the currency', () => {
  assert.equal(Money.format(123456, 'USD', 'en-US'), '$1,234.56');
  assert.equal(Money.format(-500, 'USD', 'en-US'), '-$5.00');
  assert.equal(Money.format(1500, 'JPY', 'en-US'), '¥1,500');
  assert.equal(Money.toInput(1250, 'USD'), '12.50');
});

test('Dates helpers work on local calendar days', () => {
  assert.equal(Dates.addDays('2026-10-07', 14), '2026-10-21');
  assert.equal(Dates.addDays('2026-12-25', 10), '2027-01-04');
  assert.equal(Dates.diff('2026-10-07', '2026-10-21'), 14);
  assert.equal(Dates.diff('2026-03-07', '2026-03-09'), 2); // across a DST change
  assert.equal(Dates.addMonths('2026-01', -1), '2025-12');
  assert.equal(Dates.valid('2026-02-30'), false);
  assert.equal(Dates.valid('2026-02-28'), true);
});

const doc = {
  items: [
    { qty: 2, unitPrice: 4800 },  // 96.00
    { qty: 1.5, unitPrice: 1999 }, // 29.985 -> 29.99
  ],
  discountType: 'percent',
  discountPercent: 10,
  shipping: 600,
  taxRate: 8.25,
  taxShipping: false,
  depositPercent: 50,
};

test('totals: discount, shipping, tax and deposit', () => {
  const t = totals(doc);
  assert.deepEqual(t.lines, [9600, 2999]);
  assert.equal(t.subtotal, 12599);
  assert.equal(t.discount, 1260);          // 10% of 125.99 = 12.599 -> 12.60
  assert.equal(t.afterDiscount, 11339);
  assert.equal(t.tax, 935);                // 8.25% of 113.39 = 9.3547 -> 9.35
  assert.equal(t.total, 11339 + 600 + 935);
  assert.equal(t.deposit, 6437);           // 50% of 128.74
});

test('totals: taxable shipping and fixed discounts are capped', () => {
  const t = totals({ ...doc, taxShipping: true, discountType: 'amount', discountAmount: 999999 });
  assert.equal(t.discount, t.subtotal);
  assert.equal(t.taxable, 600);
  assert.equal(t.tax, 50); // 8.25% of 6.00 = 0.495 -> 0.50
});

test('invoiceState follows payments and due dates', () => {
  const inv = { id: 'i1', status: 'sent', dueDate: '2026-10-10', items: [{ qty: 1, unitPrice: 10000 }] };
  const pay = (amount) => [{ invoiceId: 'i1', amount }];
  assert.equal(invoiceState(inv, [], '2026-10-07').key, 'open');
  assert.equal(invoiceState(inv, pay(4000), '2026-10-07').key, 'partial');
  assert.equal(invoiceState(inv, pay(4000), '2026-10-07').balance, 6000);
  assert.equal(invoiceState(inv, pay(4000), '2026-10-12').key, 'overdue');
  assert.equal(invoiceState(inv, pay(4000), '2026-10-12').daysOverdue, 2);
  assert.equal(invoiceState(inv, pay(10000), '2026-10-12').key, 'paid');
  assert.equal(invoiceState({ ...inv, status: 'draft' }, [], '2026-10-07').key, 'draft');
  assert.equal(invoiceState({ ...inv, status: 'draft' }, pay(100), '2026-10-07').key, 'partial');
  assert.equal(invoiceState({ ...inv, status: 'void' }, [], '2026-10-12').balance, 0);
});

test('estimateState', () => {
  const est = { status: 'sent', validUntil: '2026-10-10', items: [] };
  assert.equal(estimateState(est, '2026-10-07').key, 'sent');
  assert.equal(estimateState(est, '2026-10-11').key, 'expired');
  assert.equal(estimateState({ ...est, status: 'accepted' }, '2026-10-11').key, 'accepted');
  assert.equal(estimateState({ ...est, invoiceId: 'x' }, '2026-10-11').key, 'invoiced');
});

test('feeFor uses percent + fixed with a minimum', () => {
  const inPerson = { feePercent: 2.6, feeFixed: 15 };
  assert.equal(feeFor(inPerson, 10000), 275);
  assert.equal(feeFor({ feePercent: 3.3, feeFixed: 30 }, 4500), 179); // 148.5 -> 149 + 30
  assert.equal(feeFor({ feePercent: 1, feeMin: 100 }, 5000), 100);
  assert.equal(feeFor({ feePercent: 0 }, 5000), 0);
  assert.equal(feeFor(inPerson, 0), 0);
});

test('monthly buckets and index rollups', () => {
  const payments = [
    { date: '2026-10-02', amount: 5000, fee: 145, customerId: 'c1', invoiceId: 'i1' },
    { date: '2026-09-30', amount: 2000, fee: 0, customerId: 'c1' },
    { date: '2025-09-30', amount: 999, fee: 0 },
  ];
  const m = monthly(payments, '2026-10', 12);
  assert.equal(m.length, 12);
  assert.equal(m[11].month, '2026-10');
  assert.equal(m[11].net, 4855);
  assert.equal(m[10].gross, 2000);
  assert.equal(m[0].month, '2025-11');

  const data = {
    customers: [{ id: 'c1' }],
    invoices: [{ id: 'i1', customerId: 'c1', status: 'sent', issueDate: '2026-09-01', dueDate: '2026-09-15', items: [{ qty: 1, unitPrice: 8000 }] }],
    estimates: [],
    payments,
  };
  const ix = index(data, '2026-10-07');
  assert.equal(ix.inv.get('i1').key, 'overdue');
  assert.equal(ix.byCustomer.get('c1').open, 3000);
  assert.equal(ix.byCustomer.get('c1').paid, 7000);
  assert.equal(ix.byCustomer.get('c1').last, '2026-10-02');
});

test('csv quotes and neutralises formulas', () => {
  const out = csv([{ a: 'Hi, "you"', b: '=SUM(A1)', c: '-12.50' }], [
    { label: 'A', value: (r) => r.a },
    { label: 'B', value: (r) => r.b },
    { label: 'C', value: (r) => r.c },
  ]);
  assert.equal(out, 'A,B,C\r\n"Hi, ""you""",\'=SUM(A1),-12.50\r\n');
});
