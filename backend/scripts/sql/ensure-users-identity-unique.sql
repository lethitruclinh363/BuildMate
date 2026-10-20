-- Login-identity uniqueness for public.users.
-- Expression / partial UNIQUE indexes are not created by prisma db push.
-- Apply on BuilMate_test via apply-users-identity-unique-on-test.js.
-- Fail-fast if duplicates still exist. Does not DROP existing accounts.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM users GROUP BY lower(email) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create uq_users_email_lower: duplicate emails still exist';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower
    ON public.users (lower(email));

  IF EXISTS (
    SELECT 1
    FROM users
    WHERE phone_number IS NOT NULL AND btrim(phone_number) <> ''
    GROUP BY phone_number
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create uq_users_phone_number_nonempty: duplicate phones still exist';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone_number_nonempty
    ON public.users (phone_number)
    WHERE phone_number IS NOT NULL AND btrim(phone_number) <> '';
END
$$;
