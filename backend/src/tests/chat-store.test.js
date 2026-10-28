const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  ROOM_KIND,
  canCreateStoreRoom,
  canSendInStoreRoom,
  quotationAllowed,
  chatPathForRole,
} = require('../utils/chat-room.rules');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
const BACKEND_ROOT = path.resolve(__dirname, '..');

function readFe(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

function readBe(rel) {
  return fs.readFileSync(path.join(BACKEND_ROOT, rel), 'utf8');
}

describe('Customer–Material Store chat rules', () => {
  it('creates a store room only for a LIVE materials store', () => {
    assert.equal(canCreateStoreRoom({ status: 'LIVE', storeType: 'MATERIALS' }), true);
    assert.equal(canCreateStoreRoom({ status: 'LIVE', storeType: 'BOTH' }), true);
    assert.equal(canCreateStoreRoom({ status: 'PAUSED', storeType: 'MATERIALS' }), false);
    assert.equal(canCreateStoreRoom({ status: 'LIVE', storeType: 'SERVICES' }), false);
    assert.equal(canCreateStoreRoom({ status: 'LIVE', storeType: 'MATERIALS', ownerBlocked: true }), false);
  });

  it('keeps history after pause but blocks send when the owner is locked', () => {
    assert.equal(canSendInStoreRoom({ accountStatus: 'ACTIVE' }), true);
    assert.equal(canSendInStoreRoom({ accountStatus: 'ACTIVE', storeStatus: 'PAUSED' }), true);
    assert.equal(canSendInStoreRoom({ accountStatus: 'ACTIVE', storeStatus: 'LIVE' }), true);
    assert.equal(canSendInStoreRoom({ accountStatus: 'BLOCKED' }), false);
    assert.equal(canSendInStoreRoom({ accountStatus: 'BANNED' }), false);
    assert.equal(canSendInStoreRoom({ accountStatus: 'ACTIVE', storeStatus: 'BLOCKED' }), false);
    assert.equal(quotationAllowed(ROOM_KIND.CUSTOMER_MATERIAL_STORE), false);
    assert.equal(quotationAllowed(ROOM_KIND.CUSTOMER_CONTRACTOR), true);
    assert.equal(chatPathForRole('CUSTOMER', 'abc'), '/customer/chat/abc');
    assert.equal(chatPathForRole('MATERIAL_STORE_OWNER', 'abc'), '/store/chat/abc');
    assert.equal(chatPathForRole('CONTRACTOR', 'abc'), '/contractor/chat/abc');
  });
});

describe('Customer–Material Store chat source wiring', () => {
  it('adds a store-kind discriminator without dropping repair-request uniqueness', () => {
    const schema = fs.readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
    const roomsBlock = schema.slice(schema.indexOf('model chat_rooms'), schema.indexOf('model commission_rules'));
    assert.match(roomsBlock, /room_kind/);
    assert.match(roomsBlock, /store_id/);
    assert.match(roomsBlock, /repair_request_id\s+BigInt\?/);
    const sql = fs.readFileSync(path.resolve(__dirname, '../../scripts/dev-db/20-customer-store-chat.sql'), 'utf8');
    assert.match(sql, /CUSTOMER_MATERIAL_STORE/);
    assert.match(sql, /uq_chat_rooms_customer_store/);
    assert.match(sql, /BuilMate_dev|chat_rooms/);
    assert.doesNotMatch(sql, /DROP TABLE chat_rooms/i);
  });

  it('opens or reuses a Customer–Store room and hides it from contractors', () => {
    const chat = readBe('services/chatService.js');
    const routes = readBe('routes/chatRoutes.js');
    const app = readFe('App.tsx');
    const storeNav = readFe('pages/store/StoreDashboard.jsx');
    const showcase = readFe('pages/public/StoreProfileShowcase.tsx');
    const explore = readFe('features/map/components/ExplorePopup.tsx');
    assert.match(chat, /createRoomForStore/);
    assert.match(chat, /CUSTOMER_MATERIAL_STORE/);
    assert.match(chat, /Only customers can start a store chat/);
    assert.match(chat, /Repair quotations cannot be sent in a store chat/);
    assert.match(routes, /stores\/:storeId\/rooms/);
    assert.match(app, /path="\/store\/chat"/);
    assert.match(storeNav, /\/store\/chat/);
    assert.match(showcase, /ChatStoreButton/);
    assert.match(explore, /openStoreRoom|kind === 'store'/);
    assert.match(readFe('lib/material-requirement-api.ts'), /material-requirements/);
  });

  it('does not create COD, escrow, or repair quotation from store chat', () => {
    const chat = readBe('services/chatService.js');
    assert.doesNotMatch(chat, /createMaterialOrder|material-checkout|snapshotContractorQuote/);
    assert.match(readBe('utils/contractor-finance.js'), /DEPOSIT_RATE\s*=\s*0\.15/);
    assert.match(readBe('utils/contractor-finance.js'), /PLATFORM_FEE_RATE\s*=\s*0\.05/);
  });
});
