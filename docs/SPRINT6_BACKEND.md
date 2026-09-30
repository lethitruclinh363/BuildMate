# Sprint 6.1 — Backend (implemented)

**Status:** DONE (API only). No frontend, no live MoMo/Stripe, no bank payout.

Lock: [SPRINT6_ARCHITECTURE.md](./SPRINT6_ARCHITECTURE.md).

---

## What shipped

| Area | Behavior |
| --- | --- |
| Payment | 1:N on `payments`. Default `FULL_PAYMENT`. Checkout → `PENDING` → mock capture → `PAID` |
| Commission | Active rule default **5%**. Snapshot on PAID. Unique `paymentId` |
| Earnings | `GET /contractor/earnings` from **commission ledger** only |
| Review | Customer, `Order.COMPLETED` only. Unique `(orderId, customerId, targetUserId)` |
| Complaint | Parties only. 7-day window after `COMPLETED`. Admin PATCH |
| Analytics | `GET /admin/analytics` live aggregation, **60s** in-memory cache |

Legacy unique `payments.orderId` is dropped on connect (`ensurePaymentIndexes`). Existing GET `/orders/:id` still nests a single `payment` (first row).

---

## APIs (additive)

| Method | Path | Role |
| --- | --- | --- |
| POST | `/api/payments/:id/checkout` | CUSTOMER |
| POST | `/api/payments/:id/mock-success` | CUSTOMER, **dev only** |
| GET | `/api/payments/order/:orderId` | customer, contractor, admin |
| POST | `/api/admin/payments/:id/refund` | ADMIN |
| GET | `/api/contractor/earnings` | CONTRACTOR |
| GET | `/api/admin/settings/commission` | ADMIN |
| PATCH | `/api/admin/settings/commission` | ADMIN `{ percentage }` |
| POST | `/api/reviews` | CUSTOMER |
| GET | `/api/reviews/user/:id` | public |
| POST | `/api/complaints` | CUSTOMER CONTRACTOR |
| GET | `/api/complaints/my` | JWT |
| GET | `/api/admin/complaints` | ADMIN |
| PATCH | `/api/admin/complaints/:id` | ADMIN |
| GET | `/api/admin/analytics` | ADMIN |

Same paths exist under `/api/v1`.

---

## Business rules

1. Amount always from **order / payment row**, never from the client.
2. Customer can only checkout their own `customerId`.
3. `PAID` / `PENDING` cannot start a second checkout (409). Second `mock-success` is idempotent (same commission).
4. Commission created only on PAID. Changing the fee inserts a new `commissionrules` row; old `rateSnapshot` stays.
5. Reviews only when `COMPLETED`. Duplicate target → 409.
6. Complaints: must be order party; after `completedAt + 7d` → 409.
7. Analytics is ADMIN-only.

---

## Seed

`npm run seed` → `seed-sprint61.js`

Demo job: **Sprint 6.1 paid waterproofing demo** (`5.000.000đ`, PAID, 5% commission, 5★ review, OPEN complaint). Bathroom-leak order from Sprint 5 stays `UNPAID` for a live checkout demo.

---

## Tests

`cd backend && npm test` — Sprint 1–5.3 plus `sprint61-finance.test.js`.

## Next

Sprint **6.2 frontend**: Pay now, earnings, review modal, complaint form, admin analytics.
