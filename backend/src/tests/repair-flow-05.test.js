const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REQUEST_STATUS } = require('../models/RepairRequest');
const { createRepairSchema } = require('../validators/sprint4.validator');
const { replayFingerprint, isReplayOf, REPLAY_WINDOW_MS } = require('../services/repairService');
const { testDatabaseReady } = require('./helpers/pg-cleanup');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
const BACKEND_ROOT = path.resolve(__dirname, '..');

function readFe(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

function readBe(rel) {
  return fs.readFileSync(path.join(BACKEND_ROOT, rel), 'utf8');
}

describe('Flow 05 repair request statuses and ACL', () => {
  it('keeps the five REQUEST_STATUS values already in the model', () => {
    assert.deepEqual(Object.keys(REQUEST_STATUS).sort(), [
      'ACCEPTED',
      'CANCELLED',
      'COMPLETED',
      'PENDING',
      'REJECTED',
    ]);
    assert.equal(REQUEST_STATUS.PENDING, 'PENDING');
    assert.equal(REQUEST_STATUS.ACCEPTED, 'ACCEPTED');
    assert.equal(REQUEST_STATUS.REJECTED, 'REJECTED');
    assert.equal(REQUEST_STATUS.COMPLETED, 'COMPLETED');
    assert.equal(REQUEST_STATUS.CANCELLED, 'CANCELLED');
  });

  it('lets the assigned contractor accept or reject only from PENDING', () => {
    const src = readBe('services/repairService.js');
    assert.match(src, /REQUEST_STATUS\.ACCEPTED, REQUEST_STATUS\.REJECTED/);
    assert.match(src, /claimPending/);
    assert.match(src, /This request is no longer pending/);
    assert.match(src, /You cannot view this request/);
    assert.match(src, /cancelPending/);
    assert.match(src, /claimCustomerPending/);
    assert.match(src, /REQUEST_STATUS\.CANCELLED/);
    assert.doesNotMatch(src, /createEscrow|createCommission|refundDeposit/);
  });

  it('lets the owning customer cancel a PENDING request and refuses everyone else', () => {
    const src = readBe('routes/repairRoutes.js');
    assert.match(src, /authenticate/);
    assert.match(src, /authorize\(ROLES\.CUSTOMER\)/);
    assert.match(src, /authorize\(ROLES\.CONTRACTOR\)/);
    assert.match(src, /\/:id\/accept/);
    assert.match(src, /\/:id\/reject/);
    assert.match(src, /\/:id\/cancel/);
    const service = readBe('services/repairService.js');
    assert.match(service, /status: REQUEST_STATUS\.PENDING/);
    assert.match(service, /This request is already cancelled/);
    assert.match(service, /You cannot cancel this request/);
    const postgres = readBe('repositories/conversation.postgres.js');
    assert.match(postgres, /claimCustomerPending/);
    assert.match(postgres, /updateMany/);
  });

  it('requires a live visible contractor and confirmed site before create', () => {
    const src = readBe('services/repairService.js');
    assert.match(src, /getActivationReadiness/);
    assert.match(src, /readiness\.visible/);
    assert.match(src, /Confirm the site location/);
    assert.match(src, /This partner is not accepting new requests/);
  });

  it('accepts the declared repair media counts and video size', () => {
    const routes = readBe('routes/repairRoutes.js');
    const upload = readBe('middleware/uploadMiddleware.js');
    assert.match(routes, /name: 'images', maxCount: 8/);
    assert.match(routes, /name: 'videos', maxCount: 2/);
    assert.match(upload, /files: scope === 'repair' \? 10 : 6/);
    assert.match(upload, /scope === 'repair' \|\| scope === 'chat' \? '\.mp4'/);
  });
});

describe('Flow 05 quotation gate', () => {
  it('blocks createQuotation until the repair request is ACCEPTED', () => {
    const src = readBe('services/quotationService.js');
    assert.match(src, /request\.status !== REQUEST_STATUS\.ACCEPTED/);
    assert.match(src, /Accept this request before sending a quotation/);
    assert.match(src, /This request was rejected/);
    assert.match(src, /This request was cancelled/);
    assert.match(src, /This request is already completed/);
    assert.doesNotMatch(src, /or quote later/);
  });

  it('hides the quote action on frontend until ACCEPTED', () => {
    const requests = readFe('pages/contractor/ContractorRequestsPage.tsx');
    const quotePage = readFe('pages/contractor/CreateQuotationPage.tsx');
    const chat = readFe('pages/chat/ChatPage.tsx');
    const types = readFe('types/sprint4.ts');
    assert.match(types, /status === 'ACCEPTED'/);
    assert.match(requests, /canCreateQuotation\(item\.status\)/);
    assert.match(quotePage, /canCreateQuotation\(next\.status\)/);
    assert.match(quotePage, /This request was cancelled/);
    assert.match(chat, /canCreateQuotation\(room\??\.request\?\.status\)/);
  });
});

describe('Flow 05 create validation and replay', () => {
  it('rejects a create payload missing required fields', () => {
    assert.throws(() => createRepairSchema.parse({ contractorId: 'abc', category: 'PLUMBING', title: 'ab', description: 'short' }));
    const parsed = createRepairSchema.parse({
      contractorId: '507f1f77bcf86cd799439011',
      category: 'PLUMBING',
      title: 'Leaking pipe',
      description: 'Water under the sink overnight',
    });
    assert.equal(parsed.title, 'Leaking pipe');
  });

  it('fingerprints the same customer action and allows a later distinct request', () => {
    const payload = {
      contractorId: 'c1',
      catalogServiceId: 'Electrical::Wiring',
      title: 'Ceiling leak',
      description: 'Water coming through the ceiling',
      lat: 10.04512,
      lng: 105.78734,
    };
    const same = replayFingerprint('cust-1', payload);
    const again = replayFingerprint('cust-1', { ...payload, lat: 10.045119 });
    const otherTitle = replayFingerprint('cust-1', { ...payload, title: 'Kitchen leak' });
    assert.equal(same, again);
    assert.notEqual(same, otherTitle);
    assert.ok(REPLAY_WINDOW_MS >= 30 * 1000);
    const recent = { title: payload.title, description: payload.description, catalogServiceId: payload.catalogServiceId, createdAt: new Date() };
    assert.equal(isReplayOf(recent, payload), true);
    const stale = { ...recent, createdAt: new Date(Date.now() - REPLAY_WINDOW_MS - 1000) };
    assert.equal(isReplayOf(stale, payload), false);
  });

  it('keeps frontend submit locking and VietMap site confirmation', () => {
    const src = readFe('pages/customer/CreateRepairRequestPage.tsx');
    assert.match(src, /isSubmitting/);
    assert.match(src, /contractorId/);
    assert.match(src, /locationConfirmed/);
    assert.match(src, /LocationPicker/);
    assert.match(src, /form\.append\('images'/);
    assert.match(src, /form\.append\('videos'/);
    const history = readFe('pages/customer/RequestHistoryPage.tsx');
    assert.match(history, /repairApi\.cancel/);
    assert.match(history, /request\.cancelCta|t\('request\.cancelCta'\)/);
    assert.match(history, /ConfirmModal/);
    assert.match(history, /CANCELLED:/);
    const contractor = readFe('pages/contractor/ContractorRequestsPage.tsx');
    assert.match(contractor, /item\.status === 'PENDING'/);
    assert.doesNotMatch(contractor, /repairApi\.cancel/);
  });

  it('rejects unauthenticated repair and quotation calls when the API is up', async (t) => {
    const origin = process.env.BUILDMATE_API_ORIGIN || 'http://127.0.0.1:5000';
    try {
      const health = await fetch(`${origin}/api/health`);
      if (!health.ok) {
        t.skip('API is not reachable');
        return;
      }
    } catch {
      t.skip('API is not reachable');
      return;
    }

    const post = await fetch(`${origin}/api/repair-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Unauth leak', description: 'Should not persist' }),
    });
    const mine = await fetch(`${origin}/api/repair-requests/my`);
    const accept = await fetch(`${origin}/api/repair-requests/000000000000000000000000/accept`, { method: 'PATCH' });
    const cancel = await fetch(`${origin}/api/repair-requests/000000000000000000000000/cancel`, { method: 'PATCH' });
    const quote = await fetch(`${origin}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: '000000000000000000000000', items: [{ type: 'LABOR', name: 'Work', quantity: 1, price: 1 }] }),
    });
    assert.equal(post.status, 401);
    assert.equal(mine.status, 401);
    assert.equal(accept.status, 401);
    assert.equal(cancel.status, 401);
    assert.equal(quote.status, 401);
  });
});

describe('Flow 05 service transitions against isolated Postgres', () => {
  let dbReady = false;

  before(() => {
    dbReady = testDatabaseReady();
  });

  it('rejects quotation on PENDING and REJECTED, allows it after ACCEPTED', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }

    const { createParty, cleanupParty } = require('./helpers/party');
    const { REQUEST_STATUS: STATUS } = require('../models/RepairRequest');
    const { RepairRequest } = require('../repositories/conversationAccess');
    const quotationService = require('../services/quotationService');

    const party = await createParty();
    const items = [{ type: 'LABOR', name: 'Pipe repair', quantity: 1, unit: 'JOB', price: 150000 }];
    try {
      await RepairRequest.findByIdAndUpdate(party.request._id, { status: STATUS.PENDING });
      await assert.rejects(
        () => quotationService.createQuotation(party.contractor._id, { requestId: party.request._id, items }),
        (err) => err.statusCode === 409 && /Accept this request/.test(err.message)
      );

      await RepairRequest.findByIdAndUpdate(party.request._id, { status: STATUS.REJECTED });
      await assert.rejects(
        () => quotationService.createQuotation(party.contractor._id, { requestId: party.request._id, items }),
        (err) => err.statusCode === 409 && /rejected/.test(err.message)
      );

      await RepairRequest.findByIdAndUpdate(party.request._id, { status: STATUS.CANCELLED });
      await assert.rejects(
        () => quotationService.createQuotation(party.contractor._id, { requestId: party.request._id, items }),
        (err) => err.statusCode === 409 && /cancelled/.test(err.message)
      );

      await RepairRequest.findByIdAndUpdate(party.request._id, { status: STATUS.ACCEPTED });
      const quote = await quotationService.createQuotation(party.contractor._id, {
        requestId: party.request._id,
        items,
        transportCost: 0,
        estimatedDays: 1,
      });
      assert.equal(quote.status, 'SENT');
    } finally {
      await cleanupParty(party);
    }
  });

  it('lets only the assigned contractor claim PENDING, and blocks a second transition', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }

    const { createUser, cleanupParty, ROLES } = require('./helpers/party');
    const { RepairRequest } = require('../repositories/conversationAccess');
    const { REPAIR_CATEGORY, REQUEST_STATUS: STATUS } = require('../models/RepairRequest');
    const repairService = require('../services/repairService');

    const stamp = Date.now();
    const customer = await createUser({
      name: 'Flow05 Customer',
      email: `flow05.customer.${stamp}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CUSTOMER,
    });
    const contractor = await createUser({
      name: 'Flow05 Contractor',
      email: `flow05.contractor.${stamp}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CONTRACTOR,
    });
    const other = await createUser({
      name: 'Flow05 Other',
      email: `flow05.other.${stamp}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CONTRACTOR,
    });
    const party = { ids: [customer._id, contractor._id, other._id] };

    try {
      const request = await RepairRequest.create({
        customerId: customer._id,
        contractorId: contractor._id,
        category: REPAIR_CATEGORY.PLUMBING,
        title: `Flow05 claim ${stamp}`,
        description: 'Pending request used to prove accept/reject ACL.',
        status: STATUS.PENDING,
      });

      await assert.rejects(
        () => repairService.setStatus(request._id, other._id, STATUS.ACCEPTED),
        (err) => err.statusCode === 404
      );
      await assert.rejects(
        () => repairService.getById(request._id, { id: other._id }),
        (err) => err.statusCode === 403
      );

      const accepted = await repairService.setStatus(request._id, contractor._id, STATUS.ACCEPTED);
      assert.equal(accepted.status, STATUS.ACCEPTED);
      await assert.rejects(
        () => repairService.setStatus(request._id, contractor._id, STATUS.REJECTED),
        (err) => err.statusCode === 409
      );

      const raced = await RepairRequest.create({
        customerId: customer._id,
        contractorId: contractor._id,
        category: REPAIR_CATEGORY.ELECTRIC,
        title: `Flow05 race ${stamp}`,
        description: 'Concurrent accept and reject must not both succeed.',
        status: STATUS.PENDING,
      });
      const [first, second] = await Promise.allSettled([
        repairService.setStatus(raced._id, contractor._id, STATUS.ACCEPTED),
        repairService.setStatus(raced._id, contractor._id, STATUS.REJECTED),
      ]);
      const wins = [first, second].filter((row) => row.status === 'fulfilled');
      const losses = [first, second].filter((row) => row.status === 'rejected');
      assert.equal(wins.length, 1);
      assert.equal(losses.length, 1);
      const loaded = await RepairRequest.findById(raced._id);
      assert.ok(loaded.status === STATUS.ACCEPTED || loaded.status === STATUS.REJECTED);

    } finally {
      await cleanupParty(party);
    }
  });
});
