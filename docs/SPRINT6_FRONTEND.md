# Sprint 6.2 — Business frontend

**Status:** implemented on Construction OS (navy / copper / paper). No live gateway, no RN.

Backend: [SPRINT6_BACKEND.md](./SPRINT6_BACKEND.md).

---

## Feature modules

```
frontend/src/features/
  payments/     checkout mock, status badge, realtime toasts
  reviews/      stars, form, modal, customer + contractor lists
  complaints/   form, timeline, customer + admin queue
  analytics/    contractor earnings + admin BI cards/bars
```

API calls live in `services/`. Pages do not call Axios directly.

---

## Routes

| Path | Role |
| --- | --- |
| `/customer/payment/:orderId` | CUSTOMER |
| `/customer/reviews` | CUSTOMER |
| `/customer/orders/:id/review` | CUSTOMER |
| `/customer/complaints` | CUSTOMER |
| `/customer/orders/:id/complaint` | CUSTOMER |
| `/contractor/earnings` | CONTRACTOR |
| `/contractor/reviews` | CONTRACTOR |
| `/admin/analytics` | ADMIN |
| `/admin/complaints` | ADMIN |
| `/admin/complaints/:id` | ADMIN |

---

## API mapping

| UI | Endpoint |
| --- | --- |
| Pay | `GET /payments/order/:orderId` → `POST /payments/:id/checkout` → `POST /payments/:id/mock-success` (dev) |
| Review | `POST /reviews`, `GET /reviews/user/:id` |
| Complaint | `POST /complaints`, `GET /complaints/my` |
| Admin complaint | `GET /admin/complaints`, `PATCH /admin/complaints/:id` |
| Earnings | `GET /contractor/earnings` + join `GET /orders/contractor` |
| Analytics | `GET /admin/analytics` |

i18n namespace `finance` (VI/EN). Status copy is never raw enums.

---

## Demo flow

Seed: `cd backend && npm run seed`. Web: `npm run dev`.

1. **Customer** `oscar.d@example.net` / `Demo@1234`  
   - Unpaid bathroom-leak order → **Thanh toán thử nghiệm** (dev auto mock-success).  
   - Completed seed job `BM-…-F70AEA` → Review + optional complaint.
2. **Contractor** `paula.r@example.org` → **Thu nhập** (ledger, not gross-as-revenue) + **Uy tín**.
3. **Admin** `ivan.p@example.net` → **Báo cáo** analytics + **Khiếu nại** Process / Resolve.

Toast: `notification:new` types `PAYMENT_SUCCESS`, `NEW_REVIEW`, `NEW_COMPLAINT`, `COMPLAINT_UPDATED`.

---

## Out of scope

Live MoMo/Stripe, payout, React Native.
