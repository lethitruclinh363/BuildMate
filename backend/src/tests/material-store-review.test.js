const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { reviewReplySchema } = require('../validators/finance.validator');
const { listStoreReviews, replyToReview } = require('../services/reviewService');
const { testDatabaseReady } = require('./helpers/pg-cleanup');

describe('material store review rules', () => {
  it('stops creating new reviews from discontinued material orders', () => {
    const service = fs.readFileSync(path.join(__dirname, '../services/reviewService.js'), 'utf8');
    const routes = fs.readFileSync(path.join(__dirname, '../routes/reviewRoutes.js'), 'utf8');
    assert.doesNotMatch(service, /createMaterialStoreReview|assertMaterialStoreReview/);
    assert.doesNotMatch(routes, /material-orders/);
    assert.match(service, /listStoreReviews/);
  });

  it('does not accept a star change on reply', () => {
    assert.equal(reviewReplySchema.safeParse({ reply: 'Cảm ơn anh chị', rating: 1 }).success, false);
    const routes = fs.readFileSync(path.join(__dirname, '../routes/reviewRoutes.js'), 'utf8');
    assert.equal(routes.includes('router.delete'), false);
    assert.equal(routes.includes('router.patch'), false);
  });
});

describe('material store reviews in PostgreSQL', () => {
  const stamp = Date.now();
  let customer;
  let owner;

  before(async () => {
    if (!testDatabaseReady()) return;
    const { createUser, ROLES } = require('./helpers/party');
    customer = await createUser({
      name: 'Store Review Customer',
      email: `store.review.customer.${stamp}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CUSTOMER,
    });
    owner = await createUser({
      name: 'Store Review Owner',
      email: `store.review.owner.${stamp}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.MATERIAL_STORE_OWNER,
    });
  });

  after(async () => {
    if (!testDatabaseReady()) return;
    const { prisma } = require('../config/prisma');
    const { deleteFixtureUsers } = require('./helpers/party');
    const ids = [customer, owner].filter(Boolean).map((user) => user._id);
    const users = await prisma.users.findMany({
      where: { legacy_mongo_id: { in: ids.map(String) } },
      select: { id: true },
    });
    const userIds = users.map((row) => row.id);
    if (userIds.length) {
      await prisma.reviews.deleteMany({
        where: { OR: [{ customer_user_id: { in: userIds } }, { target_user_id: { in: userIds } }] },
      });
      await prisma.audit_logs.deleteMany({ where: { actor_user_id: { in: userIds } } });
    }
    await deleteFixtureUsers(ids);
  });

  it('lists and replies to independent store reviews without creating material orders', async (t) => {
    if (!testDatabaseReady()) {
      t.skip('PostgreSQL test database is not available');
      return;
    }
    const { Review } = require('../repositories/commerceAccess');
    const empty = await listStoreReviews(owner._id, { sort: 'newest' });
    assert.equal(empty.count, 0);

    const createdReviews = [];
    for (const rating of [5, 4, 1]) {
      createdReviews.push(await Review.create({
        customerId: customer._id,
        targetUserId: owner._id,
        targetType: 'MATERIAL_STORE',
        rating,
        comment: `Nhan xet ${rating}`,
      }));
    }

    const listed = await listStoreReviews(owner._id, { sort: 'newest', page: 1, pageSize: 10 });
    assert.equal(listed.count, 3);
    assert.equal(listed.average, 3.3);
    assert.equal(listed.distribution[5], 1);
    assert.equal(listed.items.some((item) => item.customerName === 'Store Review Customer'), true);

    const reply = await replyToReview(owner._id, createdReviews[0].id || createdReviews[0]._id, 'Cửa hàng đã nhận phản hồi');
    assert.equal(reply.rating, 5);
    assert.equal(reply.contractorReply, 'Cửa hàng đã nhận phản hồi');
  });
});
