-- Allow a deposit payment to exist on an accepted quotation before the
-- contractor order is created. Safe to re-run. Does not drop history.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS quotation_id BIGINT;

ALTER TABLE payments
  ALTER COLUMN service_order_id DROP NOT NULL;

UPDATE payments p
SET quotation_id = so.quotation_id
FROM service_orders so
WHERE p.service_order_id = so.id
  AND p.quotation_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_payments_quotation'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT fk_payments_quotation
      FOREIGN KEY (quotation_id) REFERENCES quotations(id)
      ON UPDATE NO ACTION ON DELETE NO ACTION;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_quotation_type
  ON payments (quotation_id, payment_type)
  WHERE quotation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_quotation
  ON payments (quotation_id);
