# Payment design (Sprint 6 lock)

Related: [SPRINT6_ARCHITECTURE.md](./SPRINT6_ARCHITECTURE.md).

Existing runtime: one `payments` document per order, `status: UNPAID`, **unique `orderId`**. Sprint 6 **drops that unique index** and treats the row as the first transaction (`FULL_PAYMENT` after backfill).

---

## 1. Business answers

| Question | Lock |
| --- | --- |
| When is Payment created? | **At quote accept** (already). Sprint 6 never `POST /payments` from the client. Optional split inserts a second `FINAL_PAYMENT` row; it does not delete the first. |
| Who pays? | **CUSTOMER** of that order. |
| Who receives money? | **BuildMate** (platform capture). Contractor sees earning via `commissions`, not a bank credit. |
| When is payment allowed? | See §4. Never on `CANCELLED`. Never if the transaction is already `PAID`/`REFUNDED`. |

```
Order (CONFIRMED+)
  → Payment row(s) UNPAID
  → Customer checkout
  → PENDING (await provider)
  → PAID  → Commission snapshot → contractor ledger
      ↘ FAILED (row retryable)
  PAID → REFUNDED (admin) → commission REVERSED
```

---

## 2. State machine

```
UNPAID ──checkout──► PENDING ──webhook success──► PAID ──admin refund──► REFUNDED
                         │
                         └──webhook / timeout fail──► FAILED ──retry checkout──► PENDING
UNPAID ──(no charge)──► stays UNPAID
```

| Status | Meaning | Who sets it |
| --- | --- | --- |
| `UNPAID` | Obligation exists; no capture | Factory (Sprint 5) |
| `PENDING` | Checkout session open | `POST /payments/:id/checkout` |
| `PAID` | Funds captured (or mock success / COD recorded) | Webhook or admin confirm for `BANK_TRANSFER`/`COD` |
| `FAILED` | Provider declined or expired session | Webhook / timeout job |
| `REFUNDED` | Capture reversed | ADMIN only |

**Order rollup** `orders.paymentStatus` (additive `PENDING`):

| Transactions | Rollup |
| --- | --- |
| All UNPAID (none PAID) | `UNPAID` |
| Any PENDING, none PAID yet | `PENDING` |
| `paidAmount >= order.amount` (within 1 VND) | `PAID` |
| Any FAILED and remaining > 0, no PENDING | `FAILED` if none PAID; else stay `PENDING`/`UNPAID` mix — if any PAID but remaining > 0: **`PENDING` is wrong**; use **`UNPAID`** for remaining (partial). |
| All PAID then refunded | `REFUNDED` |

**Partial pay lock:** after DEPOSIT `PAID` and FINAL still `UNPAID`, rollup = **`UNPAID`** (remaining due) **plus** API field `paidAmount`. Do **not** invent `PARTIALLY_PAID` on `orders.paymentStatus` in 6.1 (would break existing enum consumers). Expose `paidAmount` / `remainingAmount` on the rollup object only.

---

## 3. Payment types

| Type | When | Amount |
| --- | --- | --- |
| `FULL_PAYMENT` | **Default.** One row = `order.amount`. Backfill for every Sprint 5 placeholder. | 100% |
| `DEPOSIT` | Only if admin/order policy `splitPayments === true` (default **false**) | Default **30%**, from active `commissionrules.depositPercent` (separate from fee %, default 30) |
| `FINAL_PAYMENT` | Companion of DEPOSIT | Remainder so DEPOSIT+FINAL = `order.amount` |

**Exclusive:** an order has **either** one `FULL_PAYMENT` **or** (`DEPOSIT` + `FINAL_PAYMENT`). Never mix FULL with split. Unique partial index: `{ orderId: 1, type: 1 }`.

`FINAL_PAYMENT` checkout is allowed when the order is `COMPLETED` or `CUSTOMER_ACCEPTED`. `DEPOSIT` moves the job to `DEPOSIT_PAID` when the current status is still before that step. `CANCELLED` cannot be paid.

---

## 4. When checkout is legal

| Type | Allowed order.status | Actor |
| --- | --- | --- |
| `FULL_PAYMENT` / `DEPOSIT` | `QUOTATION_ACCEPTED` through `CUSTOMER_ACCEPTED` | CUSTOMER |
| `FINAL_PAYMENT` | `COMPLETED` `CUSTOMER_ACCEPTED` | CUSTOMER |
| Any | `CANCELLED` | **403/409** |
| Any | `DISPUTED` (if enum shipped) | **409** hold |

Client **cannot** send `amount`. Server charges `payment.amount`.

Work can start after `QUOTATION_ACCEPTED` even if the deposit is still unpaid. A paid `DEPOSIT` still advances the status to `DEPOSIT_PAID` when that step has not been passed.

---

## 5. Collection `payments` (extended)

Additive fields; keep `orderId`, `amount`, `status`, timestamps.

| Field | Type | Rel | Notes |
| --- | --- | --- | --- |
| `_id` | ObjectId | | |
| `orderId` | ObjectId | → orders | **not unique** |
| `customerId` | ObjectId | → users | denormalized |
| `contractorId` | ObjectId | → users | denormalized |
| `type` | enum | | `FULL_PAYMENT` `DEPOSIT` `FINAL_PAYMENT` |
| `amount` | number | | VND integer |
| `currency` | string | | `'VND'` |
| `status` | enum | | `UNPAID` `PENDING` `PAID` `FAILED` `REFUNDED` |
| `method` | enum | | `MOCK` `COD` `BANK_TRANSFER` `GATEWAY` |
| `provider` | string | | `'mock'` until a real adapter |
| `providerRef` | string | | session / mock id |
| `idempotencyKey` | string | | unique sparse |
| `paidAt` `failedAt` `refundedAt` | Date? | | |
| `failureReason` | string | | |
| `createdAt` `updatedAt` | Date | | |

**Indexes**

| Key | Type |
| --- | --- |
| `{ orderId: 1, type: 1 }` | unique |
| `{ orderId: 1, createdAt: 1 }` | list |
| `{ customerId: 1, status: 1 }` | inbox |
| `{ status: 1, createdAt: -1 }` | admin |
| `{ idempotencyKey: 1 }` | unique sparse |
| `{ providerRef: 1 }` | sparse |

---

## 6. Provider

```
PaymentProvider.checkout(payment) → { redirectUrl? , providerRef }
PaymentProvider.parseWebhook(headers, body) → { providerRef, success, raw }
```

Sprint 6.1 ships **MockProvider**: checkout immediately returns a `providerRef`; webhook endpoint `POST /api/payments/webhook` with shared secret marks PAID. Demo button “Simulate success” hits the same service as the webhook (server-side), never toggles PAID from the SPA alone without auth.

`COD` / `BANK_TRANSFER`: stay `PENDING` until **ADMIN** `POST /admin/payments/:id/confirm`.

---

## 7. API

### GET `/api/orders/:id/payments`

**Auth:** order party.  
**Response `data`:**

```json
{
  "summary": {
    "status": "UNPAID",
    "amount": 4210000,
    "paidAmount": 0,
    "remainingAmount": 4210000
  },
  "items": [{ "id": "...", "type": "FULL_PAYMENT", "amount": 4210000, "status": "UNPAID" }]
}
```

`GET /api/orders/:id` keeps `payment: { id, status, amount }` = summary mapped to the **open** transaction id (or last PAID). Additive `payments` array optional.

### POST `/api/payments/:id/checkout`

**Auth:** CUSTOMER.  
**Request:** `{ "method": "MOCK" | "COD" | "BANK_TRANSFER" }`  
Header `Idempotency-Key` recommended.  
**Response:** `{ payment, checkout: { providerRef, redirectUrl } }`  
UNPAID|FAILED → PENDING.

### POST `/api/payments/webhook`

**Auth:** HMAC header, not JWT.  
Marks PAID or FAILED; creates commission on PAID.

### POST `/api/admin/payments/:id/refund`

**Auth:** ADMIN. PAID only.  
**Request:** `{ "reason": "string" }`

### POST `/api/admin/payments/:id/confirm`

**Auth:** ADMIN. COD / BANK_TRANSFER PENDING → PAID.

---

## 8. Edge cases

| Case | Rule |
| --- | --- |
| Double checkout | Same `idempotencyKey` → same PENDING session. Different key while PENDING → 409 |
| Double webhook | `providerRef` already PAID → 200 no second commission |
| FAILED retry | Status FAILED → checkout allowed → PENDING |
| Refund after commission | Commission `REVERSED`; contractorAmount not counted in analytics `earning` |
| Pay after CANCELLED | 409 |
| Amount tampering | Ignored |
| Two FULL_PAYMENT rows | Unique `(orderId, type)` prevents |

---

## 9. Notifications / sockets

On PAID: notify contractor `PAYMENT_PAID`; emit `payment_paid` to customer + contractor rooms.  
On FAILED: notify customer `PAYMENT_FAILED`.
