# Sprint 5 — Architecture Lock

**Status:** LOCKED — implement from this pack; do not redesign collections.  
**Scope of Sprint 5 implementation:** Order + WorkAssignment + ProgressUpdate.  
**Schema locked now, code later:** Payment, Review, Complaint.  
**Out of Sprint 5 code:** payment gateway, commission settlement, dispute workflow UI, reviews UI.

Companion docs:

| File | Content |
| --- | --- |
| [ORDER_DESIGN.md](./ORDER_DESIGN.md) | Order invariants, state machines, accept-quote factory |
| [DATABASE_FINAL.md](./DATABASE_FINAL.md) | Full ERD + field dictionary |
| [API_CONTRACT_SPRINT5.md](./API_CONTRACT_SPRINT5.md) | HTTP contracts + permissions |
| [FLOW_DIAGRAM.md](./FLOW_DIAGRAM.md) | Sequence diagrams (6 flows) |

Existing runtime docs stay valid: [API.md](./API.md), [DATABASE.md](./DATABASE.md), [ARCHITECTURE.md](./ARCHITECTURE.md). Where they conflict with this pack, **this pack wins**.

---

## 1. What is frozen

Do **not** rename, split, or embed-away these collections:

`users` `contractorprofiles` `stores` `services` `materials` `repairrequests` `chatrooms` `messages` `quotations` `notifications` `auditlogs`

Do **not** change:

- JWT shape `{ sub, role }` / HS256
- Envelope `{ success, message, data, details }`
- Role enum `CUSTOMER | CONTRACTOR | MATERIAL_STORE_OWNER | ADMIN`
- Quotation line items as **copied snapshots** (not live catalog refs)
- Chat room **1:1** with `repairrequests`
- Store GeoJSON `[lng, lat]` + `2dsphere`
- Upload root `backend/uploads/{users,contractors,stores,repair,chat,progress}`

There is no Worker account, roster, or assignment collection.

`uploads/jobs` in older sprint notes is **void**. Progress media uses `uploads/progress`.

---

## 2. Business spine (locked)

```
Customer Request
  → Contractor Quotation
  → Deposit
  → Repair Job
  → Contractor Progress Update
  → Customer Acceptance
```

Payment / Review / Complaint hang off **Order**, not off Quotation.

```
Order 1:1 Payment        (row created in Sprint 5, charged in Sprint 6)
Order 0..N Review        (after CUSTOMER_ACCEPTED; contractor and material store)
Order 0..N Complaint     (Sprint 6)
```

---

## 3. New collections (Sprint 5 creates models)

| Collection | Model | Sprint that writes |
| --- | --- | --- |
| `orders` | `Order` | 5 |
| `progressupdates` | `ProgressUpdate` | 5 |
| `payments` | `Payment` | 5 creates `UNPAID` row; 6 charges |
| `reviews` | `Review` | 6 (schema locked) |
| `complaints` | `Complaint` | 6 (schema locked) |

Additive enums on existing docs are allowed (see DATABASE_FINAL). Removing or renaming existing fields is **forbidden**.

---

## 4. Cardinality (final)

| From | To | Rule |
| --- | --- | --- |
| User | ContractorProfile | 1:1 if role CONTRACTOR |
| User (CONTRACTOR) | Store | 1:1 |
| Store | Service / Material | 1:N |
| User (MATERIAL_STORE_OWNER) | Store | 1:1 materials catalog |
| Customer + Contractor | RepairRequest | N |
| RepairRequest | ChatRoom | 1:1 |
| ChatRoom | Message | 1:N |
| RepairRequest | Quotation | 1:N, **≤1 ACCEPTED** |
| Quotation ACCEPTED | Order | **1:1 required** |
| Order | ProgressUpdate | 1:N, written by the contractor |
| Order | Payment | 1:1 |
| Order | Review | 0..1 |
| Order | Complaint | 0:N |
| User | Notification / AuditLog | 1:N |

---

## 5. Factory rule — how an Order is born

**The only legal way to create an Order is accepting a quotation.**

- Endpoint remains `PATCH /quotations/:id/accept` (behavior extends; no `POST /orders` from thin air).
- Same request, one Mongo transaction:
  1. Quotation `SENT` → `ACCEPTED`
  2. RepairRequest → `ACCEPTED` (already true today)
  3. Insert `Order` `QUOTATION_ACCEPTED`
  4. Insert `Payment` `UNPAID` (amount = `quotation.totalCost`)
  5. Notify contractor `ORDER_CREATED`
  6. Audit `ORDER_CREATED`
- Idempotent: second accept returns the existing order (`409` with that order is also acceptable; prefer **200 + existing**).

`POST /orders` is **not** in the contract.

---

## 6. State machines (summary)

Full diagrams: [ORDER_DESIGN.md](./ORDER_DESIGN.md).

| Entity | States (locked) |
| --- | --- |
| RepairRequest | `PENDING → ACCEPTED → COMPLETED`; `PENDING → REJECTED`; `ACCEPTED → CANCELLED` (additive) |
| Quotation | `DRAFT → SENT → ACCEPTED \| REJECTED \| MODIFICATION_REQUEST`; `MODIFICATION_REQUEST → SENT` (new version) |
| Order | `QUOTATION_ACCEPTED → DEPOSIT_PAID → STARTED → IN_PROGRESS → COMPLETED → CUSTOMER_ACCEPTED`; also `CANCELLED` before work starts |
| Payment | `UNPAID → PENDING → PAID \| FAILED`; `PAID → REFUNDED` |

---

## 7. Layering (unchanged)

```
route → controller → service → model
```

Sprint 5 services:

- `order.service.js` — factory from quotation, list/get, cancel, customer accept
- `progress.service.js` — contractor progress, list timeline

Orders **do not** live inside `quotation.service.js` beyond the accept transaction calling `orderService.createFromQuotation`.

Frontend: pages under `/customer/orders` and `/contractor/orders`.

---

## 8. Compatibility with current code

| Current behavior | Lock |
| --- | --- |
| Contractor `PATCH /repair-requests/:id/accept` sets request `ACCEPTED` **before** a quote | Keep. Meaning: contractor **takes the job** and will quote. Order is **not** created here. |
| Customer quote accept also sets request `ACCEPTED` | Keep. This is the moment Order is created. |
| Multiple `SENT` quotations per request | Allowed. First `ACCEPTED` wins; other `SENT` → `REJECTED` (auto-supersede). |
| Request `COMPLETED` | Set only when the customer accepts the finished job |

---

## 9. Sprint 5 vs 6 split

**Sprint 5 must ship**

- Accept quote → Order `QUOTATION_ACCEPTED` + Payment `UNPAID`
- Deposit → `DEPOSIT_PAID`
- Contractor posts progress and marks the job `COMPLETED`
- Customer accepts → Order `CUSTOMER_ACCEPTED` + Request `COMPLETED`
- Contractor job notifications for those events

**Sprint 5 must not ship**

- Stripe/MoMo/COD capture
- Platform commission payout
- Public review scores replacing seed `stores.rating`
- Admin dispute console (collection exists, APIs stub-optional)

---

## 10. Decision log

| ID | Decision | Rejected alternative | Why |
| --- | --- | --- | --- |
| D1 | Order 1:1 ACCEPTED quotation | N orders per quote | Quote is the commercial snapshot; rework = new quote |
| D2 | Contractor posts all progress | A separate site login | One accountable party on the job |
| D3 | Progress is its own collection | Embed progress on Order | Timeline stays append-only |
| D4 | Customer acceptance is `CUSTOMER_ACCEPTED` | Contractor self-completes the handover | The customer signs off after `COMPLETED` |
| D5 | Cancel only before work starts | Cancel anytime | In-flight work uses a complaint |
| D6 | Payment row at order birth | Create payment at Sprint 6 | Avoids Order→Payment migration |
| D7 | Stock is **not** a hard gate | Block order if SKU stock < qty | Local yards sell off-platform; quote already copied prices |
| D8 | Customer acceptance is the only path to `CUSTOMER_ACCEPTED` | Contractor self-completes the handover | Matches “Customer acceptance” |
| D9 | Cancel allowed only before `IN_PROGRESS` | Cancel anytime | Protects in-flight labor; disputes use `DISPUTED` later |
| D10 | English collection/field names | Vietnamese names | Matches Sprint 1–4.5 |

---

## 11. Gap review (current system)

See §6 in [ORDER_DESIGN.md](./ORDER_DESIGN.md) for the actionable list. Headlines:

**Shipped:** repair job, contractor progress, customer acceptance, deposit, review, complaint.

**Edge cases:** double-accept quote, progress after customer acceptance, customer accept before `COMPLETED`.

**Security:** object-IDOR on order routes, contractor posting progress on another job, disk uploads not virus-scanned, JWT in `localStorage`.

**Scalability:** Socket.IO single node, disk uploads, unbounded message lists, `auditlogs` growth, `$geoNear` + in-memory filters.

---

## 12. Implementation freeze test

Sprint 5 is correctly designed if all of the following stay true:

1. No existing collection is dropped or renamed.
2. Accepting a quote is transactional and creates exactly one Order.
3. Only the contractor on the order can post progress.
4. `RepairRequest.COMPLETED` happens when the order becomes `CUSTOMER_ACCEPTED`.
5. Payment / Review / Complaint documents can be inserted later without Order schema changes (fields already reserved).
