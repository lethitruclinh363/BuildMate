const { LEDGER_TYPE } = require('../utils/contractor-finance');

let tableCache = { at: 0, ready: false };

function db(tx) {
  if (tx && typeof tx.$executeRawUnsafe === 'function' && typeof tx.payments === 'undefined') {
    return tx;
  }
  const { db: scoped } = require('./pgContext');
  return scoped();
}

function asJson(value) {
  return JSON.stringify(value || {});
}

async function tablesReady(tx) {
  if (tableCache.ready && Date.now() - tableCache.at < 30_000) return true;
  try {
    const rows = await db(tx).$queryRaw`
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'service_order_escrows'
      LIMIT 1
    `;
    tableCache = { at: Date.now(), ready: Array.isArray(rows) && rows.length > 0 };
    return tableCache.ready;
  } catch (error) {
    if (error.code === '42P01') {
      tableCache = { at: Date.now(), ready: false };
      return false;
    }
    tableCache = { at: Date.now(), ready: false };
    return false;
  }
}

function invalidateTableCache() {
  tableCache = { at: 0, ready: false };
}

async function lockByPayment(payment, tx) {
  if (!payment.pgId) return;
  await db(tx).$queryRawUnsafe(
    `SELECT id FROM payments WHERE id = $1::bigint AND payment_type = 'DEPOSIT' FOR UPDATE`,
    String(payment.pgId)
  );
}

async function compareAndSetMetadata(payment, fromStatus, finance, escrow, tx, paymentPatch) {
  const meta = { ...(payment.metadata || {}), finance, escrow, mock: true };
  if (paymentPatch && paymentPatch.status) payment.status = paymentPatch.status;
  if (paymentPatch && paymentPatch.refundedAt) payment.refundedAt = paymentPatch.refundedAt;
  if (!payment.pgId) {
    payment.metadata = meta;
    await payment.save(tx);
    return true;
  }
  const payload = asJson(meta);
  const updated = await db(tx).$executeRawUnsafe(
    `UPDATE payments
     SET metadata = $1::jsonb,
         status = COALESCE($4, status),
         refunded_at = COALESCE($5::timestamptz, refunded_at),
         updated_at = NOW()
     WHERE id = $2::bigint
       AND payment_type = 'DEPOSIT'
       AND COALESCE(metadata #>> '{escrow,status}', 'NOT_FUNDED') = $3`,
    payload,
    String(payment.pgId),
    fromStatus,
    paymentPatch && paymentPatch.status ? paymentPatch.status : null,
    paymentPatch && paymentPatch.refundedAt
      ? new Date(paymentPatch.refundedAt).toISOString()
      : null
  );
  if (updated !== 1) return false;
  payment.metadata = JSON.parse(payload);
  return true;
}

async function insertEscrowRow(payment, finance, escrow, tx) {
  if (!payment.pgId) return;
  const ready = await tablesReady(tx);
  if (!ready) return;
  const order = await db(tx).service_orders.findFirst({
    where: { legacy_mongo_id: String(payment.orderId) },
    select: { id: true, contractor_user_id: true },
  });
  if (!order) return;
  try {
    await db(tx).$executeRawUnsafe(
      `INSERT INTO service_order_escrows (
         service_order_id, payment_id, contractor_user_id,
         gross_amount, platform_fee_amount, contractor_hold_amount,
         released_amount, refunded_amount, status, payout_status,
         remaining_settled, cancel_case, mock
       ) VALUES (
         $1::bigint, $2::bigint, $3::bigint,
         $4::numeric, $5::numeric, $6::numeric,
         0, 0, $7, $8,
         false, $9, true
       )
       ON CONFLICT (payment_id) DO NOTHING`,
      String(order.id),
      String(payment.pgId),
      String(order.contractor_user_id),
      String(finance.depositAmount),
      String(finance.platformFee),
      String(finance.contractorHold),
      escrow.status,
      escrow.payoutStatus || 'NONE',
      escrow.cancelCase || null
    );
  } catch (error) {
    if (error.code === '42P01') invalidateTableCache();
  }
}

async function updateEscrowRow(payment, fromStatus, escrow, tx) {
  if (!payment.pgId) return true;
  if (!(await tablesReady(tx))) return true;
  try {
    const updated = await db(tx).$executeRawUnsafe(
      `UPDATE service_order_escrows
       SET status = $1,
           payout_status = $2,
           released_amount = $3::numeric,
           refunded_amount = $4::numeric,
           remaining_settled = $5,
           remaining_settled_at = $6::timestamptz,
           remaining_settled_by = NULL,
           held_at = COALESCE(held_at, $7::timestamptz),
           frozen_at = CASE WHEN $1 = 'FROZEN' THEN COALESCE(frozen_at, NOW()) ELSE frozen_at END,
           released_at = CASE WHEN $1 = 'RELEASED' THEN COALESCE(released_at, NOW()) ELSE released_at END,
           refunded_at = CASE WHEN $1 = 'REFUNDED' THEN COALESCE(refunded_at, NOW()) ELSE refunded_at END,
           cancel_case = $8,
           updated_at = NOW()
       WHERE payment_id = $9::bigint
         AND status = $10`,
      escrow.status,
      escrow.payoutStatus || 'NONE',
      String(escrow.releasedAmount || 0),
      String(escrow.refundedAmount || 0),
      Boolean(escrow.remainingSettled),
      escrow.remainingSettledAt || null,
      escrow.heldAt || null,
      escrow.cancelCase || null,
      String(payment.pgId),
      fromStatus
    );
    return updated === 1;
  } catch (error) {
    if (error.code === '42P01') {
      invalidateTableCache();
      return true;
    }
    throw error;
  }
}

async function insertLedger(payment, escrow, { type, amount, actorId, key, note }, tx) {
  if (!payment.pgId || !(await tablesReady(tx))) return;
  try {
    await db(tx).$executeRawUnsafe(
      `INSERT INTO escrow_ledger (escrow_id, entry_type, amount, actor_user_id, idempotency_key, note)
       SELECT id, $1, $2::numeric, NULL, $3, $4
       FROM service_order_escrows
       WHERE payment_id = $5::bigint
       ON CONFLICT (idempotency_key) DO NOTHING`,
      type || LEDGER_TYPE.HOLD,
      String(amount || 0),
      key,
      note || '',
      String(payment.pgId)
    );
  } catch (error) {
    if (error.code === '42P01') invalidateTableCache();
  }
}

async function insertPayout(payment, escrow, referenceCode, tx) {
  if (!payment.pgId || !(await tablesReady(tx))) return { created: false };
  try {
    const inserted = await db(tx).$executeRawUnsafe(
      `INSERT INTO contractor_payouts (escrow_id, contractor_user_id, amount, status, reference_code, mock, processed_at)
       SELECT id, contractor_user_id, $1::numeric, 'PAID', $2, true, NOW()
       FROM service_order_escrows
       WHERE payment_id = $3::bigint
       ON CONFLICT (escrow_id) DO NOTHING`,
      String(escrow.payoutAmount || escrow.contractorHoldAmount || 0),
      referenceCode,
      String(payment.pgId)
    );
    return { created: inserted === 1, mock: true };
  } catch (error) {
    if (error.code === '42P01') {
      invalidateTableCache();
      return { created: false };
    }
    throw error;
  }
}

async function insertRefund(payment, escrow, { amount, reason, cancelCase, key }, tx) {
  if (!payment.pgId || !(await tablesReady(tx))) return;
  try {
    await db(tx).$executeRawUnsafe(
      `INSERT INTO escrow_refunds (escrow_id, amount, status, reason, cancel_case, idempotency_key, mock, processed_at)
       SELECT id, $1::numeric, 'PAID', $2, $3, $4, true, NOW()
       FROM service_order_escrows
       WHERE payment_id = $5::bigint
       ON CONFLICT (idempotency_key) DO NOTHING`,
      String(amount || 0),
      reason || '',
      cancelCase || null,
      key,
      String(payment.pgId)
    );
    await insertCancellation(payment, cancelCase || 'CONTRACTOR_CANCEL', reason || '', tx);
  } catch (error) {
    if (error.code === '42P01') invalidateTableCache();
  }
}

async function insertCancellation(payment, cancelCase, reason, tx) {
  if (!payment.pgId || !(await tablesReady(tx))) return;
  try {
    await db(tx).$executeRawUnsafe(
      `INSERT INTO escrow_cancellations (escrow_id, cancel_case, reason, mock)
       SELECT id, $1, $2, true
       FROM service_order_escrows
       WHERE payment_id = $3::bigint
       ON CONFLICT (escrow_id) DO NOTHING`,
      cancelCase || 'CUSTOMER_AFTER_DEPOSIT',
      reason || '',
      String(payment.pgId)
    );
  } catch (error) {
    if (error.code === '42P01') invalidateTableCache();
  }
}

async function persistTransition(payment, fromStatus, finance, escrow, extra) {
  const { runInTransaction } = require('./pgContext');
  return runInTransaction(async (tx) => {
    await lockByPayment(payment, tx);
    const ready = await tablesReady(tx);
    if (ready) {
      await insertEscrowRow(payment, finance, { ...escrow, status: fromStatus }, tx);
      const okRow = await updateEscrowRow(payment, fromStatus, escrow, tx);
      if (!okRow) return { ok: false, code: 'ESCROW_ROW_CAS_FAILED' };
    }
    const okMeta = await compareAndSetMetadata(
      payment,
      fromStatus,
      finance,
      escrow,
      tx,
      extra && extra.paymentPatch
    );
    if (!okMeta) return { ok: false, code: 'ESCROW_CAS_FAILED' };
    if (extra && extra.ledger) {
      await insertLedger(payment, escrow, extra.ledger, tx);
    }
    return { ok: true };
  });
}

module.exports = {
  tablesReady,
  invalidateTableCache,
  insertEscrowRow,
  persistTransition,
  lockByPayment,
  insertPayout,
  insertRefund,
  insertCancellation,
  insertLedger,
};
