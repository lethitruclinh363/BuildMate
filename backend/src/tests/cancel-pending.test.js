const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REQUEST_STATUS } = require('../models/RepairRequest');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
const BACKEND_ROOT = path.resolve(__dirname, '..');

function readFe(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

function readBe(rel) {
  return fs.readFileSync(path.join(BACKEND_ROOT, rel), 'utf8');
}

describe('Customer cancel PENDING repair request', () => {
  it('keeps CANCELLED in the existing status enum without a schema change', () => {
    assert.equal(REQUEST_STATUS.CANCELLED, 'CANCELLED');
    const schema = fs.readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
    const block = schema.slice(schema.indexOf('model repair_requests'), schema.indexOf('model reviews'));
    assert.match(block, /status\s+String\s+@default\("PENDING"\)/);
    assert.doesNotMatch(block, /ALTER TABLE repair_requests/i);
  });

  it('cancels only PENDING with a conditional PostgreSQL update', () => {
    const service = readBe('services/repairService.js');
    const postgres = readBe('repositories/conversation.postgres.js');
    assert.match(service, /async function cancelPending/);
    assert.match(service, /claimCustomerPending/);
    assert.match(postgres, /async function claimCustomerPending/);
    assert.match(postgres, /status: 'PENDING'/);
    assert.match(postgres, /updateMany/);
    assert.doesNotMatch(service, /prisma\.repair_requests\.update\(\{[^}]*status: 'CANCELLED'/);
  });

  it('wires customer-only cancel on history with a confirm modal', () => {
    const history = readFe('pages/customer/RequestHistoryPage.tsx');
    const api = readFe('features/chat/services/sprint4.api.ts');
    const vi = fs.readFileSync(path.join(FRONTEND_ROOT, 'locales/vi/marketplace.json'), 'utf8');
    const en = fs.readFileSync(path.join(FRONTEND_ROOT, 'locales/en/marketplace.json'), 'utf8');
    const commonVi = fs.readFileSync(path.join(FRONTEND_ROOT, 'locales/vi/common.json'), 'utf8');
    assert.match(api, /cancel:\s*\(id:\s*string\)/);
    assert.match(history, /item\.status === 'PENDING'/);
    assert.match(history, /ConfirmModal/);
    assert.match(history, /cancellingId/);
    assert.match(vi, /"cancelCta": "Hủy yêu cầu"/);
    assert.match(vi, /"confirmCancel": "Xác nhận hủy"/);
    assert.match(vi, /"cancelBack": "Quay lại"/);
    assert.match(en, /"cancelCta": "Cancel request"/);
    assert.match(commonVi, /"CANCELLED": "Đã hủy"/);
  });

  it('does not touch finance, MRL, or store chat when cancelling a request', () => {
    const service = readBe('services/repairService.js');
    assert.doesNotMatch(service, /createMaterialOrder|snapshotContractorQuote|DEPOSIT_RATE/);
    assert.doesNotMatch(service, /ChatRoom\.delete|deleteMany/);
    assert.match(readBe('utils/contractor-finance.js'), /DEPOSIT_RATE\s*=\s*0\.15/);
    assert.match(readBe('services/chatService.js'), /createRoomForStore/);
    assert.match(readBe('services/material-requirement.service.js'), /cancelList/);
  });
});
