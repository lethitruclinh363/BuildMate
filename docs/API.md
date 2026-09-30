# BuildMate API

Base URL (dev): `http://localhost:5000/api`

Tài liệu này mô tả **hợp đồng API**. Đường dẫn, tên trường JSON, mã vai trò và mã trạng thái **giữ tiếng Anh** (`CUSTOMER`, `PENDING`, `/api/repair-requests`, …). Giao diện web dịch sang tiếng Việt; không đổi logic backend.

Mọi phản hồi:

```json
{
  "success": true,
  "message": "string",
  "data": {},
  "details": null,
  "errors": null
}
```

Lỗi: `success: false`, `data: null`. `errors` (Sprint 5.3) trùng `details` — client cũ không cần đổi.

Prefix: `/api` (ổn định) và `/api/v1` (alias). Xem [API_VERSIONING.md](./API_VERSIONING.md).

Header xác thực: `Authorization: Bearer <jwt>`

---

## Health (kiểm tra sống)

`GET /health`

---

## Auth (đăng nhập / đăng ký)

### Register — Đăng ký

`POST /auth/register`

Body:

```json
{
  "name": "Minh Anh",
  "email": "minh@example.com",
  "password": "Secret123",
  "phone": "0901111111",
  "role": "CUSTOMER"
}
```

`role`: `CUSTOMER` | `CONTRACTOR` | `MATERIAL_STORE_OWNER`  
Admin cannot self-register.

Success `201`:

```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "user": { "id": "...", "name": "...", "email": "...", "role": "CUSTOMER", "status": "ACTIVE" },
    "token": "<jwt>"
  }
}
```

Contractor accounts are created with `PENDING_VERIFICATION` (Sprint 2 approval). They can still log in in Sprint 1.

### Login

`POST /auth/login`

```json
{ "email": "oscar.d@example.net", "password": "Demo@1234" }
```

Success `200`: `{ user, token }`

Errors: `401` invalid credentials, `403` banned/inactive, `422` validation.

### Logout

`POST /auth/logout`  
Requires JWT. Sprint 1 is stateless — the client discards the token. A denylist can be added in Sprint 6.

---

## User

### Profile

`GET /user/profile`  
Requires JWT.

### Update profile

`PATCH /user/profile`

```json
{ "name": "New name", "phone": "0900000000", "preferredLanguage": "vi" }
```

### Change password

`PATCH /user/password` `{ "currentPassword": "...", "newPassword": "Secret123" }`  
`401` if current password is wrong.

### Avatar

`POST /user/avatar` multipart field `avatar` (jpeg/png/webp). Stored under `uploads/users/{userId}/`.

---

## Contractor (JWT, role CONTRACTOR)

`GET /contractor/workspace` — profile + store + counts (available before approval)

`GET /contractor/profile`  
`PATCH /contractor/profile` — company file. Locked while `SUBMITTED`.

`POST /contractor/verification/documents` — multipart `file` + `type`  
`DELETE /contractor/verification/documents/:documentId`  
`POST /contractor/verification/submit` — requires business name, address, and a `BUSINESS_LICENSE`

### Store (approved partners only)

`GET /contractor/store`  
`POST /contractor/store`  
`PATCH /contractor/store`  
`DELETE /contractor/store`

Body (create): `name`, `address`, optional `slogan`, `phone`, `city`, `storeType`, `coverImage`, `openingHours`, `serviceRadiusKm`, `status`, `lng`, `lat`.

### Catalog (approved + storefront exists)

`GET|POST /contractor/services`  
`PATCH|DELETE /contractor/services/:id`

`GET|POST /contractor/materials`  
`PATCH|DELETE /contractor/materials/:id`

`GET /contractor/earnings` — `{ totalRevenue, totalCommission, netEarning, transactions }` from the commission ledger.

---

## Admin (JWT, role ADMIN)

`GET /admin/stats` — `{ pending, approved, rejected, draft }`  
`GET /admin/audit-logs?action=ADMIN_APPROVE&limit=50`  
`GET /admin/verifications?status=SUBMITTED`  
`GET /admin/verifications/:id`  
`POST /admin/verifications/:id/approve`  
`POST /admin/verifications/:id/reject` `{ "reason": "..." }` (min 8 chars)  
`GET /admin/analytics` — users / orders / finance / reviews / complaints (60s cache)  
`GET /admin/settings/commission` · `PATCH /admin/settings/commission` `{ percentage }`  
`POST /admin/payments/:id/refund` `{ reason }`  
`GET /admin/complaints` · `PATCH /admin/complaints/:id` `{ status, adminNote }`

Only `SUBMITTED` applications can be approved or rejected. Approve sets `User.status = ACTIVE` and `Store.verified = true`.

---

## Public marketplace (Sprint 3, no JWT required)

Default job-site for demos: `lat=10.045` `lng=105.746` (Ninh Kieu, Can Tho).

### Nearby

`GET /location/stores/nearby?lat=10.045&lng=105.746&radius=5&category=Waterproofing&minRating=4&storeType=MATERIALS`  
`GET /location/contractors/nearby?lat=10.045&lng=105.746&radius=5&category=Electrical&minRating=4&storeType=SERVICES`

`$geoNear` on `stores.location` (2dsphere). Radius in **km**.  
Returns `{ storeName, businessName, distance, rating, services[], location, verified, … }`.  
Contractors: `storeType` SERVICES or BOTH. Stores: MATERIALS or BOTH.

Demo yards near Ninh Kieu: An Phu Construction (services) and Can Tho Materials (materials).

### Detail

`GET /stores/:id` — store + services + materials  
`GET /contractors/:id` — `:id` is the contractor **user id**. Profile, certificates, portfolio, services, store.

### Catalog search

`GET /services/search?category=Waterproofing&keyword=bath`  
`GET /materials/search?category=Cement&store=<storeId>`

---

## Repair requests (Sprint 4, JWT)

`POST /repair-requests` — CUSTOMER, multipart: `contractorId`, `category` (`PLUMBING` `ELECTRIC` `PAINTING` `WATERPROOF` `TILE`), `title`, `description`, optional `storeId` `address` `lat` `lng`, files `images[]` `videos[]`.  
Creates a `ChatRoom` and notifies the contractor.

`GET /repair-requests/my` — CUSTOMER  
`GET /repair-requests/received` — CONTRACTOR  
`GET /repair-requests/:id` — either party  
`PATCH /repair-requests/:id/accept` · `PATCH /repair-requests/:id/reject` — CONTRACTOR

## Chat

`GET /chat/rooms`  
`GET /chat/rooms/:roomId`  
`GET /chat/rooms/:roomId/messages`  
`POST /chat/rooms/:roomId/messages` `{ type, content }`  
`POST /chat/rooms/:roomId/media` multipart `file`

## Quotations

`POST /quotations` — CONTRACTOR `{ requestId, items[{type:MATERIAL|LABOR,name,quantity,price}], transportCost, estimatedDays, note }`  
`GET /quotations/:id`  
`GET /quotations/request/:requestId`  
`PATCH /quotations/:id/accept` · `reject` · `request-modification` `{ note }` — CUSTOMER

Accepting a quote sets the repair request to `ACCEPTED`, creates the **Order** + `payments` row (`UNPAID`), writes audit `ORDER_CREATED`, and notifies `ORDER_CREATED`. There is no `POST /orders`. A second accept returns the same order.

Response `data` keeps quotation fields at the root (Sprint 4 clients) and also returns `{ quotation, order, payment, notification }`.

## Orders (Sprint 5.1, JWT)

`GET /orders/customer` — CUSTOMER  
`GET /orders/contractor` — CONTRACTOR  
`GET /orders/:id` — customer or contractor on the order  
`POST /orders/:id/progress` — CONTRACTOR `{ status: STARTED|IN_PROGRESS|COMPLETED, description, images[] }` (multipart `images` allowed)  
`GET /orders/:id/progress`  
`POST /orders/:id/complete` — CUSTOMER when status is `COMPLETED` (contractor has finished; customer has not accepted yet)  
`POST /orders/:id/cancel` — `{ reason }` while status is `QUOTATION_ACCEPTED` or `DEPOSIT_PAID`

Repair job status: `QUOTATION_ACCEPTED` → `DEPOSIT_PAID` → `STARTED` → `IN_PROGRESS` → `COMPLETED` → `CUSTOMER_ACCEPTED`, plus `CANCELLED`. The contractor posts progress. Customer acceptance sets `CUSTOMER_ACCEPTED`. Orders are never deleted. There is no worker assignment API.

## Payments (Sprint 6.1, JWT)

Collection `payments` is **1:N per order**. Default type `FULL_PAYMENT`. Amount is copied from the order; the client cannot set it.

`POST /payments/:id/checkout` — CUSTOMER `{ method?: MOCK|COD|BANK_TRANSFER }` → `PENDING`  
`POST /payments/:id/mock-success` — CUSTOMER, **not in production** → `PAID` + commission  
`GET /payments/order/:orderId` — customer, contractor, or admin

Statuses: `UNPAID` `PENDING` `PAID` `FAILED` `REFUNDED`.

## Reviews

`POST /reviews` — CUSTOMER `{ orderId, targetUserId, targetType: CONTRACTOR|MATERIAL_STORE, rating, comment }` only if order `CUSTOMER_ACCEPTED`  
`GET /reviews/user/:id?targetType=` — public list + average for that target

## Complaints

`POST /complaints` — party on the order `{ orderId, againstUser, reason, description }`  
`GET /complaints/my`

Window: 7 days after `CUSTOMER_ACCEPTED`. Parties are the customer and the contractor.

## Notifications

`GET /notifications?page=1&limit=40&unread=true` → `{ items, unread, total, page }`  
`PATCH /notifications/:id/read`  
`PATCH /notifications/read-all`

Types: `REQUEST` `MESSAGE` `QUOTATION` `QUOTATION_ACCEPTED` `QUOTATION_REJECTED` `QUOTATION_MODIFY` `STATUS_UPDATE` `ORDER_CREATED` `ORDER_COMPLETED` `CONTRACTOR_ACCEPTED_JOB` `CONTRACTOR_STARTED_JOB` `CONTRACTOR_UPDATED_PROGRESS` `CONTRACTOR_COMPLETED_JOB` `PAYMENT_SUCCESS` `PAYMENT_FAILED` `COMMISSION_CREATED` `NEW_REVIEW` `NEW_COMPLAINT` `COMPLAINT_UPDATED`

`MESSAGE` is chat. `PAYMENT_SUCCESS` and `PAYMENT_FAILED` are payment. Job-site events are the four `CONTRACTOR_*` types.

## Uploads (Sprint 4.5)

`POST /uploads/:scope` multipart `file`. JWT required.  
`scope`: `users` `contractors` `stores` `repair` `chat` `progress`

Allowed: jpg/png/webp/gif, mp4/mov, pdf/doc/docx. Filename is timestamp + random hex. Max size `MAX_FILE_SIZE_MB` (default 8).

## Audit logs

Written on admin verification, quotation status, repair status, profile/password/avatar changes.  
Admin list: `GET /admin/audit-logs`

---

## Status codes

| Code | Meaning |
| --- | --- |
| 200 / 201 | Success |
| 400 | Bad request / invalid file |
| 401 | Missing / invalid token |
| 403 | Role or account status blocked |
| 404 | Not found |
| 409 | Duplicate / conflict |
| 422 | Validation |
| 429 | Rate limit |
| 500 | Internal error (generic message in production) |

---

## Socket.IO (Sprint 4)

Path: `/socket.io`  
Auth: `handshake.auth.token` (same JWT as REST).

On connect the socket joins `user:{id}` for notifications.

| Event | Direction | Payload |
| --- | --- | --- |
| `join_room` | client → server | `{ roomId }` |
| `send_message` | client → server | `{ roomId, type, content }` |
| `receive_message` | server → room | persisted message (+ `quotation` when type is QUOTATION) |
| `typing` | both | `{ roomId, userId, name, isTyping }` |
| `user_online` | server → all | `{ userId, online }` |
| `notification:new` | server → user | notification document |
| `order_created` | server → user | `{ order }` — quotation accepted, repair job exists |
| `contractor_accepted_job` | server → user | `{ order, progress }` |
| `contractor_started_job` | server → user | `{ order, progress }` |
| `contractor_updated_progress` | server → user | `{ order, progress }` |
| `contractor_completed_job` | server → user | `{ order, progress }` |
| `order_completed` | server → user | `{ order }` — customer accepted the finished job |

Message types: `TEXT` `IMAGE` `VIDEO` `QUOTATION`.
