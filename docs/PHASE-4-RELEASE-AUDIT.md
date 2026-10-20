# BuildMate Phase 4 — Admin finance, policies, release audit

Date: 2026-10-15  
Classification: **READY FOR DEMO**  
Not classified: READY FOR REAL PAYMENT  
Not classified: NOT READY for a thesis mock demo (admin + mock escrow UI is in source)

Highest priority observed: financial identities, RBAC, no BuilMate writes, no double spend in the in-memory machine.

## 1. Payment architecture

BuildMate is a coordinator, not a bank.

- **Contractor repair:** customer pays a **15% mock deposit**. BuildMate holds 15%. Platform fee is **5% of quote total**. Contractor hold is **10%**. Remaining **85%** is paid directly to the contractor. Mock payout of 10% and posting of 5% happen only after acceptance, 85% reconciliation, no dispute, and admin settle.
- **Material store:** free platform. No deposit, commission, monthly fee, or escrow. COD / direct. GMV is not fee revenue.
- **Gateway:** `MockPaymentProvider` only. PAID/HELD/RELEASED/REFUNDED are demo ledger states.

Runtime still dual-writes: `payments.metadata` always; dedicated escrow tables only if they exist. Dedicated SQL is prepared and **has not been applied on BuilMate**.

## 2. Contractor flow

1. RepairRequest + ChatRoom  
2. Quotation  
3. Accept quote → ServiceOrder + Payment DEPOSIT 15% UNPAID + finance snapshot  
4. Customer accepts deposit terms (`CONTRACTOR_DEPOSIT_TERMS_V2_DRAFT`)  
5. Mock checkout → HELD  
6. Work after HELD  
7. Complete → customer acceptance  
8. Confirm 85% off-platform  
9. Admin mock payout 10% + post 5% once  

## 3. Material store flow

Cart → PENDING_CONFIRMATION → store fulfill → deliver → receive → COD confirm. No escrow. Legacy 15% material deposits stay historical.

## 4. Escrow / refund / payout state machine

```
NOT_FUNDED → HELD | CANCELLED_SETTLED
HELD → FROZEN | RELEASE_PENDING | REFUND_PENDING
FROZEN → REFUND_PENDING | RELEASE_PENDING | CANCELLED_SETTLED | FROZEN
RELEASE_PENDING → RELEASED | FROZEN | REFUND_PENDING
REFUND_PENDING → REFUNDED | FROZEN
RELEASED, REFUNDED, CANCELLED_SETTLED terminal
```

Customer cancel after deposit freezes funds. Proposed 5%/10% split after a valid forfeit is **PENDING_ADVISOR_CONFIRMATION** and is **not** auto-posted.

## 5. Finance ERD (prepared, not on BuilMate)

`payments` (metadata dual-write)  
`service_order_escrows` 1:1 payment / order  
`contractor_payouts` unique escrow_id  
`escrow_refunds` unique escrow_id  
`escrow_ledger` unique idempotency_key  
`escrow_cancellations` unique escrow_id  
`commissions` unique payment_id  

SQL: `backend/scripts/sql/2026-contractor-escrow-material-free.sql` (NOT RUN on BuilMate).

## 6. APIs (finance)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/payments/:id/checkout` | DEPOSIT requires `termsAccepted` |
| POST | `/api/payments/:id/mock-success` | Mock capture → HELD |
| GET | `/api/payments/order/:orderId` | Party/admin |
| POST | `/api/orders/:id/remaining-received` | Confirm 85% |
| POST | `/api/orders/:id/settle-escrow` | ADMIN |
| POST | `/api/admin/orders/:id/escrow/settle` | ADMIN mock payout |
| POST | `/api/admin/orders/:id/escrow/refund` | ADMIN mock refund |
| GET | `/api/admin/finance/summary` | Ledger A–J |
| GET | `/api/admin/finance/escrow` | Register + action flags |
| GET | `/api/admin/analytics` | Includes ledger; revenue = posted 5% |

## 7. RBAC

- Customer/contractor cannot settle escrow (`requireAdmin` + route `allowRole('ADMIN')`).
- Customer-only checkout.
- Party-only order/payment read.
- Store has no contractor escrow APIs.
- Buttons in admin follow backend `canPayout` / `canRefund`; backend still enforces CAS.

## 8. Formula and example (10.000.000 VND)

- Deposit 1.500.000  
- Platform fee 500.000  
- Contractor hold 1.000.000  
- Direct remaining 8.500.000  
- Contractor earning 9.500.000  

`deposit = fee + hold`  
`total = deposit + remaining`  
`earning = remaining + hold`  
Revenue ≠ captured deposit. Material 2.100.000 GMV → fee 0.

## 9. Tests with evidence

| Suite | Ran? | Result |
|---|---|---|
| `npm run test:unit` | Yes (this phase) | See command output in session |
| Extra in-memory material/finance | Phase 3 | 58/58 then; ledger/terms added now |
| Integration | No | Isolation gate exit 1 — no `TEST_DATABASE_URL` |
| Browser E2E | No | Would require isolated API |
| Legacy SQL inventory | No | Script refuses BuilMate |

Do not treat code review as PASS for HTTP/E2E.

## 10. Remaining issues

- No isolated PostgreSQL `BuilMate_test`  
- Escrow tables not applied  
- Prisma fragment not merged  
- Existing HTTP tests (`sprint61-finance`, `e2e-workflow`) still encode older commission-on-deposit / progress-before-hold behaviour  
- Live `policies` table not overwritten (by design); drafts are files only  
- Customer-cancel 5/10 split awaits advisor confirmation  
- No real PSP, reconciliation, or legal sign-off  

## 11. Mock payment

All deposit capture, hold, payout, refund, and commission posting in this thesis path are **mock**. UI copy says so. Admin toasts say so.

## 12. Future real integration

- Licensed payment gateway + webhook idempotency  
- Bank payout / refund files and ops runbooks  
- Published policies after legal review  
- Apply escrow SQL on a dedicated production schema with dual-write cutover  
- Isolated automated integration + browser E2E  

## Policy drafts

See `docs/policies/drafts/`. Version `2.0-DRAFT`. **Not published.**

## Legacy

Script: `backend/scripts/report-legacy-finance.js` (TEST_DATABASE_URL only). FULL_PAYMENT, legacy material deposits, and old MaterialCommission rows must be handled manually. Do not zero them.

## Release verdict

**READY FOR DEMO** — mock contractor escrow + free material store, with admin ledger A–J and gated mock payout/refund.

**NOT READY FOR REAL PAYMENT** — no real gateway, no ops reconciliation, no published legally reviewed policy, no isolated production-grade test proof of races on PostgreSQL.
