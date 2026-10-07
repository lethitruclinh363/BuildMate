# PostgreSQL performance audit

Audit only. No schema change, no new index, no business-logic change, no return to MongoDB.

Measured against database `BuilMate`, schema `public`, on 7 Oct 2026. Row counts at measurement time:

| Table | Rows |
| --- | ---: |
| users | 30 |
| contractor_profiles | 9 |
| stores | 8 |
| services | 8 |
| materials | 2 |
| repair_requests | 11 |
| chat_rooms | 11 |
| messages | 23 |
| quotations | 10 |
| service_orders | 8 |
| material_orders | 4 |
| notifications | 130 |
| reviews | 6 |

SQL execution for these tables is under 1 ms. The time is spent in Prisma `findMany` of the whole table, nested includes, and repeating that work for every filter. PostgreSQL already has unique `legacy_mongo_id`, foreign keys, and the status / `created_at` / `store_id` / `customer_user_id` indexes. `EXPLAIN ANALYZE` uses `idx_materials_store_active` when the query filters by `store_id`. The application never sends that filter: the adapter loads every row and filters in JavaScript. A new index would not speed up the current queries. Do not raise the Prisma pool until those scans are removed; more connections would run more full scans at once.

Development request logs (not enabled when `NODE_ENV=production`):

```text
GET /api/materials 200 84ms db=4/70ms
```

The line is method, path without query string, status, total time, Prisma model-query count, and summed query time. Passwords, JWT, OTP, database credentials, and eKYC payloads are not written.

## CRITICAL

### C1. Partner reads load every profile, store, service, and material

- Page / API: `GET /api/material-store/workspace`, `GET /api/contractor/workspace`, material list, activation.
- Cause: `find`, `findOne`, `findById`, and `countDocuments` call `allProfiles`, `allStores`, `allServices`, or `allMaterials`, then filter in memory. `getMaterialWorkspace` also calls `enforceStoreType`, which saves the store and runs `separateCatalog` (`Service.deleteMany`) on a GET.
- Evidence: one profile load is 294 ms and 53,688 bytes for 9 rows (documents, portfolio, catalog includes). The read sequence inside workspace, without the save, took 1,245 ms. A live workspace call is slower because of the write. This path was not executed, so no store row was rewritten during the audit.
- Request count: 1 HTTP call, about 8 full-table reads, plus 1 store write and 1 service scan/delete.
- Files: `backend/src/repositories/partner.postgres.js`, `backend/src/repositories/offering.postgres.js`, `backend/src/services/contractorService.js` (`getMaterialWorkspace`), `backend/src/services/storeService.js` (`enforceStoreType`, `separateCatalog`), `backend/src/services/activation.service.js`.
- Proposed fix: query `WHERE legacy_mongo_id` / `store_id` / `user_id` in PostgreSQL. Stop saving and deleting from a GET.

## HIGH

### H1. `/store/materials` refetches a waterfall, and language restore runs it again

- Page: `/store/materials`, `/store/products`, `/store/prices` (same component, so each route remounts).
- Cause: `load()` awaits workspace, then `getStore`, then materials and categories. The effect depends on `t`. Login restore calls `GET /user/profile` and then `setAppLanguage`, which changes `t` and starts the waterfall a second time.
- Evidence: workspace reads alone are 1,245 ms. `GET /materials` then loads all stores twice (route middleware and `assertMaterialStore`) and all materials once (93 ms, 1,882 bytes for 2 rows).
- Request count per visit: 4 HTTP calls, and 8 if language is applied after mount. Plus the notification bell.
- Files: `frontend/src/pages/store/StoreMaterialsPage.tsx`, `frontend/src/context/AuthContext.tsx`, `frontend/src/providers/I18nProvider.tsx`, `backend/src/routes/materialStoreRoutes.js`.
- Proposed fix: one endpoint for the catalog page. Run the effect once on mount. Keep the three routes on one mounted page.

### H2. Request history reloads every store and every chat room per card

- Page / API: `/customer/request/history`, `GET` repair `mine`. Same shape for contractor received requests and the customer dashboard count.
- Cause: `listMine` loads every repair request (120 ms, 14,743 bytes, 11 rows). `populateCard` then, for each row, loads both users, every store, and every chat room. The 11 cards run with `Promise.all`.
- Evidence: that populate shape took 749 ms for 11 cards. `idx_repair_requests_customer_created` exists and is unused because the filter happens after `findMany` of the whole table.
- Request count: 1 HTTP call. Database reads: 1 request scan plus 11 store scans and 11 room scans, plus user lookups.
- Files: `backend/src/services/repairService.js`, `backend/src/repositories/conversation.postgres.js`, `frontend/src/pages/customer/RequestHistoryPage.tsx`, `frontend/src/pages/CustomerDashboardPage.tsx`.
- Proposed fix: one query filtered by `customer_user_id`, with the room id joined. Do not call `allStores` / `allRooms` inside the loop.

### H3. Every dashboard shell loads all notifications three times

- Page: any customer, contractor, or store page that mounts `DashboardShell`.
- Cause: `NotificationBell` calls `listForUser` on mount. `find`, and both `countDocuments` calls, each run `allNotes` (130 rows, 26 ms, 51,227 bytes) and then apply `skip` / `limit` in JavaScript.
- Request count: 1 HTTP call, 3 full notification reads, on every shell mount.
- Files: `frontend/src/features/notification/components/NotificationBell.tsx`, `backend/src/services/notificationService.js`, `backend/src/repositories/system.postgres.js`.
- Proposed fix: `WHERE user_id` with SQL `COUNT` and `LIMIT`.

## MEDIUM

### M1. Full-page skeleton replaces the screen

- Pages: `/store/materials`, `/customer/request/history`, and the same pattern on order lists.
- Cause: `loading` returns `DashboardSkeleton` instead of keeping the previous layout. History sets `loading` true again on retry.
- Evidence: source in `StoreMaterialsPage.tsx` and `RequestHistoryPage.tsx`. No network capture of a signed-in browser session was taken; call counts above come from the component call graph plus measured query time.
- Proposed fix: keep the shell and show a local pending state.

### M2. Order detail polls every 15 seconds

- Pages: material order detail (customer) and store order detail.
- Cause: `setInterval(..., 15000)` refetches the order even when a socket listener already exists on the dashboard shell.
- Files: `frontend/src/pages/customer/MaterialOrderDetailPage.tsx`, `frontend/src/pages/store/StoreOrderDetailPage.tsx`.
- Proposed fix: refresh from the existing socket event.

### M3. Service and material orders use the same full-table adapter

- API: customer orders, contractor orders, store orders.
- Evidence: service orders 8 rows / 59 ms / 8,195 bytes; material orders 4 rows / 103 ms / 6,635 bytes. Counts are small today. `listForCustomer` still scans every order.
- Files: `backend/src/repositories/commerce.postgres.js`, `backend/src/repositories/materialOrder.postgres.js`.
- Proposed fix: filter by `customer_user_id` or `store_id` in SQL. Indexes for those columns already exist.

### M4. Admin theme and auth do not refetch lists

- Admin `App` applies theme in an effect and restores the session once. Theme change does not refetch data.
- Catalog and policy pages each fetch on mount. They are subject to M3 only when the backing repository scans a whole table.

## LOW

### L1. Response compatibility on the three pages

- Public ids are `legacy_mongo_id` strings. Money fields are converted with `Number` before `toPublic`. Repair `images` is always an array from `repair_request_media`.
- No `BigInt` value is placed on these responses, so `JSON.stringify` does not throw there. A raw Prisma row returned from a new handler would throw, because Express cannot serialize `BigInt`.
- Dates are JavaScript `Date` values and become ISO strings in JSON.
- No frontend `map is not a function` path was found on the three target pages. This was a code read, not a captured browser console.

### L2. Connection pool

- `backend/src/config/prisma.js` keeps one `PrismaClient` on `global.__buildmatePrisma`. Requests do not construct or disconnect a client.
- `DATABASE_URL` has no `connection_limit`. Prisma uses its default (`num_physical_cpus * 2 + 1`).
- Leave the pool at the default. The stall is repeated table reads, not pool exhaustion.

## Optimization results

Measured again on the same database after the read-path changes. The earlier workspace figure was the read sequence only. The live handler also wrote the store on every GET; that write is no longer part of the request.

| Path | Before | After |
| --- | --- | --- |
| `GET` material workspace reads | 1,245 ms, about 8 full-table reads, plus a store save and a service delete scan | 670 ms, 5 queries, summed DB time 785 ms, no write |
| Repair history `listMine` | 749 ms, 1 request scan + 11 store scans + 11 room scans | 156 ms, 4 queries |
| Notification list | 3 full reads of 130 rows (~51 KB each) | 34 ms, 3 queries: `WHERE user_id` with `LIMIT`/`OFFSET`, plus two `COUNT`s |
| Material list for one store | full `materials` scan, 93 ms, then filtered in JavaScript | 159 ms, 2 queries (one store, then that store's materials) |

`EXPLAIN ANALYZE` for `materials.store_id + is_active` uses `idx_materials_store_active`. `chat_rooms.repair_request_id` uses its unique index. Equality filters on `repair_requests.customer_user_id` and `notifications.user_id` still sequence-scan at the current 12 and 144 rows; execution is 0.1–0.6 ms. Those indexes already exist (`idx_repair_requests_customer_created`, `idx_notifications_user_created`, `idx_notifications_user_read`). No new index was created, because the planner would not use another one at this size.

`legacy_mongo_id` is already `UNIQUE` on the tables in this audit. Filters now join through that unique key instead of loading every row and comparing ids in JavaScript.

List responses stay arrays (or the existing notification page object). SQL `LIMIT` is applied where the API already passed `limit`/`skip` (messages, notifications, material orders). Unpaged owner lists return every row for that owner, not every row in the table.

No catalog/policy cache was added. Those rows change when an admin approves them, and they were not the measured stall. Repeated profile and store reads inside one workspace call were removed by reusing the rows already loaded.
