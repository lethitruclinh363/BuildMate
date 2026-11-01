const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const { createQuotationSchema } = require('../validators/sprint4.validator');
const { itemBody, createQuoteSchema } = require('../validators/material-requirement.validator');
const { finiteNumber } = require('../utils/validator');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
const BACKEND_ROOT = path.resolve(__dirname, '..');

function readFe(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

function readBe(rel) {
  return fs.readFileSync(path.join(BACKEND_ROOT, rel), 'utf8');
}

const quoteBase = {
  requestId: '507f1f77bcf86cd799439011',
  items: [{ type: 'LABOR', name: 'Pipe repair', quantity: 1, price: 200000 }],
};

describe('numeric validation — business fields reject negatives and non-finite values', () => {
  it('rejects estimated days below 1 and non-finite values, accepts 1', () => {
    assert.throws(() => createQuotationSchema.parse({ ...quoteBase, estimatedDays: -1 }));
    assert.throws(() => createQuotationSchema.parse({ ...quoteBase, estimatedDays: 0 }));
    assert.throws(() => createQuotationSchema.parse({ ...quoteBase, estimatedDays: 1.5 }));
    assert.throws(() => createQuotationSchema.parse({ ...quoteBase, estimatedDays: Infinity }));
    assert.throws(() => createQuotationSchema.parse({ ...quoteBase, estimatedDays: Number.NaN }));
    assert.equal(createQuotationSchema.parse({ ...quoteBase, estimatedDays: 1 }).estimatedDays, 1);
  });

  it('rejects labor quantity below 1 and negative prices, allows zero cost', () => {
    assert.throws(() => createQuotationSchema.parse({
      ...quoteBase,
      items: [{ type: 'LABOR', name: 'Pipe repair', quantity: -5, price: 200000 }],
    }));
    assert.throws(() => createQuotationSchema.parse({
      ...quoteBase,
      items: [{ type: 'LABOR', name: 'Pipe repair', quantity: 0, price: 200000 }],
    }));
    assert.equal(createQuotationSchema.parse({
      ...quoteBase,
      items: [{ type: 'LABOR', name: 'Pipe repair', quantity: 1, price: 200000 }],
    }).items[0].quantity, 1);
    assert.throws(() => createQuotationSchema.parse({
      ...quoteBase,
      items: [{ type: 'LABOR', name: 'Pipe repair', quantity: 1, price: -100000 }],
    }));
    assert.throws(() => createQuotationSchema.parse({
      ...quoteBase,
      items: [{ type: 'LABOR', name: 'Pipe repair', quantity: 1, price: Infinity }],
    }));
    assert.equal(createQuotationSchema.parse({
      ...quoteBase,
      items: [{ type: 'LABOR', name: 'Pipe repair', quantity: 1, price: 0 }],
      transportCost: 0,
    }).items[0].price, 0);
    assert.throws(() => createQuotationSchema.parse({ ...quoteBase, transportCost: -1 }));
  });

  it('rejects invalid material quantities and still allows decimal qty when greater than zero', () => {
    assert.throws(() => itemBody.parse({ name: 'Cement PCB40', quantity: -5 }));
    assert.throws(() => itemBody.parse({ name: 'Cement PCB40', quantity: 0 }));
    assert.throws(() => itemBody.parse({ name: 'Cement PCB40', quantity: Infinity }));
    assert.equal(itemBody.parse({ name: 'Cement PCB40', quantity: 1 }).quantity, 1);
    assert.equal(itemBody.parse({ name: 'Ong nuoc', quantity: 0.5, unit: 'm' }).quantity, 0.5);
    assert.throws(() => createQuoteSchema.parse({
      items: [{ itemId: 'item1', unitPrice: -1, availableQty: 2 }],
    }));
    assert.throws(() => createQuoteSchema.parse({
      items: [{ itemId: 'item1', unitPrice: 1000, availableQty: -1 }],
    }));
    assert.equal(createQuoteSchema.parse({
      items: [{ itemId: 'item1', unitPrice: 1000, availableQty: 0 }],
    }).items[0].availableQty, 0);
  });

  it('exports a shared finiteNumber helper and applies it on quotation money and days', () => {
    assert.throws(() => finiteNumber().parse(Infinity));
    assert.throws(() => finiteNumber().parse(Number.NaN));
    assert.equal(finiteNumber().min(0).parse(0), 0);
    const quote = readBe('validators/sprint4.validator.js');
    assert.match(quote, /finiteNumber\(\)/);
    assert.match(quote, /estimatedDays: finiteNumber\(\)\.int\(\)\.min\(1\)\.max\(180\)/);
    assert.match(quote, /quantity: finiteNumber\(\)\.int\(\)\.min\(1\)/);
  });

  it('blocks minus on business number inputs and requires estimated days min 1 on the quotation form', () => {
    const input = readFe('components/ui/Input.tsx');
    const helper = readFe('lib/numeric-input.ts');
    const page = readFe('pages/contractor/CreateQuotationPage.tsx');
    assert.match(helper, /guardNumberKeyDown/);
    assert.match(helper, /guardNumberPaste/);
    assert.match(input, /guardNumberKeyDown/);
    assert.match(input, /guardNumberPaste/);
    assert.match(page, /id="days"/);
    assert.match(page, /min=\{1\}/);
    assert.match(page, /quote\.daysInvalid|validation\.minNumber/);
  });
});
