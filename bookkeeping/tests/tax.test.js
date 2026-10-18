// Unit tests for the tax math. Run with: node --test bookkeeping/tests/tax.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

require('../js/util.js');
require('../js/calc.js');
require('../js/tax.js');
const T = globalThis.NB.tax;

test('deductible amounts follow business use and the meals limit', () => {
  assert.equal(T.deductible({ category: 'materials', amount: 10000 }), 10000);
  assert.equal(T.deductible({ category: 'phone', amount: 8000, businessPercent: 50 }), 4000);
  assert.equal(T.deductible({ category: 'meals', amount: 3000 }), 1500);
  assert.equal(T.deductible({ category: 'meals', amount: 3001, businessPercent: 100 }), 1501); // 1500.5 rounds up
  assert.equal(T.deductible({ category: 'unknown-thing', amount: 500 }), 500); // falls back to "other"
  assert.equal(T.category('nope').id, 'other');
});

test('mileage rates change on their effective dates (2026 mid-year increase)', () => {
  assert.equal(T.mileageRate('2025-12-31'), 70);
  assert.equal(T.mileageRate('2026-01-01'), 72.5);
  assert.equal(T.mileageRate('2026-06-30'), 72.5);
  assert.equal(T.mileageRate('2026-07-01'), 76);
  assert.equal(T.mileageRate('2023-06-01'), 67); // before the table: earliest rate
  assert.equal(T.tripDeduction({ date: '2026-08-01', miles: 100.5 }), 7638);
  assert.equal(T.tripDeduction({ date: '2026-03-01', miles: 10 }, [{ from: '2026-01-01', cents: 80 }]), 800);
});

test('sales tax inside payments', () => {
  const inv = { items: [{ qty: 1, unitPrice: 10000 }], taxRate: 8 }; // total 108.00, tax 8.00
  assert.equal(T.paymentSalesTax({ amount: 5400 }, inv), 400);
  assert.equal(T.paymentSalesTax({ amount: 99999 }, inv), 800); // never more than the invoice's tax
  assert.equal(T.paymentSalesTax({ amount: 5435, salesTax: 435 }, null), 435);
  assert.equal(T.paymentSalesTax({ amount: 100, salesTax: 500 }, null), 100);
  assert.equal(T.taxIncluded(10870, 8.7), 870);
  assert.equal(T.taxIncluded(5000, 0), 0);
});

test('quarterly estimated tax dates skip weekends', () => {
  assert.deepEqual(T.quarterlyDates(2026), ['2026-04-15', '2026-06-15', '2026-09-15', '2027-01-15']);
  assert.equal(T.quarterlyDates(2028)[0], '2028-04-17'); // April 15, 2028 is a Saturday
});

function sampleBooks(extraPayments) {
  const inv = { id: 'i1', status: 'sent', issueDate: '2026-03-01', items: [{ qty: 1, unitPrice: 10000 }], taxRate: 8, taxProfileId: 'az', taxLabel: 'AZ' };
  return {
    invoices: [inv],
    payments: [
      { date: '2026-03-10', amount: 10800, fee: 386, invoiceId: 'i1' },
      { date: '2026-05-02', amount: 5435, salesTax: 435, taxProfileId: 'az' },
      { date: '2025-12-30', amount: 999, fee: 30 },
    ].concat(extraPayments || []),
    expenses: [
      { date: '2026-01-05', category: 'materials', amount: 4000 },
      { date: '2026-01-06', category: 'packaging', amount: 600 },
      { date: '2026-02-01', category: 'booth', amount: 7500 },
      { date: '2026-02-02', category: 'phone', amount: 8000, businessPercent: 50 },
      { date: '2026-02-03', category: 'meals', amount: 3000 },
      { date: '2026-02-04', category: 'fees', amount: 250 },
      { date: '2026-03-01', category: 'parking', amount: 1200 },
      { date: '2025-12-31', category: 'materials', amount: 9999 },
    ],
    mileage: [
      { date: '2026-03-01', miles: 100 },
      { date: '2026-08-01', miles: 50 },
    ],
  };
}

const inputs = { beginInventory: 2000, endInventory: 1500, homeSqft: 100, homeMonths: 12 };

test('tax year: a loss limits the home studio deduction', () => {
  const y = T.taxYear(sampleBooks(), 2026, { inputs });
  assert.equal(y.received, 16235);
  assert.equal(y.salesTax, 1235);
  assert.equal(y.grossReceipts, 15000);
  assert.equal(y.paymentFees, 386);
  assert.equal(y.lines['10'], 636);         // Square fees + marketplace fee
  assert.equal(y.lines['9'], 7250 + 3800 + 1200); // mileage at 72.5c and 76c, plus parking
  assert.equal(y.miles, 150);
  assert.equal(y.cogs.total, 2000 + 4000 + 600 - 1500);
  assert.equal(y.grossProfit, 15000 - 5100);
  assert.equal(y.totalExpenses, 12250 + 636 + 7500 + 1500 + 4000);
  assert.equal(y.tentative, 9900 - 25886);
  assert.equal(y.home.full, 50000);
  assert.equal(y.home.amount, 0);
  assert.equal(y.netProfit, -15986);
  assert.equal(y.seTax, 0);
  assert.equal(y.byCategory.phone.spent, 8000);
  assert.equal(y.byCategory.phone.deductible, 4000);
  assert.equal(y.warnings.length, 1);
});

test('tax year: a profit gets the full home studio deduction and an SE tax estimate', () => {
  const y = T.taxYear(sampleBooks([{ date: '2026-09-01', amount: 1000000 }]), 2026, { inputs });
  assert.equal(y.grossReceipts, 1015000);
  assert.equal(y.home.amount, 50000);
  assert.equal(y.netProfit, 1015000 - 5100 - 25886 - 50000);
  assert.equal(y.seBase, 862562);
  assert.equal(y.seTax, 131972);
});

test('sales tax report groups by profile and keeps untaxed sales apart', () => {
  const books = sampleBooks();
  books.invoices.push({ id: 'i2', status: 'sent', issueDate: '2026-04-01', items: [{ qty: 1, unitPrice: 2500 }], taxRate: 0 });
  books.invoices.push({ id: 'i3', status: 'draft', issueDate: '2026-04-02', items: [{ qty: 1, unitPrice: 9900 }], taxRate: 8, taxProfileId: 'az' });
  const names = { az: 'AZ – Tucson' };
  const rows = T.salesTaxReport(books, '2026-01-01', '2026-12-31', (id, label) => names[id] || label || 'Sales tax');
  const az = rows.find((r) => r.key === 'az');
  assert.equal(az.name, 'AZ – Tucson');
  assert.equal(az.tax, 1235);
  assert.equal(az.taxable, 15000);
  assert.equal(az.count, 2);
  const none = rows.find((r) => r.key === 'none');
  assert.equal(none.sales, 2500);
  assert.equal(rows[0].key, 'az');
});
