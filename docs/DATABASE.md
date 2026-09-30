Related: [DATABASE_FINAL.md](./DATABASE_FINAL.md) is the ERD lock for Sprint 5–6. This file remains the Sprint 1–4.5 snapshot.

# Database schema (Sprint 1–4.5)

Cơ sở dữ liệu MongoDB: `buildmate`. Tên collection, field và enum **giữ tiếng Anh**.

Identity nằm trên **users**. Hồ sơ đối tác tách collection để truy vấn nhà thầu, cửa hàng vật liệu và catalog mà không phình User.

Identity stays on **users**. Partner operations live on separate collections so the app can query contractors, material stores, and catalogs without bloating User. Roles are `CUSTOMER`, `CONTRACTOR`, `MATERIAL_STORE_OWNER`, and `ADMIN`.

## users

Unchanged from Sprint 1. `PENDING_VERIFICATION` is the login status while a contractor waits for admin review.

## contractorprofiles

1:1 with a contractor `User`. Documents are **embedded** (few files, always loaded with the application).

| Field | Type | Notes |
| --- | --- | --- |
| `userId` | ObjectId | unique |
| `businessName`, `taxCode`, `address`, `city`, `description` | string | |
| `yearsExperience` | number | |
| `serviceAreas` | string[] | districts |
| `verificationStatus` | enum | `DRAFT` `SUBMITTED` `APPROVED` `REJECTED` |
| `documents[]` | `{ type, url, originalName, mimeType, size }` | max 8 |
| `rejectionReason` | string | |
| `submittedAt`, `reviewedAt`, `reviewedBy` | | |

Document `type`: `BUSINESS_LICENSE` `CERTIFICATE` `ID_CARD` `STORE_IMAGE` `PORTFOLIO`

## stores

1:1 with contractor (`contractorId` unique). GeoJSON for Sprint 3 `$near`.

| Field | Type |
| --- | --- |
| `name`, `slogan`, `description`, `phone`, `address`, `city` | string |
| `storeType` | `SERVICES` `MATERIALS` `BOTH` |
| `coverImage`, `gallery` | string / string[] |
| `openingHours` | string |
| `serviceRadiusKm` | 1–50 |
| `category` | primary trade, e.g. Waterproofing |
| `verified` | set true when admin approves |
| `rating`, `reviewCount` | placeholder until Sprint 6 reviews |
| `status` | `DRAFT` `LIVE` `PAUSED` |
| `location` | GeoJSON Point `[lng, lat]`, **2dsphere** |

## services

`name`, `category`, `description`, `basePrice`, `unit`, `estimatedHours`, `image`, `images[]`, `priceRange {min,max}`, `isActive`

## materials

`name`, `category`, `sku`, `unit`, `price`, `stock`, `minOrderQty`, `image`, `images[]`, `description`, `isActive`

## repairrequests

Customer brief to a verified contractor. One `chatrooms` row is created with the request.

`customerId`, `contractorId`, `storeId`, `category` (`PLUMBING` `ELECTRIC` `PAINTING` `WATERPROOF` `TILE`), `title`, `description`, `images[]`, `videos[]`, `address`, GeoJSON `location`, `status` (`PENDING` `ACCEPTED` `REJECTED` `COMPLETED` `CANCELLED`)

## chatrooms

1:1 with a repair request. `customerId`, `contractorId`, `requestId` (unique), `lastMessage`, `lastMessageAt`

## messages

`roomId`, `senderId`, `type` (`TEXT` `IMAGE` `VIDEO` `QUOTATION`), `content`, `quotationId`, `read`

## quotations

Line items seed from catalog names/prices but are **copied** onto the quote so later stock changes do not rewrite history.

`requestId`, `customerId`, `contractorId`, `roomId`, `items[{type: MATERIAL|LABOR, name, quantity, unit, price}]`, `materialCost`, `laborCost`, `transportCost`, `totalCost`, `estimatedDays`, `status` (`DRAFT` `SENT` `ACCEPTED` `REJECTED` `MODIFICATION_REQUEST`)

## notifications

`userId`, `title`, `message`, `type` (`REQUEST` `MESSAGE` `QUOTATION` `QUOTATION_ACCEPTED` `QUOTATION_REJECTED` `QUOTATION_MODIFY` `STATUS_UPDATE` `ORDER_CREATED` `ORDER_COMPLETED` `CONTRACTOR_ACCEPTED_JOB` `CONTRACTOR_STARTED_JOB` `CONTRACTOR_UPDATED_PROGRESS` `CONTRACTOR_COMPLETED_JOB` `PAYMENT_SUCCESS` `PAYMENT_FAILED`), `isRead`, `link`, `meta`

## auditlogs

Admin and high-impact actions. Collection name: `auditlogs`.

| Field | Notes |
| --- | --- |
| `actorId` | User who did the action |
| `actorRole` | `ADMIN` `CUSTOMER` `CONTRACTOR` … |
| `action` | Sprint 4.5 actions plus `ORDER_CREATED` `PROGRESS_UPDATED` `ORDER_COMPLETED` |
| `entityType` / `entityId` | Target document |
| `meta` | Extra JSON |
| `ip` | From request when available |

## orders (Sprint 5.1)

Unique `quotationId` (and `requestId`). Never deleted.

| Field | Notes |
| --- | --- |
| `orderCode` | `BM-YYYYMMDD-XXXXXX` |
| `quotationId`, `requestId`, `customerId`, `contractorId`, `storeId` | refs |
| `title`, `description` | copied from the request |
| `location` | GeoJSON Point, 2dsphere |
| `amount` | quotation `totalCost` snapshot |
| `status` | `QUOTATION_ACCEPTED` `DEPOSIT_PAID` `STARTED` `IN_PROGRESS` `COMPLETED` `CUSTOMER_ACCEPTED` `CANCELLED` |
| `paymentStatus` | denormalized; `UNPAID` `PENDING` `PAID` `FAILED` `REFUNDED` |

Indexes: unique `quotationId`, `customerId`, `contractorId`, `status`, 2dsphere `location`.

## progressupdates

Append-only. The contractor posts these. `orderId`, `status` (`STARTED` `IN_PROGRESS` `COMPLETED`), `description`, `images[]`, optional GeoJSON `location`, `createdAt`.

## payments

1:N per order. Fields: `orderId`, `customerId`, `contractorId`, `amount`, `type` (`FULL_PAYMENT` `DEPOSIT` `FINAL_PAYMENT`), `status` (`UNPAID` `PENDING` `PAID` `FAILED` `REFUNDED`), `provider`, `transactionCode`, `metadata`, `paidAt`. Unique `(orderId, type)`.

## commissionrules / commissions

Active rule default 5%. Commission row created only when a payment becomes `PAID` (`rateSnapshot`, `platformAmount`, `contractorAmount`, `POSTED` | `REVERSED`). Unique `paymentId`.

## reviews

`orderId`, `customerId`, `targetUserId`, `targetType` (`CONTRACTOR` | `MATERIAL_STORE`), `rating` 1–5, `comment`, `images`. Unique `(orderId, customerId, targetUserId, targetType)`. Allowed only after the customer accepts the finished work. Contractor reviews update `stores.rating`. Material-store reviews update `stores.materialRating`.

## complaints

`orderId`, `createdBy`, `againstUser`, `reason`, `description`, `attachments`, `status` (`OPEN` `PROCESSING` `RESOLVED` `REJECTED`), `adminNote`. Customer or contractor only. 7 days after `CUSTOMER_ACCEPTED`.

## Uploads on disk

`backend/uploads/{users,contractors,stores,repair,chat,progress}/{userId}/`

## Still later

Sprint 5.2: Order UI.  
Sprint 6.1: payment capture (mock), commission, reviews, complaints, analytics API.  
Sprint 6.2: finance UI.
