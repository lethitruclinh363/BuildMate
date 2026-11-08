-- Partner weekly operating hours (source of truth on contractor_profiles).
-- Safe additive change: existing rows stay NULL = "not configured".
ALTER TABLE contractor_profiles ADD COLUMN IF NOT EXISTS weekly_hours jsonb;

-- Keep a compact summary on stores for older public-card fields.
ALTER TABLE stores ALTER COLUMN opening_hours TYPE varchar(200);
ALTER TABLE stores ALTER COLUMN opening_hours SET DEFAULT '';
