# Auth/User PostgreSQL runtime

`DATABASE_PROVIDER=postgres` switches only Auth and User reads/writes to `public.users`.
Every other domain still uses Mongoose. A failed PostgreSQL query is returned as an error and is not retried against MongoDB.

The public API id remains the 24-character `legacy_mongo_id`. `users.id` stays the BIGINT identity primary key and is not sent to the client.

| API / Mongoose | PostgreSQL `users` |
| --- | --- |
| `_id` | `legacy_mongo_id` |
| `fullName` / `name` | `full_name` |
| `email` | `email` (lookup is case-insensitive; uniqueness is the PostgreSQL expression index) |
| `phone` / `phoneNumber` | `phone_number` |
| `password` | `password_hash` (existing `$2` bcrypt hashes are compared, not hashed again) |
| `role` | `roles.code` via `role_id` |
| `status` | `account_status` |
| `profileStatus` | `profile_status` |
| `tokenVersion` | `token_version` |
| `avatar` | `avatar_url` |
| `emailVerified` | `email_verified` |
| verification OTP fields | `verification_code`, `verification_attempts`, `verification_sent_at`, `verification_expires_at` |
| reset OTP fields | `reset_password_token`, `reset_password_attempts`, `reset_password_sent_at`, `reset_password_expires_at` |
| `preferredLanguage` | `preferred_language` |
| policy acceptance | `accepted_policy`, `accepted_policy_version`, `accepted_policy_at` |

New registrations generate `legacy_mongo_id` in the application and insert only into PostgreSQL. Policy acceptance and audit logs still read/write MongoDB until those domains are converted.

Prisma introspection produced 55 models in `backend/prisma/schema.prisma`. Do not run `prisma migrate`, `prisma migrate reset`, or `prisma db push` against this database.
