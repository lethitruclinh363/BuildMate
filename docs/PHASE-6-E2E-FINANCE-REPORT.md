# PHASE 6 — Real browser E2E and financial integration audit

Date: 2026-10-15  
Gate: isolated PostgreSQL test required  
Result: **BLOCKED** — no writes, no browser login, no mock capture against shared database `BuilMate`

Classification:

- **NOT READY** to claim contractor → mock payout E2E
- **NOT READY** to claim material COD E2E
- **NOT READY FOR REAL PAYMENT**
- Phase 4 source still reads as **READY FOR DEMO of mock UI**, but Phase 6 did **not** prove that in a browser

This report does not treat source reading or unit tests as browser evidence.

## Gate (re-probed this session)

| Check | Result |
| --- | --- |
| OS | Windows 10.0.26200 |
| Docker / Podman | Not installed |
| Local PostgreSQL | `postgresql-x64-18` Running on `:5432` |
| Test compose port `127.0.0.1:55432` | Not listening |
| `backend/.env.test` | Missing |
| `TEST_DATABASE_URL` | Unset |
| `psql` | Missing from PATH |
| Prisma validate (dummy localhost URL, Phase 5) | PASS |
| Finance SQL applied | No database |
| Fixtures `@buildmate.test` | Cannot insert (guard) |
| External payment | Mock routes exist; not exercised |
| Email during tests | Preload clears SMTP; integration never started |

`npm run test:integration` fail-fast:

```
Integration tests require TEST_DATABASE_URL pointing at a PostgreSQL database other than BuilMate.
Refusing to fall back to DATABASE_URL or PGDATABASE.
```

Browser tools were not used against the running app. Login / create request / checkout would hit the team API and `BuilMate`.

To unblock, install Docker Desktop **or** put the local PostgreSQL 18 superuser password in gitignored `backend/.env.test.admin`, then:

```
npm run test:db:up --prefix backend
npm run test:db:bootstrap --prefix backend
npm test --prefix backend
```

Do not point `TEST_DATABASE_URL` at `BuilMate`.

---

## Per-test results

Status vocabulary: **PASS** = executed against isolated test DB and/or real browser as specified. **FAIL** = executed and wrong. **BLOCKED** = gate failed, not executed. **NOT RUN** = skipped for another reason.

### P6-T01 Repair request (Customer → Contractor)

| Field | Value |
| --- | --- |
| Scenario | Customer login → contractor list → profile → service → problem + address + images → submit. RepairRequest + ChatRoom created once. Customer lands in chat. Contractor sees request, content, location. Double-click does not duplicate. |
| Expected | One request, one room, notification, no duplicate on double submit |
| Actual | Not executed |
| Status | **BLOCKED** |
| API response | None |
| Database | Not queried |
| Browser | Not run |
| Prepared coverage | Pages exist: `/login`, `/explore`, `/contractors/:id`, `/customer/request/create`, `/customer/chat/:roomId`, `/contractor/requests`. HTTP suites `e2e-workflow.test.js` / request tests need isolated DB. |
| Failure cause | No `TEST_DATABASE_URL` / Docker |

### P6-T02 Chat and quotation

| Field | Value |
| --- | --- |
| Scenario | Contractor chats, sends labor+material quote. Customer sees quote and payment terms, accepts once. Concurrent accept does not create two ServiceOrders. |
| Expected | One ServiceOrder + DEPOSIT payment UNPAID |
| Actual | Not executed |
| Status | **BLOCKED** |
| API response | None |
| Database | Not queried |
| Browser | Not run |
| Prepared coverage | `/contractor/quotation/create/:requestId`, `/customer/quotation/:id`. `edge-orders.test.js` accepts twice → one order (HTTP, needs test DB). `quotationService` short-circuits second accept when already ACCEPTED. |
| Failure cause | Gate |

### P6-T03 Deposit 15% (quote 10_000_000)

| Field | Value |
| --- | --- |
| Scenario | Deposit 1_500_000, fee 500_000, hold 1_000_000, remaining 8_500_000. Payment DEPOSIT. No STARTED before hold. Terms required. Mock capture → Escrow HELD. Refresh keeps state. Admin sees held funds. Deposit is not platform revenue. |
| Expected | Identities hold; HELD after mock capture; 409 without terms; STARTED blocked until HELD |
| Actual | Unit snapshot PASS. HTTP/browser/DB **not** executed |
| Status | **BLOCKED** for E2E. Unit-only: identities and terms guard PASS |
| API response | None in this phase |
| Database | Not queried |
| Browser | Payment page has terms checkbox (`PaymentPage`) gating CTA; not clicked |
| Prepared coverage | `contractor-finance.test.js` split 15/5/10/85; `escrow-postgres.test.js` 10M path; sprint61/63 checkout + `depositCheckoutBody()` |
| Failure cause | Gate |

### P6-T04 Progress and acceptance

| Field | Value |
| --- | --- |
| Scenario | Contractor STARTED after deposit → progress → complete → customer accept → confirm 85% off-platform → eligible for settle |
| Expected | Cannot skip unpaid deposit; remaining-received required for payout |
| Actual | Not executed |
| Status | **BLOCKED** |
| API response | None |
| Database | Not queried |
| Browser | Customer/contractor order pages call `POST /orders/:id/remaining-received`; not clicked |
| Risk if DB appears | `e2e-workflow.test.js` and `rbac.test.js` still call STARTED immediately after accept (no mock capture). `progressService` now requires escrow HELD. Those HTTP tests will likely **FAIL** until patched. |
| Failure cause | Gate |

### P6-T05 Admin mock payout

| Field | Value |
| --- | --- |
| Scenario | Admin escrow, `canPayout`, mock payout 10%, commission 5% POSTED, ledger, analytics. Second payout refused. |
| Expected | One payout; fee posted once; deposit not counted as revenue |
| Actual | Unit machine: second `releaseEscrow` refused. HTTP settle **not** executed |
| Status | **BLOCKED** for E2E |
| API response | None |
| Database | Ledger tables not applied |
| Browser | Admin `/escrow`, `/analytics`, `/payments` exist; not opened |
| Prepared coverage | `escrow-postgres.test.js` settle + 409 second settle; admin `GET /admin/finance/summary` |
| Failure cause | Gate |

### P6-T06 Cancel and refund A–E

| Case | Expected | Actual | Status |
| --- | --- | --- | --- |
| A unpaid customer cancel | Close escrow, no money movement | Unit PASS (`cancelWithoutFunding`) | E2E **BLOCKED** |
| B customer cancel after deposit | Freeze; no auto 5/10 split (PENDING_ADVISOR_CONFIRMATION) | Unit PASS (`holdCustomerCancel`) | E2E **BLOCKED** |
| C contractor cancel after deposit | Mock refund full 15% once | Unit PASS; HTTP refund path written | E2E **BLOCKED** |
| D mutual cancel | Refund ≤ held balance | Unit PASS | E2E **BLOCKED** |
| E dispute | FROZEN; no payout | Unit PASS | E2E **BLOCKED** |

No double refund / no payout+refund overdraw: unit sequential PASS; concurrent HTTP in `escrow-postgres.test.js` **not run**.

API/DB/browser: none this phase.

### P6-T07 Material purchase

| Field | Value |
| --- | --- |
| Scenario | Store → cart → address → shipping → confirm. Order PENDING_CONFIRMATION. No deposit step. Store notified. |
| Expected | No checkout DEPOSIT |
| Actual | Not executed |
| Status | **BLOCKED** |
| Browser | `/cart`, `/material-checkout`, `/stores/:id` exist; not used |
| Prepared coverage | `snapshotMaterialFree`, `evaluateDepositCheckout` rejects free-policy deposit |
| Failure cause | Gate |

### P6-T08 Delivery / COD

| Field | Value |
| --- | --- |
| Scenario | CONFIRMED → PREPARING → READY_FOR_DELIVERY → DELIVERING → DELIVERED → CUSTOMER_RECEIVED → store COD → COMPLETED. Illegal jumps 409. |
| Expected | Transition table in `material-order.rules.js` |
| Actual | Pure unit `material-order-management.test.js` PASS for transition helpers. **Not** in `npm run test:unit` (lives under `src/tests/*.test.js`, blocked by integration gate). HTTP/browser **not** run |
| Status | **BLOCKED** for E2E |
| Failure cause | Gate |

### P6-T09 Material money (2_000_000 + ship 100_000)

| Field | Value |
| --- | --- |
| Scenario | Total 2_100_000, deposit 0, fee 0, no MaterialCommission, no escrow, COD 2_100_000, GMV not BuildMate revenue |
| Expected | `MATERIAL_V2_FREE` |
| Actual | Unit PASS (`snapshotMaterialFree`, ledger `materialGmv` separate from `platformFeePosted`) |
| Status | **BLOCKED** for HTTP/DB/browser |
| API/DB/browser | None |
| Failure cause | Gate |

### P6-T10 Admin Finance KPIs A–J

Mapped from `emptyLedger()` / `addDepositRow()`:

| KPI | Field | E2E |
| --- | --- | --- |
| A accepted quote total | `acceptedQuoteTotal` | BLOCKED |
| B deposit captured | `capturedDeposit` | BLOCKED |
| C escrow held | `heldAmount` | BLOCKED |
| D frozen | `disputedAmount` | BLOCKED |
| E refund pending | `refundPendingAmount` | BLOCKED |
| F refund completed | `refundedAmount` | BLOCKED |
| G payout pending | `payoutPendingAmount` | BLOCKED |
| H payout completed | `paidOutAmount` | BLOCKED |
| I commission POSTED | `platformFeePosted` | BLOCKED |
| J material GMV | `materialGmv` | BLOCKED |

Unit: deposit captured ≠ posted fee on a 10M held row. Before/after payout on live DB: **not measured**. Admin `/escrow` UI: **not opened**.

### P6-T11 RBAC

| Call | Expected | Actual | Status |
| --- | --- | --- | --- |
| Customer settle-escrow | 403 | Not called | BLOCKED |
| Contractor admin APIs | 403 | Not called | BLOCKED |
| Store reads contractor finance | 403 | Not called | BLOCKED |
| Customer A reads B payment | 403 | Not called | BLOCKED |
| Contractor A reads B order | 403 | Not called | BLOCKED |
| Anonymous payment API | 401 | Not called | BLOCKED |

Prepared: `sprint63-validation.test.js` RBAC HTTP, `rbac.test.js`, source-scan in `contractor-finance.test.js`. `requireAdmin` on settle/refund.

### P6-T12 Race on real PostgreSQL

| Race | Status |
| --- | --- |
| Two captures | BLOCKED (`mock-success` idempotent test not run) |
| Two payouts | BLOCKED |
| Two refunds | BLOCKED |
| Refund + payout concurrent | BLOCKED (`escrow-postgres.test.js`) |
| Cancel + settle concurrent | BLOCKED |
| Two quote accepts | BLOCKED (`edge-orders.test.js`) |

Unit sequential double-spend PASS is **not** a real Postgres race.

### P6-UI Browser surfaces

| Surface | Page exists in source | Browser this phase |
| --- | --- | --- |
| Customer | dashboard, explore, request, chat, quotation, orders, payment, material checkout | **NOT RUN** |
| Contractor dashboard | dashboard, requests, orders, earnings, chat | **NOT RUN** |
| Material store | dashboard, products, orders, earnings | **NOT RUN** |
| Admin | dashboard, escrow, payments, analytics, audit, notifications | **NOT RUN** |
| Chat / notification | ChatPage, NotificationsPage, admin NotificationCenter | **NOT RUN** |
| Payment / refund / payout | PaymentPage, remaining-received buttons, admin EscrowPage | **NOT RUN** |
| VI/EN | `useI18n` on those pages | **NOT RUN** |
| Mobile/desktop | Not resized | **NOT RUN** |
| Refresh / logout / login | Not exercised | **NOT RUN** |

Status: **BLOCKED**. No screenshots.

### P6-LEGACY

| Fixture | Expected | Actual | Status |
| --- | --- | --- | --- |
| Contractor FULL_PAYMENT | Keep old path; no 15/5/10 rewrite | No fake FULL_PAYMENT inserted | **NOT RUN** |
| Material PENDING_PAYMENT | Stay historical | No fake row | **NOT RUN** |
| Material DEPOSIT_PAID + MaterialCommission | Stay historical | Unit identifies `MATERIAL_V1_DEPOSIT` snapshot only | **BLOCKED** / unit-only |
| Old vs new policy | No conversion | `report-legacy-finance.js` **not** executed (would need a DB; must not use BuilMate) | **NOT RUN** |

No production rows were copied or deleted.

---

## Totals

1. **Unit tests:** 36 PASS / 0 FAIL (`npm run test:unit`, re-run this session).
2. **Integration tests:** 0 executed. Fail-fast before 49 files under `backend/src/tests/*.test.js`.
3. **Browser E2E tests:** 0 executed.
4. **PASS / FAIL / BLOCKED:** 36 unit PASS. 0 FAIL from executed E2E. P6-T01…T12, P6-UI, P6-LEGACY = **BLOCKED** or **NOT RUN**.
5. **Bugs fixed this phase:** none (gate failed; no BuilMate writes; no feature work).
6. **Bugs still open / risks:**
   - No isolated test database (blocker).
   - Escrow SQL not applied anywhere.
   - `e2e-workflow.test.js` / `rbac.test.js` likely stale vs HELD-before-STARTED.
   - Dual-write: BuilMate still metadata-only; tables not source of truth until test SQL runs.
   - `material-order-management.test.js` not in `test:unit`, so it never runs while integration is gated.
7. **Financial impact:** Cannot certify captured deposit, escrow, payout, refund, or material GMV on a real ledger. Unit identities still say deposit is not platform revenue and material 2_100_000 is not a fee. That is **not** a live proof.
8. **Demo readiness:** Mock UI and APIs exist in source. Phase 6 **did not** demonstrate them with real actors in a browser on an isolated database. Do not treat this phase as a completed E2E sign-off.

## What was deliberately not done

- No `prisma db push` / finance SQL on `BuilMate`
- No seed/copy of personal or live transactions
- No real payment provider
- No browser login against the team API
- No Playwright/Cypress suite pointed at production

## Evidence commands (this session)

```
npm run test:unit          → 36 pass
npm run test:integration   → exit 1, isolation error
```

Docker still missing; `.env.test` still missing.
