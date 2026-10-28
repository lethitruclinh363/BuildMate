const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ApiError } = require('../utils/ApiError');
const { materialReviewSchema, reviewReplySchema } = require('../validators/finance.validator');
const {
  assertMaterialStoreReview,
  createMaterialStoreReview,
  listStoreReviews,
  replyToReview,
} = require('../services/reviewService');
const { testDatabaseReady } = require('./helpers/pg-cleanup');

function order(overrides = {}) {
  return {
    _id: '64b0000000000000000000aa',
    customerId: 'customer-1',
    storeOwnerId: 'owner-1',
    status: 'COMPLETED',
    orderCode: 'VL-TEST',
    ...overrides,
  };
}

describe('material store review rules', () => {
  it('allows a review only after the customer has received the order', () => {
    assert.doesNotThrow(() => assertMaterialStoreReview(order({ status: 'COMPLETED' }), 'customer-1'));
    assert.doesNotThrow(() => assertMaterialStoreReview(order({ status: 'CUSTOMER_RECEIVED' }), 'customer-1'));
    assert.throws(
      () => assertMaterialStoreReview(order({ status: 'DELIVERED' }), 'customer-1'),
      (err) => err instanceof ApiError && err.statusCode === 409
    );
    assert.throws(
      () => assertMaterialStoreReview(order({ status: 'PENDING_PAYMENT' }), 'customer-1'),
      (err) => err instanceof ApiError && err.statusCode === 409
    );
  });

  it('rejects another customer and the store owner', () => {
    assert.throws(
      () => assertMaterialStoreReview(order(), 'customer-2'),
      (err) => err instanceof ApiError && err.statusCode === 403
    );
    assert.throws(
      () => assertMaterialStoreReview(order({ customerId: 'owner-1' }), 'owner-1'),
      (err) => err instanceof ApiError && err.statusCode === 403
    );
    assert.throws(
      () => assertMaterialStoreReview(null, 'customer-1'),
      (err) => err instanceof ApiError && err.statusCode === 404
    );
  });

  it('does not accept a star change on reply or a product id on a store review', () => {
    assert.equal(reviewReplySchema.safeParse({ reply: 'Cảm ơn anh chị', rating: 1 }).success, false);
    assert.equal(
      materialReviewSchema.safeParse({
        materialOrderId: '64b0000000000000000000aa',
        rating: 5,
        materialId: '64b0000000000000000000bb',
      }).success,
      false
    );
    const routes = fs.readFileSync(path.join(__dirname, '../routes/reviewRoutes.js'), 'utf8');
    assert.equal(routes.includes('router.delete'), false);
    assert.equal(routes.includes('router.patch'), false);
  });
});

describe('material store reviews in PostgreSQL', () => {
  const stamp = Date.now();
  let customer;
  let stranger;
  let owner;
  let created = [];

  before(async () => {
    if (!testDatabaseReady()) return;
    const { createUser, ROLES } = require('./helpers/party');
    const { prisma } = require('../config/prisma');
    customer = await createUser({
      name: 'Store Review Customer',
      email: `store.review.customer.${stamp}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CUSTOMER,
    });
    stranger = await createUser({
      name: 'Store Review Stranger',
      email: `store.review.stranger.${stamp}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CUSTOMER,
    });
    owner = await createUser({
      name: 'Store Review Owner',
      email: `store.review.owner.${stamp}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.MATERIAL_STORE_OWNER,
    });
    const ownerRow = await prisma.users.findFirst({ where: { legacy_mongo_id: String(owner._id) }, select: { id: true } });
    const legacy = (suffix) => `${stamp.toString(16)}${suffix}`.padStart(24, 'a').slice(0, 24);
    const location = await prisma.locations.create({
      data: { formatted_address: 'Can Tho test', latitude: 10.03, longitude: 105.77, is_confirmed: true },
    });
    const store = await prisma.stores.create({
      data: {
        legacy_mongo_id: legacy('s'),
        owner_user_id: ownerRow.id,
        location_id: location.id,
        name: `VL test ${stamp}`,
        store_type: 'MATERIALS',
      },
    });
    const category = await prisma.material_categories.create({
      data: {
        legacy_mongo_id: legacy('c'),
        name: `Cat ${stamp}`,
        normalized_name: `cat-${stamp}`,
        folded_name: `cat-${stamp}`,
        owner_user_id: ownerRow.id,
        store_id: store.id,
      },
    });
    const material = await prisma.materials.create({
      data: {
        legacy_mongo_id: legacy('m'),
        store_id: store.id,
        material_category_id: category.id,
        name: `Xi mang ${stamp}`,
        price: 100000,
      },
    });
    created = { location, store, category, material, legacy };
  });

  after(async () => {
    if (!testDatabaseReady()) return;
    const { prisma } = require('../config/prisma');
    const { deleteFixtureUsers } = require('./helpers/party');
    const ids = [customer, stranger, owner].filter(Boolean).map((user) => user._id);
    const users = await prisma.users.findMany({
      where: { legacy_mongo_id: { in: ids.map(String) } },
      select: { id: true },
    });
    const userIds = users.map((row) => row.id);
    if (userIds.length) {
      const orders = await prisma.material_orders.findMany({
        where: { OR: [{ customer_user_id: { in: userIds } }, { store_owner_user_id: { in: userIds } }] },
        select: { id: true, delivery_location_id: true },
      });
      const orderIds = orders.map((row) => row.id);
      await prisma.reviews.deleteMany({
        where: { OR: [{ customer_user_id: { in: userIds } }, { target_user_id: { in: userIds } }] },
      });
      if (orderIds.length) {
        await prisma.material_order_items.deleteMany({ where: { material_order_id: { in: orderIds } } });
        await prisma.material_order_status_history.deleteMany({ where: { material_order_id: { in: orderIds } } });
        await prisma.material_order_payments.deleteMany({ where: { material_order_id: { in: orderIds } } }).catch(() => {});
        await prisma.material_commissions.deleteMany({ where: { material_order_id: { in: orderIds } } }).catch(() => {});
        await prisma.material_orders.deleteMany({ where: { id: { in: orderIds } } });
      }
      if (created.store) {
        await prisma.materials.deleteMany({ where: { store_id: created.store.id } });
        await prisma.material_categories.deleteMany({ where: { store_id: created.store.id } });
        await prisma.stores.deleteMany({ where: { id: created.store.id } });
      }
      const locationIds = [created.location?.id, ...orders.map((row) => row.delivery_location_id)].filter(Boolean);
      if (locationIds.length) await prisma.locations.deleteMany({ where: { id: { in: locationIds } } }).catch(() => {});
      await prisma.audit_logs.deleteMany({ where: { actor_user_id: { in: userIds } } });
    }
    await deleteFixtureUsers(ids);
  });

  async function makeOrder(status, suffix) {
    const { MaterialOrder } = require('../repositories/materialOrderAccess');
    return MaterialOrder.create({
      orderCode: `VL-T${String(stamp).slice(-8)}-${suffix}`,
      customerId: customer._id,
      storeId: created.store.legacy_mongo_id,
      storeOwnerId: owner._id,
      deliveryAddress: 'Can Tho test',
      deliveryLocation: { type: 'Point', coordinates: [105.77, 10.03] },
      locationConfirmed: true,
      distanceKm: 2,
      materialSubtotal: 100000,
      shippingFee: 20000,
      totalAmount: 120000,
      depositRateSnapshot: 15,
      depositAmount: 18000,
      platformFeeRateSnapshot: 5,
      platformFeeAmount: 5000,
      storeDepositAmount: 13000,
      remainingAmount: 102000,
      paymentStatus: 'PAID',
      status,
      items: [{
        materialId: created.material.legacy_mongo_id,
        nameSnapshot: 'Xi mang',
        unitSnapshot: 'bao',
        priceSnapshot: 100000,
        quantity: 1,
        lineTotal: 100000,
      }],
      statusHistory: [],
    });
  }

  it('stores one store review per received material order and keeps it after reload', async (t) => {
    if (!testDatabaseReady()) {
      t.skip('PostgreSQL test database is not available');
      return;
    }
    const empty = await listStoreReviews(owner._id, { sort: 'newest' });
    assert.equal(empty.count, 0);
    assert.equal(empty.average, 0);
    assert.deepEqual(empty.distribution, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    assert.equal(empty.items.length, 0);

    const waiting = await makeOrder('DELIVERED', 'W');
    await assert.rejects(
      () => createMaterialStoreReview(customer._id, { materialOrderId: waiting._id, rating: 5, comment: 'Som' }),
      (err) => err instanceof ApiError && err.statusCode === 409
    );
    await assert.rejects(
      () => createMaterialStoreReview(stranger._id, { materialOrderId: waiting._id, rating: 5, comment: 'Khong phai don toi' }),
      (err) => err instanceof ApiError && err.statusCode === 403
    );

    const first = await makeOrder('COMPLETED', 'A');
    const second = await makeOrder('COMPLETED', 'B');
    const third = await makeOrder('CUSTOMER_RECEIVED', 'C');
    const createdReviews = [];
    for (const [row, rating] of [[first, 5], [second, 4], [third, 1]]) {
      createdReviews.push(await createMaterialStoreReview(customer._id, {
        materialOrderId: row._id,
        rating,
        comment: `Nhan xet ${rating}`,
      }));
    }

    await assert.rejects(
      () => createMaterialStoreReview(customer._id, { materialOrderId: first._id, rating: 1, comment: 'Lan hai' }),
      (err) => err instanceof ApiError && err.statusCode === 409
    );

    const listed = await listStoreReviews(owner._id, { sort: 'newest', page: 1, pageSize: 10 });
    assert.equal(listed.count, 3);
    assert.equal(listed.average, 3.3);
    assert.equal(listed.distribution[5], 1);
    assert.equal(listed.distribution[4], 1);
    assert.equal(listed.distribution[1], 1);
    assert.equal(listed.items.every((item) => item.materialOrderId && item.orderCode.startsWith('VL-')), true);
    assert.equal(listed.items.some((item) => item.customerName === 'Store Review Customer'), true);

    const onlyFive = await listStoreReviews(owner._id, { rating: 5, sort: 'oldest' });
    assert.equal(onlyFive.total, 1);
    assert.equal(onlyFive.items[0].rating, 5);
    assert.equal(onlyFive.count, 3);

    const oldest = await listStoreReviews(owner._id, { sort: 'oldest' });
    const newest = await listStoreReviews(owner._id, { sort: 'newest' });
    assert.equal(oldest.items[0].rating, 5);
    assert.equal(newest.items[0].rating, 1);

    const reply = await replyToReview(owner._id, createdReviews[0].id, 'Cửa hàng đã nhận phản hồi');
    assert.equal(reply.rating, 5);
    assert.equal(reply.contractorReply, 'Cửa hàng đã nhận phản hồi');

    const again = await listStoreReviews(owner._id, { rating: 5, sort: 'newest' });
    assert.equal(again.items[0].contractorReply, 'Cửa hàng đã nhận phản hồi');
    assert.equal(again.items[0].orderCode, first.orderCode);
  });
});
