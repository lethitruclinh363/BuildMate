const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { tally } = require('../services/quotationService');

describe('UT-16: tally — repair quotation cost calculation', () => {
  it('UTCID01 (Normal): calculates both material and labor costs plus transport cost correctly', () => {
    const items = [
      { type: 'MATERIAL', name: 'Water Pipe 20mm', quantity: 2, price: 50000 },
      { type: 'LABOR', name: 'Pipe replacement labor', quantity: 1, price: 200000 },
    ];
    const transportCost = 30000;
    const result = tally(items, transportCost);

    assert.equal(result.materialCost, 100000);
    assert.equal(result.laborCost, 200000);
    assert.equal(result.transportCost, 30000);
    assert.equal(result.totalCost, 330000);
  });

  it('UTCID02 (Normal): calculates labor-only quotation with zero transport cost', () => {
    const items = [
      { type: 'LABOR', name: 'Electrical wire repair', quantity: 2, price: 150000 },
    ];
    const transportCost = 0;
    const result = tally(items, transportCost);

    assert.equal(result.materialCost, 0);
    assert.equal(result.laborCost, 300000);
    assert.equal(result.transportCost, 0);
    assert.equal(result.totalCost, 300000);
  });

  it('UTCID03 (Normal): calculates material-only quotation with transport cost', () => {
    const items = [
      { type: 'MATERIAL', name: 'Cement bag 50kg', quantity: 5, price: 40000 },
    ];
    const transportCost = 25000;
    const result = tally(items, transportCost);

    assert.equal(result.materialCost, 200000);
    assert.equal(result.laborCost, 0);
    assert.equal(result.transportCost, 25000);
    assert.equal(result.totalCost, 225000);
  });

  it('UTCID04 (Normal): calculates multiple line items of both material and labor correctly', () => {
    const items = [
      { type: 'MATERIAL', name: 'Paint 5L', quantity: 2, price: 45000 },
      { type: 'MATERIAL', name: 'Roller brush', quantity: 4, price: 20000 },
      { type: 'LABOR', name: 'Wall prep labor', quantity: 1, price: 150000 },
      { type: 'LABOR', name: 'Painting labor', quantity: 2, price: 100000 },
    ];
    const transportCost = 50000;
    const result = tally(items, transportCost);

    assert.equal(result.materialCost, 170000);
    assert.equal(result.laborCost, 350000);
    assert.equal(result.transportCost, 50000);
    assert.equal(result.totalCost, 570000);
  });

  it('UTCID05 (Normal): correctly coerces string numeric quantities, prices, and transport cost', () => {
    const items = [
      { type: 'MATERIAL', name: 'Tiles 60x60', quantity: '3', price: '60000' },
      { type: 'LABOR', name: 'Tiling labor', quantity: '1', price: '120000' },
    ];
    const transportCost = '20000';
    const result = tally(items, transportCost);

    assert.equal(result.materialCost, 180000);
    assert.equal(result.laborCost, 120000);
    assert.equal(result.transportCost, 20000);
    assert.equal(result.totalCost, 320000);
  });

  it('UTCID06 (Boundary): returns zero for all costs when invoked with default arguments', () => {
    const result = tally();

    assert.equal(result.materialCost, 0);
    assert.equal(result.laborCost, 0);
    assert.equal(result.transportCost, 0);
    assert.equal(result.totalCost, 0);
  });

  it('UTCID07 (Boundary): defaults line quantity to 1 when quantity is omitted or null', () => {
    const items = [
      { type: 'LABOR', name: 'Inspection visit', price: 250000 },
    ];
    const transportCost = 0;
    const result = tally(items, transportCost);

    assert.equal(result.materialCost, 0);
    assert.equal(result.laborCost, 250000);
    assert.equal(result.transportCost, 0);
    assert.equal(result.totalCost, 250000);
  });

  it('UTCID08 (Boundary): treats zero quantity as 0 without defaulting to 1', () => {
    const items = [
      { type: 'MATERIAL', name: 'Adhesive sealant', quantity: 0, price: 80000 },
      { type: 'LABOR', name: 'Grouting labor', quantity: 1, price: 150000 },
    ];
    const transportCost = 0;
    const result = tally(items, transportCost);

    assert.equal(result.materialCost, 0);
    assert.equal(result.laborCost, 150000);
    assert.equal(result.transportCost, 0);
    assert.equal(result.totalCost, 150000);
  });

  it('UTCID09 (Boundary): rounds decimal currency amounts to nearest VND integer via roundVnd', () => {
    const items = [
      { type: 'MATERIAL', name: 'Sand cubic meter', quantity: 3, price: 33333.33 },
      { type: 'LABOR', name: 'Site clearance', quantity: 1, price: 199999.5 },
    ];
    const transportCost = 15000.4;
    const result = tally(items, transportCost);

    // Material: 3 * 33333.33 = 99999.99 -> 100000
    // Labor: 1 * 199999.5 = 199999.5 -> 200000
    // Transport: 15000.4 -> 15000
    // Total: 100000 + 200000 + 15000 = 315000
    assert.equal(result.materialCost, 100000);
    assert.equal(result.laborCost, 200000);
    assert.equal(result.transportCost, 15000);
    assert.equal(result.totalCost, 315000);
  });

  it('UTCID10 (Abnormal): ignores unrecognized item types and sets line amount to 0 for NaN quantity', () => {
    const items = [
      { type: 'EQUIPMENT', name: 'Drill machine rent', quantity: 1, price: 500000 },
      { type: 'LABOR', name: 'Extra technician', quantity: 'invalid', price: 200000 },
    ];
    const transportCost = 10000;
    const result = tally(items, transportCost);

    assert.equal(result.materialCost, 0);
    assert.equal(result.laborCost, 0);
    assert.equal(result.transportCost, 10000);
    assert.equal(result.totalCost, 10000);
  });

  it('UTCID11 (Abnormal): handles missing price and null transportCost safely', () => {
    const items = [
      { type: 'MATERIAL', name: 'Raw screws', quantity: 5 },
      { type: 'LABOR', name: 'Assembly', quantity: 2, price: null },
    ];
    const transportCost = null;
    const result = tally(items, transportCost);

    assert.equal(result.materialCost, 0);
    assert.equal(result.laborCost, 0);
    assert.equal(result.transportCost, 0);
    assert.equal(result.totalCost, 0);
  });

  it('UTCID12 (Abnormal): throws TypeError when items parameter is explicitly null', () => {
    assert.throws(() => tally(null, 0), TypeError);
  });
});

