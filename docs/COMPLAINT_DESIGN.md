# Complaint / dispute design (Sprint 6 lock)

Related: [SPRINT6_ARCHITECTURE.md](./SPRINT6_ARCHITECTURE.md), [ORDER_DESIGN.md](./ORDER_DESIGN.md) (`DISPUTED` reserved).

```
Party opens complaint
  → status OPEN
  → notify admin + accused
  → Admin PROCESSING
  → RESOLVED (with adminNote) | REJECTED
```

Complaints **do not auto-refund**. Refund is a separate ADMIN payment action. A complaint may **recommend** refund in `adminNote`.

---

## 1. Who may create

| Role | Condition |
| --- | --- |
| CUSTOMER | `order.customerId === me` |
| CONTRACTOR | `order.contractorId === me` |

**Against:** `againstUser` must be the other party on the same order (customer or contractor). Cannot file against ADMIN. Cannot file against yourself.

---

## 2. Window

| Order status | Open complaint? |
| --- | --- |
| Before customer acceptance | Yes while the job is still open |
| `CUSTOMER_ACCEPTED` | Yes if `now <= completedAt + 7 days` |
| `CANCELLED` | Yes if `now <= cancelledAt + 7 days` (deposit disputes) |
| Older than 7 days | **409** |

Multiple complaints per order: **allowed** (different reasons / different accused). Duplicate identical `{orderId, createdBy, againstUser, reason}` within 24h → 409 (simple spam guard).

---

## 3. State machine

```
OPEN ──admin──► PROCESSING ──admin──► RESOLVED
                         └──admin──► REJECTED
OPEN ──admin──► REJECTED (spam)
```

| Status | Meaning |
| --- | --- |
| `OPEN` | Awaiting admin |
| `PROCESSING` | Admin investigating (Sprint 5 name `IN_REVIEW` was never coded — **do not use IN_REVIEW**) |
| `RESOLVED` | Closed with remedy note |
| `REJECTED` | Dismissed |

Parties cannot self-close. No `CANCELLED` on complaints (opener cannot withdraw in 6.1 — keeps audit simple).

Optional: when status is OPEN or PROCESSING and order is not COMPLETED/CANCELLED, set `orders.status = DISPUTED` **only if** 6.1 state-machine tests remain green. Otherwise keep order status untouched in 6.1 and show a complaint badge in UI (safer). **Lock: prefer badge-first; DISPUTED is additive later in 6.1 if tests allow.**

---

## 4. Collection `complaints`

| Field | Type | Notes |
| --- | --- | --- |
| `orderId` | ObjectId → orders | |
| `createdBy` | ObjectId → users | opener |
| `createdByRole` | enum | `CUSTOMER` `CONTRACTOR` |
| `againstUser` | ObjectId → users | |
| `againstRole` | enum | `CUSTOMER` `CONTRACTOR` |
| `reason` | enum | `QUALITY` `DELAY` `CONDUCT` `PAYMENT` `SAFETY` `OTHER` |
| `description` | string 20–2000 | |
| `attachments[]` | string URL | max 6, `uploads/complaints/{userId}/` |
| `status` | enum | `OPEN` `PROCESSING` `RESOLVED` `REJECTED` |
| `adminId` | ObjectId? | last admin |
| `adminNote` | string 0–2000 | required when RESOLVED or REJECTED |
| `createdAt` `updatedAt` | Date | |

**Indexes:** `{ orderId: 1, createdAt: -1 }`; `{ status: 1, createdAt: -1 }`; `{ createdBy: 1, createdAt: -1 }`; `{ againstUser: 1, createdAt: -1 }`.

---

## 5. API

### POST `/api/complaints`

**Auth:** CUSTOMER | CONTRACTOR.  
**Request:** `{ orderId, againstUser, reason, description, attachments }`

### GET `/api/complaints/my`

**Auth:** same. Lists where `createdBy = me` OR `againstUser = me`.

### GET `/api/admin/complaints`

**Auth:** ADMIN. Query `status`, `orderId`.

### PATCH `/api/admin/complaints/:id`

**Auth:** ADMIN.  
**Request:** `{ "status": "PROCESSING" | "RESOLVED" | "REJECTED", "adminNote": "..." }`  
Notify opener + accused `COMPLAINT_UPDATED`. Audit.

Parties have **no** PATCH.

---

## 6. Edge cases

| Case | Rule |
| --- | --- |
| After 7 days | 409 |
| Many complaints one order | Allowed |
| Customer vs contractor | Allowed when both are parties on the order |
| Complaint as refund | Does not change payment; admin refunds separately |
| Against a stranger userId | 403 |
| Empty description | 422 |

---

## 7. Security

Admin-only resolution. Attachments use existing upload allow-list. IDOR on GET by id: opener, accused, or admin.
