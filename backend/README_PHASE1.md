# BuildMate MongoDB -> PostgreSQL Migration — Phase 1

Scope: `roles + locations + users` only.

This phase is intentionally isolated. It does **not** switch the running backend away from MongoDB and it does **not** delete or edit MongoDB documents.

## Source basis

- `backend/src/models/user.model.js`
- PostgreSQL V2 tables: `public.roles`, `public.locations`, `public.users`
- Worker actor is excluded. Supported roles are:
  - `ADMIN`
  - `CUSTOMER`
  - `CONTRACTOR`
  - `MATERIAL_STORE_OWNER`

## Why the migration reads the raw Mongo collection

The User Mongoose schema marks password/token fields as `select: false`. The migration therefore reads `mongoose.connection.db.collection('users')` directly so it can preserve existing bcrypt password hashes and authentication state exactly instead of re-hashing passwords.

## 1. Install the PostgreSQL driver

From the real `backend` folder:

```bash
npm install pg@^8
```

Do not remove `mongoose` yet.

## 2. Copy the Phase-1 files into the backend

Copy:

```text
.env.migration.example
scripts/migration/
```

into your real `backend/` directory.

Result:

```text
backend/
  .env                  <- existing Mongo/backend environment; keep unchanged
  .env.migration        <- new PostgreSQL migration settings
  scripts/
    migration/
      00-check-connections.js
      01-migrate-users-locations.js
      02-verify-users-locations.js
      lib/connections.js
      output/
```

## 3. Create `.env.migration`

Copy `.env.migration.example` to `.env.migration` and fill in your PostgreSQL server connection locally.

Do not commit `.env.migration` to Git.

Recommended `.gitignore` entries:

```gitignore
.env.migration
scripts/migration/output/*.json
```

The migration still reads `MONGODB_URI` from the existing backend `.env`, so you do not need to duplicate the MongoDB credential.

## 4. Preflight

```bash
node scripts/migration/00-check-connections.js
```

Expected end:

```text
Preflight PASSED. No data was changed.
```

This checks both databases, the PostgreSQL V2 core tables, and the four roles.

## 5. Migrate users and embedded user locations

```bash
node scripts/migration/01-migrate-users-locations.js
```

Important behavior:

- preserves MongoDB `_id` in `users.legacy_mongo_id`;
- preserves the existing bcrypt password hash; no password is re-hashed;
- maps Mongo role strings to `roles.id`;
- maps a valid GeoJSON `[longitude, latitude]` to a row in `locations`;
- treats default `[0,0]` as “no location”;
- preserves created/updated timestamps where available;
- runs inside one PostgreSQL transaction;
- validates missing names/emails/passwords, unsupported roles, duplicate emails, and duplicate non-empty phone numbers before making changes;
- writes `scripts/migration/output/users-map.json` for audit/reference.

If validation fails, fix/inspect the source data first. Do not silently invent replacement values.

## 6. Verify

```bash
node scripts/migration/02-verify-users-locations.js
```

Expected end:

```text
Verification PASSED. Phase 1 is ready for the next migration group.
```

The verifier compares total users and role counts between MongoDB and PostgreSQL and checks key relationships/duplicates.

## 7. Manual PostgreSQL checks

```sql
SELECT COUNT(*) FROM public.users WHERE legacy_mongo_id IS NOT NULL;

SELECT r.code, COUNT(*)
FROM public.users u
JOIN public.roles r ON r.id = u.role_id
GROUP BY r.code
ORDER BY r.code;

SELECT COUNT(*)
FROM public.users u
LEFT JOIN public.roles r ON r.id = u.role_id
WHERE r.id IS NULL;
```

The last query must return `0`.

## Do not do yet

Do **not**:

- change the running backend from MongoDB to PostgreSQL;
- delete MongoDB;
- remove Mongoose;
- change frontend/admin API endpoints.

After Phase 1 verifies cleanly, the next migration group is contractor onboarding/profile data and its child tables.
