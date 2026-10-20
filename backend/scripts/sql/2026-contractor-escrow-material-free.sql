-- BuildMate additive finance tables for contractor escrow / payout / refund.
-- STATUS: PREPARED for isolated BuilMate_test only.
-- Verified against current Prisma models before apply:
--   payments: unique (service_order_id, payment_type), metadata jsonb, FK CASCADE to service_orders
--   commissions: unique payment_id, exists in schema.prisma
--   material_orders / material_order_payments / material_commissions: already in Prisma; this file
--     only changes material_orders defaults and adds policy_version. It does not create material tables.
--   service_orders: adds optional policy_version; escrow tables reference id with ON DELETE CASCADE
-- Constraints: escrow split (fee+hold=gross), non-negative amounts, available_amount generated,
--   unique payout/refund/cancellation per escrow, ledger idempotency_key unique.
-- Do not run against the live BuilMate database until the team approves.
-- Apply only via scripts/apply-finance-sql-on-test.js (refuses BuilMate).
-- This file does not DROP, TRUNCATE, or rewrite historical payment amounts.
-- Dual-write rule: payments.metadata always; these tables when they exist. After apply, tables win CAS.

BEGIN;

ALTER TABLE material_orders
  ALTER COLUMN deposit_rate_snapshot SET DEFAULT 0,
  ALTER COLUMN platform_fee_rate_snapshot SET DEFAULT 0,
  ALTER COLUMN status SET DEFAULT 'PENDING_CONFIRMATION';

ALTER TABLE material_orders
  ADD COLUMN IF NOT EXISTS policy_version VARCHAR(40);

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS policy_version VARCHAR(40);

CREATE TABLE IF NOT EXISTS service_order_escrows (
  id BIGSERIAL PRIMARY KEY,
  service_order_id BIGINT NOT NULL UNIQUE REFERENCES service_orders(id) ON DELETE CASCADE,
  payment_id BIGINT NOT NULL UNIQUE REFERENCES payments(id) ON DELETE CASCADE,
  contractor_user_id BIGINT NOT NULL REFERENCES users(id),
  gross_amount NUMERIC(14, 2) NOT NULL CHECK (gross_amount >= 0),
  platform_fee_amount NUMERIC(14, 2) NOT NULL CHECK (platform_fee_amount >= 0),
  contractor_hold_amount NUMERIC(14, 2) NOT NULL CHECK (contractor_hold_amount >= 0),
  released_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (released_amount >= 0),
  refunded_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  available_amount NUMERIC(14, 2) GENERATED ALWAYS AS (gross_amount - released_amount - refunded_amount) STORED,
  status VARCHAR(30) NOT NULL DEFAULT 'NOT_FUNDED',
  payout_status VARCHAR(20) NOT NULL DEFAULT 'NONE',
  remaining_settled BOOLEAN NOT NULL DEFAULT FALSE,
  remaining_settled_at TIMESTAMPTZ,
  remaining_settled_by BIGINT,
  held_at TIMESTAMPTZ,
  frozen_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  cancel_case VARCHAR(40),
  mock BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_escrow_balance CHECK (released_amount + refunded_amount <= gross_amount),
  CONSTRAINT chk_escrow_split CHECK (platform_fee_amount + contractor_hold_amount = gross_amount),
  CONSTRAINT chk_escrow_payout_status CHECK (payout_status IN ('NONE', 'PENDING', 'PAID', 'FAILED')),
  CONSTRAINT chk_escrow_status CHECK (
    status IN (
      'NOT_FUNDED', 'HELD', 'FROZEN', 'RELEASE_PENDING',
      'RELEASED', 'REFUND_PENDING', 'REFUNDED', 'CANCELLED_SETTLED'
    )
  )
);

CREATE TABLE IF NOT EXISTS contractor_payouts (
  id BIGSERIAL PRIMARY KEY,
  escrow_id BIGINT NOT NULL REFERENCES service_order_escrows(id) ON DELETE CASCADE,
  contractor_user_id BIGINT NOT NULL REFERENCES users(id),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  reference_code VARCHAR(80) NOT NULL UNIQUE,
  processed_by BIGINT,
  processed_at TIMESTAMPTZ,
  mock BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_payout_escrow UNIQUE (escrow_id),
  CONSTRAINT chk_payout_status CHECK (status IN ('PENDING', 'PAID', 'FAILED'))
);

CREATE TABLE IF NOT EXISTS escrow_ledger (
  id BIGSERIAL PRIMARY KEY,
  escrow_id BIGINT NOT NULL REFERENCES service_order_escrows(id) ON DELETE CASCADE,
  entry_type VARCHAR(30) NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  actor_user_id BIGINT,
  idempotency_key VARCHAR(80) NOT NULL UNIQUE,
  note VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ledger_type CHECK (
    entry_type IN (
      'HOLD', 'FREEZE', 'RELEASE_PENDING', 'PAYOUT',
      'REFUND_PENDING', 'REFUND', 'CANCEL'
    )
  )
);

CREATE TABLE IF NOT EXISTS escrow_refunds (
  id BIGSERIAL PRIMARY KEY,
  escrow_id BIGINT NOT NULL REFERENCES service_order_escrows(id) ON DELETE CASCADE,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  reason VARCHAR(500) NOT NULL DEFAULT '',
  cancel_case VARCHAR(40),
  idempotency_key VARCHAR(80) NOT NULL UNIQUE,
  mock BOOLEAN NOT NULL DEFAULT TRUE,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_refund_escrow UNIQUE (escrow_id),
  CONSTRAINT chk_refund_status CHECK (status IN ('PENDING', 'PAID', 'FAILED'))
);

CREATE TABLE IF NOT EXISTS escrow_cancellations (
  id BIGSERIAL PRIMARY KEY,
  escrow_id BIGINT NOT NULL REFERENCES service_order_escrows(id) ON DELETE CASCADE,
  cancel_case VARCHAR(40) NOT NULL,
  reason VARCHAR(500) NOT NULL DEFAULT '',
  mock BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cancellation_escrow UNIQUE (escrow_id)
);

CREATE INDEX IF NOT EXISTS idx_escrows_status ON service_order_escrows (status);
CREATE INDEX IF NOT EXISTS idx_escrows_payment ON service_order_escrows (payment_id);
CREATE INDEX IF NOT EXISTS idx_payouts_contractor ON contractor_payouts (contractor_user_id, status);
CREATE INDEX IF NOT EXISTS idx_ledger_escrow ON escrow_ledger (escrow_id, created_at);

COMMIT;
