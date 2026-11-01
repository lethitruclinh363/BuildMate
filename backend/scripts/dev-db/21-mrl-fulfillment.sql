-- Expand Material Requirement List statuses for store fulfillment.
-- Apply only on BuilMate_dev. Keeps existing lists and quote history.
-- Safe to re-run: drops then recreates chk_mrl_status after verifying current values.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'material_requirement_lists'
  ) AND EXISTS (
    SELECT 1
    FROM material_requirement_lists
    WHERE status IS NOT NULL
      AND status NOT IN (
        'DRAFT',
        'SENT',
        'QUOTED',
        'CONFIRMED',
        'PREPARING',
        'DELIVERING',
        'DELIVERED',
        'CANCELLED'
      )
  ) THEN
    RAISE EXCEPTION 'material_requirement_lists has statuses outside the fulfillment set';
  END IF;
END $$;

ALTER TABLE material_requirement_lists
  DROP CONSTRAINT IF EXISTS chk_mrl_status;

ALTER TABLE material_requirement_lists
  ADD CONSTRAINT chk_mrl_status
  CHECK (status IN (
    'DRAFT',
    'SENT',
    'QUOTED',
    'CONFIRMED',
    'PREPARING',
    'DELIVERING',
    'DELIVERED',
    'CANCELLED'
  ));
