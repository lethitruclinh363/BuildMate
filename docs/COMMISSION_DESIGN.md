# Commission design (Sprint 6 lock)

Related: [PAYMENT_DESIGN.md](./PAYMENT_DESIGN.md), [SPRINT6_ARCHITECTURE.md](./SPRINT6_ARCHITECTURE.md).

BuildMate takes a **platform fee** from each **PAID** payment. The contractor’s earning is the remainder. **No bank payout** in Sprint 6 — this is an accounting ledger for the thesis and admin dashboard.

```
Customer PAID payment
  → read active CommissionRule.percentage
  → platformAmount = roundVnd(payment.amount * percentage / 100)
  → contractorAmount = payment.amount - platformAmount
  → insert commissions (immutable snapshot)
```

Rounding: **half-up to integer VND**. `platformAmount + contractorAmount === payment.amount` always.

---

## 1. Default rule

| Key | Value |
| --- | --- |
| Platform fee | **5%** |
| Stored in | `commissionrules` not env-only |
| Who changes it | ADMIN via `PATCH /admin/settings/commission` |
| Effect | **Future PAID payments only** |

Inserting a new rule sets `isActive: true` and sets the previous active row `isActive: false`. Never update `percentage` in place on a row that may already be referenced.

---

## 2. Collection `commissionrules`

| Field | Type | Notes |
| --- | --- | --- |
| `percentage` | number | 0–30 inclusive (guardrail) |
| `depositPercent` | number | 10–90, default 30 (used only if split enabled) |
| `isActive` | boolean | at most one true |
| `effectiveFrom` | Date | |
| `createdBy` | ObjectId → users | ADMIN |
| `note` | string | |
| `createdAt` `updatedAt` | Date | |

Index: `{ isActive: 1 }`.

Seed: one row `percentage: 5`, `depositPercent: 30`, `isActive: true`.

---

## 3. Collection `commissions`

| Field | Type | Rel | Notes |
| --- | --- | --- | --- |
| `paymentId` | ObjectId unique | → payments | **1:1 with PAID payment** |
| `orderId` | ObjectId | → orders | |
| `contractorId` | ObjectId | → users | |
| `customerId` | ObjectId | → users | denormalized |
| `ruleId` | ObjectId | → commissionrules | snapshot source |
| `percentage` | number | | copied at PAID time |
| `grossAmount` | number | | = payment.amount |
| `platformAmount` | number | | fee |
| `contractorAmount` | number | | earning |
| `status` | enum | | `POSTED` `REVERSED` |
| `createdAt` `updatedAt` | Date | | |

**Indexes:** unique `paymentId`; `{ contractorId: 1, createdAt: -1 }`; `{ orderId: 1 }`; `{ status: 1, createdAt: -1 }`.

Created **only** in the PAID transaction. Deleted **never**. Refund → `REVERSED` (same row).

There is **no** commission on UNPAID / PENDING / FAILED.

Deposit and Final each get their **own** commission row when each is PAID (5% of that transaction, not 5% of the order twice incorrectly — each slice once).

---

## 4. Status

| Status | Meaning |
| --- | --- |
| `POSTED` | Counts toward platform revenue and contractor earning |
| `REVERSED` | Refund; excluded from “earning” totals |

Sprint 7 may add `PAID_OUT` when real disbursement exists. Do not add it now.

---

## 5. API

### GET `/api/contractor/earnings`

**Auth:** CONTRACTOR.  
**Response:** `{ totals: { posted, reversed }, items: CommissionPublic[] }`  
Only `contractorId = me`.

### GET `/api/admin/commissions`

**Auth:** ADMIN. Query: `contractorId`, `from`, `to`, `status`.

### GET `/api/admin/settings/commission`

**Auth:** ADMIN. Active rule.

### PATCH `/api/admin/settings/commission`

**Auth:** ADMIN.  
**Request:** `{ "percentage": 6, "depositPercent": 30, "note": "Q3" }`  
Inserts a new active rule. Audit `FEE_CHANGED`.

**Forbidden:** contractor PATCH; changing historical `commissions.percentage`.

---

## 6. Edge cases

| Case | Rule |
| --- | --- |
| Fee 5 → 8 | New PAID uses 8; old `POSTED` stay 5 |
| Double PAID webhook | Unique `paymentId` → no second commission |
| Refund | `REVERSED`; analytics earning uses `POSTED` only |
| percentage 100 | Reject > 30 |
| Split payments | Two commission rows, 5% each slice |

---

## 7. Security

Only the order-payment success path (service, not a public POST) creates commissions. Admin reads all; contractor reads own. Amounts are server-computed.
