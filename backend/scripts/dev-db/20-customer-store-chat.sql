-- Customer–Material Store chat rooms on BuilMate_dev only.
-- Keeps repair-request rooms and does not drop chat history.

ALTER TABLE chat_rooms
  ALTER COLUMN repair_request_id DROP NOT NULL;

ALTER TABLE chat_rooms
  ADD COLUMN IF NOT EXISTS room_kind VARCHAR(32) NOT NULL DEFAULT 'CUSTOMER_CONTRACTOR';

ALTER TABLE chat_rooms
  ADD COLUMN IF NOT EXISTS store_id BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_chat_rooms_store'
  ) THEN
    ALTER TABLE chat_rooms
      ADD CONSTRAINT fk_chat_rooms_store
      FOREIGN KEY (store_id) REFERENCES stores(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_rooms_store ON chat_rooms (store_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_kind ON chat_rooms (room_kind);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_rooms_customer_store
  ON chat_rooms (customer_user_id, store_id)
  WHERE room_kind = 'CUSTOMER_MATERIAL_STORE' AND store_id IS NOT NULL;

ALTER TABLE chat_rooms DROP CONSTRAINT IF EXISTS chat_rooms_room_kind_check;
ALTER TABLE chat_rooms
  ADD CONSTRAINT chat_rooms_room_kind_check CHECK (
    (
      room_kind = 'CUSTOMER_CONTRACTOR'
      AND repair_request_id IS NOT NULL
      AND store_id IS NULL
    )
    OR (
      room_kind = 'CUSTOMER_MATERIAL_STORE'
      AND repair_request_id IS NULL
      AND store_id IS NOT NULL
    )
  );
