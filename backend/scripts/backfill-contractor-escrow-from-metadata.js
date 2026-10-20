#!/usr/bin/env node
/**
 * Idempotent metadata → escrow table backfill.
 * Runs ONLY against TEST_DATABASE_URL (never BuilMate).
 *
 * Copies contractor DEPOSIT escrow snapshots from payments.metadata into
 * service_order_escrows / contractor_payouts / escrow_ledger / escrow_refunds.
 * Skips material-store payments and rows that already exist.
 */
const path = require('path');
const { Client } = require('pg');

const { loadTestEnv, requireIsolatedTestDatabase, databaseName } = require('../src/tests/helpers/database-safety');

loadTestEnv();

const CONTRACTOR_POLICY = 'CONTRACTOR_V2_ESCROW';

function isContractorDeposit(row) {
  if (row.payment_type !== 'DEPOSIT') return false;
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const finance = meta.finance || {};
  if (finance.policyVersion && finance.policyVersion !== CONTRACTOR_POLICY) return false;
  if (!finance.depositAmount && !meta.escrow) return false;
  return true;
}

async function main() {
  const url = requireIsolatedTestDatabase();
  const name = databaseName(url);
  if (String(name).toLowerCase() === 'builmate') {
    throw new Error('Refusing to backfill BuilMate');
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const tables = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'service_order_escrows'
    `);
    if (!tables.rowCount) {
      throw new Error('service_order_escrows is missing. Apply scripts/sql/2026-contractor-escrow-material-free.sql on the test database first.');
    }

    const payments = await client.query(`
      SELECT p.id, p.service_order_id, p.contractor_user_id, p.payment_type, p.status, p.metadata
      FROM payments p
      WHERE p.payment_type = 'DEPOSIT'
    `);

    let inserted = 0;
    let skipped = 0;
    let ignored = 0;

    await client.query('BEGIN');
    for (const row of payments.rows) {
      if (!isContractorDeposit(row)) {
        ignored += 1;
        continue;
      }
      const meta = row.metadata || {};
      const finance = meta.finance || {};
      const escrow = meta.escrow || {};
      const gross = Number(finance.depositAmount || escrow.grossAmount || 0);
      const fee = Number(finance.platformFee || escrow.platformFeeAmount || 0);
      const hold = Number(finance.contractorHold || escrow.contractorHoldAmount || 0);
      if (gross <= 0 || fee + hold !== gross) {
        ignored += 1;
        continue;
      }

      const result = await client.query(
        `INSERT INTO service_order_escrows (
           service_order_id, payment_id, contractor_user_id,
           gross_amount, platform_fee_amount, contractor_hold_amount,
           released_amount, refunded_amount, status, payout_status,
           remaining_settled, cancel_case, mock
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)
         ON CONFLICT (payment_id) DO NOTHING
         RETURNING id`,
        [
          row.service_order_id,
          row.id,
          row.contractor_user_id,
          gross,
          fee,
          hold,
          Number(escrow.releasedAmount || 0),
          Number(escrow.refundedAmount || 0),
          escrow.status || (row.status === 'PAID' ? 'HELD' : 'NOT_FUNDED'),
          escrow.payoutStatus || 'NONE',
          Boolean(escrow.remainingSettled),
          escrow.cancelCase || null,
        ]
      );

      if (!result.rowCount) {
        skipped += 1;
        continue;
      }
      inserted += 1;
      const escrowId = result.rows[0].id;
      const status = escrow.status || (row.status === 'PAID' ? 'HELD' : 'NOT_FUNDED');

      await client.query(
        `INSERT INTO escrow_ledger (escrow_id, entry_type, amount, idempotency_key, note)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [escrowId, status === 'NOT_FUNDED' ? 'CANCEL' : 'HOLD', gross, `backfill-hold:${row.id}`, 'Idempotent metadata backfill (mock)']
      );

      if (status === 'RELEASED' && hold > 0) {
        await client.query(
          `INSERT INTO contractor_payouts (escrow_id, contractor_user_id, amount, status, reference_code, mock, processed_at)
           VALUES ($1,$2,$3,'PAID',$4,true,NOW())
           ON CONFLICT (escrow_id) DO NOTHING`,
          [escrowId, row.contractor_user_id, hold, `MOCK-PAYOUT-${row.id}`]
        );
      }
      if (status === 'REFUNDED' && gross > 0) {
        await client.query(
          `INSERT INTO escrow_refunds (escrow_id, amount, status, reason, cancel_case, idempotency_key, mock, processed_at)
           VALUES ($1,$2,'PAID',$3,$4,$5,true,NOW())
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [escrowId, gross, 'Metadata backfill mock refund', escrow.cancelCase || null, `backfill-refund:${row.id}`]
        );
      }
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({
      database: name,
      mock: true,
      inserted,
      skippedExisting: skipped,
      ignoredNonContractor: ignored,
    }, null, 2));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
