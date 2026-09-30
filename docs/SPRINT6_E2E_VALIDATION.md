# Sprint 6.3 — E2E validation

**Goal:** prove Sprint 1–6.2 still works. No new product features.

Suite: `backend/src/tests/sprint63-validation.test.js` plus existing `sprint61-finance`, `e2e-workflow`, `rbac`.

Run: `cd backend && npm test` (`--test-concurrency=1`).

---

## 1. Full business flow (HTTP)

Login → nearby contractors → chat rooms → accept quotation → checkout MOCK → mock-success → contractor progress STARTED…COMPLETED → customer complete → review → complaint → contractor earnings → admin analytics + payment rollup → OPEN → PROCESSING → RESOLVED.

## 2. Finance integrity

| Case | Result |
| --- | --- |
| Checkout twice | Second **409**, one payment row |
| mock-success twice | Second `{ duplicated: true }`, one PAID, one commission |
| Admin refund | PAID → REFUNDED, commission POSTED → REVERSED, earnings exclude it |
| Second refund | **409** |
| Fee 5% then 8% | Old snapshot stays 5 (`sprint61-finance`) |

## 3. Order vs payment (locked rule)

**Customer may COMPLETE while payment is UNPAID.**

Handover = site acceptance (Sprint 5). Money = ledger (Sprint 6). Commission exists only after **PAID**. COD / pay-after-work is valid for the thesis demo.

Frontend: complete modal shows `orders.complete.unpaidHint` when not PAID.

## 4. Reviews

| Case | HTTP |
| --- | --- |
| Customer + COMPLETED | 201 |
| Unfinished order | 409 |
| Duplicate same party | 409 |
| Stranger | 403 |
| `GET /reviews/user/:id` average | matches ratings |

## 5. Complaints

| Case | HTTP |
| --- | --- |
| Party on order | 201 |
| Stranger | 403 |
| >7 days after COMPLETED | 409 |
| OPEN → RESOLVED (skip PROCESSING) | **409** (fixed 6.3) |
| OPEN → PROCESSING → RESOLVED + note | 200 |

## 6. RBAC (additive)

Customer: no admin analytics, complaints queue, refund, contractor catalog.  
Stranger: no `GET /payments/order/:id`.  
Garbage JWT: **401**.  
Admin: analytics, audit-logs, payment rollup.  
`/api/v1/health` still **200**.

## 7. Frontend

Protected routes by role (`ProtectedRoute`). Unknown path → `NotFoundPage`.  
Query screens: skeleton / empty / error+retry / toast.  
Sockets: `OrderRealtimeListener` + `FinanceRealtimeListener` unsubscribe on unmount.  
Lazy route chunks (Leaflet + dashboards) behind `Suspense`.

---

Sprint 6 **closed for product scope**. Next: RN client, live gateway, payout — [FUTURE_SPRINTS.md](./FUTURE_SPRINTS.md).
