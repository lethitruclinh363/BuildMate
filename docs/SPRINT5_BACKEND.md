# Sprint 5.1 — Repair job execution (backend)

Status: **implemented** (backend). The contractor runs the job. There is no Worker account, assignment, or roster.

Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md). HTTP detail: [API.md](./API.md).

## Factory rule

There is **no** `POST /orders`.

The only birth of an order is:

`PATCH /api/quotations/:id/accept`

```
Quotation ACCEPTED
  → Order QUOTATION_ACCEPTED
  → Payment UNPAID
  → Audit ORDER_CREATED
  → Notification ORDER_CREATED (new repair job for the contractor)
  → Socket order_created
```

A second accept on the same quotation is **idempotent**. Unique index on `orders.quotationId` is the last line of defence.

## Repair job

```
Customer Request
    ↓
Contractor Quotation
    ↓
Deposit
    ↓
Repair Job
    ↓
Contractor Progress Update
    ↓
Customer Acceptance
```

Order status:

```
QUOTATION_ACCEPTED
  → DEPOSIT_PAID
  → STARTED
  → IN_PROGRESS
  → COMPLETED
  → CUSTOMER_ACCEPTED
```

`CANCELLED` is allowed from `QUOTATION_ACCEPTED` or `DEPOSIT_PAID`. Orders are **never deleted**.

A deposit payment (`DEPOSIT`) advances the order to `DEPOSIT_PAID` when the current status is still before that step.

### Progress (append-only, contractor only)

`STARTED` | `IN_PROGRESS` | `COMPLETED`

Each `POST` inserts a new `progressupdates` row. The customer is notified with:

| Progress | Notification | Socket |
| --- | --- | --- |
| First start before work has begun | `CONTRACTOR_ACCEPTED_JOB` | `contractor_accepted_job` |
| A later start update | `CONTRACTOR_STARTED_JOB` | `contractor_started_job` |
| `IN_PROGRESS` | `CONTRACTOR_UPDATED_PROGRESS` | `contractor_updated_progress` |
| `COMPLETED` | `CONTRACTOR_COMPLETED_JOB` | `contractor_completed_job` |

`POST /orders/:id/complete` is the customer. It requires status `COMPLETED` and sets `CUSTOMER_ACCEPTED`. That notice is `ORDER_COMPLETED` / `order_completed`, not a contractor event.

## Collections

| Collection | Purpose |
| --- | --- |
| `orders` | Repair job, unique `quotationId` |
| `progressupdates` | Contractor progress history |
| `payments` | Deposit, final, or full payment |

There is no `workers` or `workassignments` collection.

## API

| Method | Path | Role |
| --- | --- | --- |
| `PATCH` | `/quotations/:id/accept` | CUSTOMER — factory |
| `GET` | `/orders/customer` | CUSTOMER |
| `GET` | `/orders/contractor` | CONTRACTOR |
| `GET` | `/orders/:id` | CUSTOMER or CONTRACTOR on the order |
| `POST` | `/orders/:id/progress` | CONTRACTOR |
| `GET` | `/orders/:id/progress` | parties |
| `POST` | `/orders/:id/complete` | CUSTOMER when `COMPLETED` |
| `POST` | `/orders/:id/cancel` | customer or contractor before work starts |

## Demo after seed

Customer `customer@buildmate.vn`, contractor `anphu@buildmate.vn` (An Phu Construction), material store `materials@buildmate.vn` (Can Tho Materials), admin `admin@buildmate.vn`.

The bathroom-leak request is tied to the material store. Accepting the quotation creates the repair job.
