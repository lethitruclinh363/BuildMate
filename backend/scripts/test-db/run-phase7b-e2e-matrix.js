const { Client } = require('pg');
const { loadTestEnv, requireIsolatedTestDatabase } = require('../../src/tests/helpers/database-safety');

loadTestEnv();

const BASE_API = 'http://127.0.0.1:5055/api';

async function request(path, options = {}) {
  const url = `${BASE_API}${path}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_e) {}
  return { status: res.status, ok: res.ok, json, text };
}

async function login(email, password) {
  const path = email.includes('admin') ? '/admin/auth/login' : '/auth/login';
  const res = await request(path, {
    method: 'POST',
    body: { email, password },
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.text}`);
  return res.json.data.token;
}

async function run() {
  const pgUrl = requireIsolatedTestDatabase();
  const pg = new Client({ connectionString: pgUrl });
  await pg.connect();

  const results = {};

  try {
    console.log('=== LOGGING IN ACTORS ===');
    const customerToken = await login('demo.customer@buildmate.test', 'Demo@1234');
    const storeToken = await login('demo.store@buildmate.test', 'Demo@1234');
    const adminToken = await login('demo.admin@buildmate.test', 'Admin@1234');
    console.log('✓ Actors logged in successfully');

    // TC-M01: Store catalog & details
    console.log('\n=== TC-M01: STORE CATALOG ===');
    const storeRes = await request('/stores/82a98eb32f87abb362a131ba', { token: customerToken });
    const storeData = storeRes.json?.data?.store || {};
    const materialsData = storeRes.json?.data?.materials || [];
    const cement = materialsData.find(m => m.name === 'Demo Portland Cement');
    results['TC-M01'] = {
      storeName: storeData.name,
      deliveryEnabled: storeData.deliveryEnabled,
      baseDeliveryFee: storeData.baseDeliveryFee,
      materialsCount: materialsData.length,
      cementPrice: cement?.price,
      cementStock: cement?.stock,
      passed: storeRes.ok && Boolean(cement) && cement.price === 2000000,
    };
    console.log('TC-M01 Result:', results['TC-M01']);

    // TC-M02: Cart quote verification
    console.log('\n=== TC-M02: CART QUOTE ===');
    const quoteRes = await request('/material-checkout/quote', {
      method: 'POST',
      token: customerToken,
      body: {
        storeId: '82a98eb32f87abb362a131ba',
        address: '88 Hoa Binh, Ninh Kieu, Can Tho',
        lat: 10.035,
        lng: 105.78,
        items: [{ materialId: cement.id, quantity: 1 }],
      },
    });
    const quote = quoteRes.json?.data;
    results['TC-M02'] = {
      ok: quote?.ok,
      materialSubtotal: quote?.materialSubtotal,
      shippingFee: quote?.shippingFee,
      orderTotal: quote?.orderTotal,
      passed: quote?.ok === true && quote?.materialSubtotal === 2000000 && quote?.shippingFee === 100000 && quote?.orderTotal === 2100000,
    };
    console.log('TC-M02 Result:', results['TC-M02']);

    // Check Order 13
    const order13Res = await request('/material-orders/14a04201795edf75761e18a7', { token: customerToken });
    const order13 = order13Res.json?.data;
    console.log('Current Order 13 Status:', order13?.status);

    // TC-M03 & TC-M04: Order 13 in DB
    const dbOrder = await pg.query('SELECT * FROM material_orders WHERE legacy_mongo_id = $1', ['14a04201795edf75761e18a7']);
    const row = dbOrder.rows[0];
    results['TC-M03_M04'] = {
      orderCode: row.order_code,
      materialSubtotal: Number(row.material_subtotal),
      shippingFee: Number(row.shipping_fee),
      totalAmount: Number(row.total_amount),
      depositAmount: Number(row.deposit_amount),
      platformFeeAmount: Number(row.platform_fee_amount),
      status: row.status,
      paymentStatus: row.payment_status,
      remainingSettledOffline: row.remaining_settled_offline,
      passed: Number(row.total_amount) === 2100000 && Number(row.deposit_amount) === 0 && Number(row.platform_fee_amount) === 0,
    };
    console.log('TC-M03/M04 DB Result:', results['TC-M03_M04']);

    // TC-M05 & TC-M06: Store sees order and advances status
    console.log('\n=== TC-M05 & TC-M06: STORE FULFILLMENT ===');
    const storeOrders = await request('/material-store/orders', { token: storeToken });
    const storeHasOrder = (storeOrders.json?.data || []).some(o => o.orderCode === row.order_code);
    results['TC-M05'] = {
      storeSeesOrder: storeHasOrder,
      passed: storeHasOrder,
    };
    console.log('TC-M05 Result:', results['TC-M05']);

    // Advance: CONFIRMED -> PREPARING
    let curStatus = row.status;
    if (curStatus === 'CONFIRMED') {
      const adv1 = await request(`/material-store/orders/${row.legacy_mongo_id}`, {
        method: 'PATCH',
        token: storeToken,
        body: { status: 'PREPARING' },
      });
      curStatus = adv1.json?.data?.status;
      console.log('Store advanced to PREPARING:', curStatus);
    }
    // Advance: PREPARING -> READY_FOR_DELIVERY
    if (curStatus === 'PREPARING') {
      const adv2 = await request(`/material-store/orders/${row.legacy_mongo_id}`, {
        method: 'PATCH',
        token: storeToken,
        body: { status: 'READY_FOR_DELIVERY' },
      });
      curStatus = adv2.json?.data?.status;
      console.log('Store advanced to READY_FOR_DELIVERY:', curStatus);
    }
    results['TC-M06'] = {
      advancedToReady: curStatus === 'READY_FOR_DELIVERY',
      passed: curStatus === 'READY_FOR_DELIVERY',
    };

    // TC-M07: Delivery, Receiving, and COD collection
    console.log('\n=== TC-M07: DELIVERY & COD COLLECTION ===');
    // Store: READY_FOR_DELIVERY -> DELIVERING
    const adv3 = await request(`/material-store/orders/${row.legacy_mongo_id}`, {
      method: 'PATCH',
      token: storeToken,
      body: { status: 'DELIVERING' },
    });
    console.log('Store advanced to DELIVERING:', adv3.json?.data?.status);

    // Store: DELIVERING -> DELIVERED
    const adv4 = await request(`/material-store/orders/${row.legacy_mongo_id}`, {
      method: 'PATCH',
      token: storeToken,
      body: { status: 'DELIVERED' },
    });
    console.log('Store advanced to DELIVERED:', adv4.json?.data?.status);

    // Customer confirms received
    const custRecv = await request(`/material-orders/${row.legacy_mongo_id}/receive`, {
      method: 'POST',
      token: customerToken,
    });
    console.log('Customer received, order status:', custRecv.json?.data?.status);

    // Store confirms COD collected
    const collectRes = await request(`/material-store/orders/${row.legacy_mongo_id}/collected`, {
      method: 'POST',
      token: storeToken,
    });
    const collectedOrder = collectRes.json?.data;
    console.log('Store collected paymentStatus:', collectedOrder?.paymentStatus, 'remainingSettledOffline:', collectedOrder?.remainingSettledOffline);

    results['TC-M07'] = {
      finalStatus: collectedOrder?.status,
      paymentStatus: collectedOrder?.paymentStatus,
      remainingSettledOffline: collectedOrder?.remainingSettledOffline,
      passed: collectedOrder?.status === 'COMPLETED' && collectedOrder?.paymentStatus === 'PAID' && collectedOrder?.remainingSettledOffline === true,
    };
    console.log('TC-M07 Result:', results['TC-M07']);

    // TC-M08: Store Earnings Report
    console.log('\n=== TC-M08: STORE EARNINGS REPORT ===');
    const earningsRes = await request('/material-store/earnings', { token: storeToken });
    const earnings = earningsRes.json?.data;
    results['TC-M08'] = {
      orderCount: earnings?.orderCount,
      completedCount: earnings?.completedCount,
      orderValue: earnings?.orderValue,
      collectedAmount: earnings?.collectedAmount,
      uncollectedAmount: earnings?.uncollectedAmount,
      platformFees: earnings?.platformFees,
      passed: earnings?.completedCount >= 1 && earnings?.collectedAmount >= 2100000 && earnings?.platformFees === 0,
    };
    console.log('TC-M08 Result:', results['TC-M08']);

    // TC-M09: Admin Order Management
    console.log('\n=== TC-M09: ADMIN ORDER VIEW ===');
    const adminOrderRes = await request(`/orders/${row.legacy_mongo_id}`, { token: adminToken });
    const adminOrder = adminOrderRes.json?.data;
    results['TC-M09'] = {
      orderCode: adminOrder?.orderCode,
      customerName: adminOrder?.customerName,
      storeName: adminOrder?.storeName,
      amount: adminOrder?.amount,
      status: adminOrder?.status,
      paymentStatus: adminOrder?.paymentStatus,
      isMaterialOrder: adminOrder?.isMaterialOrder,
      statusHistoryCount: adminOrder?.statusHistory?.length,
      passed: adminOrder?.orderCode === row.order_code && adminOrder?.amount === 2100000 && adminOrder?.status === 'COMPLETED' && adminOrder?.paymentStatus === 'PAID' && adminOrder?.isMaterialOrder === true,
    };
    console.log('TC-M09 Result:', results['TC-M09']);

    // TC-M10: Admin Analytics
    console.log('\n=== TC-M10: ADMIN FINANCIAL ANALYTICS ===');
    const analyticsRes = await request('/admin/analytics', { token: adminToken });
    const finance = analyticsRes.json?.data?.finance;
    results['TC-M10'] = {
      materialGmv: finance?.materialGmv,
      materialPlatformRevenue: finance?.materialPlatformRevenue,
      commission: finance?.commission,
      ledgerMaterialGmv: finance?.ledger?.materialGmv,
      ledgerPlatformFeePosted: finance?.ledger?.platformFeePosted,
      passed: finance?.materialGmv >= 2100000 && finance?.materialPlatformRevenue === 0 && finance?.commission === 500000,
    };
    console.log('TC-M10 Result:', results['TC-M10']);

    // TC-M11: Customer cancel before delivery (on a new draft order)
    console.log('\n=== TC-M11: CANCEL BEFORE DELIVERY ===');
    const draftRes = await request('/material-orders', {
      method: 'POST',
      token: customerToken,
      body: {
        storeId: '82a98eb32f87abb362a131ba',
        deliveryAddress: '88 Hoa Binh, Ninh Kieu, Can Tho',
        lat: 10.035,
        lng: 105.78,
        locationConfirmed: true,
        items: [{ materialId: cement.id, quantity: 1 }],
      },
    });
    const draftOrder = draftRes.json?.data;
    const cancelRes = await request(`/material-orders/${draftOrder.id}/cancel`, {
      method: 'POST',
      token: customerToken,
    });
    results['TC-M11'] = {
      cancelledStatus: cancelRes.json?.data?.status,
      passed: cancelRes.json?.data?.status === 'CANCELLED',
    };
    console.log('TC-M11 Result:', results['TC-M11']);

    // TC-M16: Store confirms collection twice (idempotent)
    console.log('\n=== TC-M16: STORE DOUBLE COLLECTION IDEMPOTENT ===');
    const doubleCollect = await request(`/material-store/orders/${row.legacy_mongo_id}/collected`, {
      method: 'POST',
      token: storeToken,
    });
    results['TC-M16'] = {
      status: doubleCollect.status,
      paymentStatus: doubleCollect.json?.data?.paymentStatus,
      passed: doubleCollect.ok && doubleCollect.json?.data?.paymentStatus === 'PAID',
    };
    console.log('TC-M16 Result:', results['TC-M16']);

    // TC-M17: Customer tries to order exceeding stock (> 20 bags)
    console.log('\n=== TC-M17: EXCEEDING STOCK ===');
    const exceedRes = await request('/material-orders', {
      method: 'POST',
      token: customerToken,
      body: {
        storeId: '82a98eb32f87abb362a131ba',
        deliveryAddress: '88 Hoa Binh, Ninh Kieu, Can Tho',
        lat: 10.035,
        lng: 105.78,
        locationConfirmed: true,
        items: [{ materialId: cement.id, quantity: 999 }],
      },
    });
    results['TC-M17'] = {
      status: exceedRes.status,
      error: exceedRes.json?.message,
      passed: exceedRes.status === 409 || exceedRes.status === 422,
    };
    console.log('TC-M17 Result:', results['TC-M17']);

    // TC-M19: Other store tries to view/process order (RBAC)
    console.log('\n=== TC-M19: RBAC STORE ISOLATION ===');
    const contractorToken = await login('demo.contractor@buildmate.test', 'Demo@1234');
    const strangerStoreRes = await request(`/material-store/orders/${row.legacy_mongo_id}`, { token: contractorToken });
    results['TC-M19'] = {
      status: strangerStoreRes.status,
      passed: strangerStoreRes.status === 403 || strangerStoreRes.status === 404,
    };
    console.log('TC-M19 Result:', results['TC-M19']);

    console.log('\n=== ALL RESULTS SUMMARY ===');
    console.log(JSON.stringify(results, null, 2));

  } finally {
    await pg.end();
  }
}

run().catch(console.error);
