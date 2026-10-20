# PHASE 7 — Browser E2E for all actors

Date: 2026-10-16  
Result: **PARTIAL.** Contractor repair → quote → mock 15% → work → 85% đối soát → mock 10% payout was executed in a real browser against `BuilMate_test`. Cancel/refund, material COD, full RBAC matrix, VI/EN, and mobile viewports were **not** completed.

Classification:

- Unit (Phase 6C): 37/37 PASS — **not re-run** while the live test API held `BuilMate_test`
- API Integration (Phase 6C): 287/287 PASS — **not re-run** (would collide with the live test server)
- Browser E2E: **A PASS, B PASS, C NOT RUN, D NOT RUN, E PARTIAL**
- **NOT READY FOR DEMO** of the material-store COD journey
- Contractor 15/5/10/85 happy path is **browser-proven** on the isolated stack
- **NOT READY FOR REAL PAYMENT**

Playwright and Cypress are **not** in the repository. This session used the Cursor browser tab. That is real browser evidence, not an API-integration substitute. A repeatable Playwright suite was **not** added.

---

## Environment actually used

| Process | Bind | Proof |
| --- | --- | --- |
| Docker `buildmate-test-pg` | `127.0.0.1:55432` | `healthy running`; in-container port 5432 maps to host 55432 |
| Isolated API | `http://127.0.0.1:5055` | PID 7944: `node --require ./src/tests/helpers/preload-postgres.js src/server.js`, `PORT=5055`, `NODE_ENV=test` |
| Customer/Contractor UI | `http://127.0.0.1:5176` | Vite `--port 5176 --host 127.0.0.1`; `POST /api/auth/login` and finance calls hit **5055** |
| Admin UI | `http://127.0.0.1:5177` | Vite `VITE_API_URL=http://127.0.0.1:5055/api/v1`; `GET /api/v1/admin/finance/escrow` on 5055 |
| Team API already on `:5000` | `node src/server.js` (nodemon) | **Not used.** |

PostgreSQL of the test URL:

- host `127.0.0.1`
- port `55432` (container reports `inet_server_port=5432`)
- database `BuilMate_test`
- `uq_users_email_lower` and `uq_users_phone_number_nonempty` still UNIQUE + VALID after payout

Safety checks:

1. Docker test PG healthy — **yes**
2. Test API used `TEST_DATABASE_URL` via preload — **yes**
3. Test API did not connect Mongo / team `BuilMate` — postgres provider skips mongoose
4. Frontend 5176 called `:5055` — login, repair-requests, quotations, payments, mock-success all on 5055 log
5. Admin 5177 called `:5055/api/v1` — `POST /api/v1/admin/orders/…/escrow/settle` 200
6. No request in the 5055 log targeted a remote team host
7. Mock payment only: `provider=mock`, UI copy “không trừ tiền thật”
8. SMTP cleared by preload
9. Mock payment route used in `NODE_ENV=test`
10. `.env` / `.env.test` remain gitignored

Team `BuilMate` Docker volume was **not** reset.

---

## Demo actors (fake only)

Emails only. Passwords are **not** printed here.

| Label | Email | Role | Browser this session |
| --- | --- | --- | --- |
| CUSTOMER_DEMO | `demo.customer@buildmate.test` | CUSTOMER | Request, chat, accept quote, mock pay, nghiệm thu, 85% |
| CONTRACTOR_DEMO | `demo.contractor@buildmate.test` | CONTRACTOR APPROVED LIVE | Quote, start blocked then STARTED, progress, complete |
| MATERIAL_STORE_DEMO | `demo.store@buildmate.test` | MATERIAL_STORE_OWNER LIVE | Fixture only |
| ADMIN_DEMO | `demo.admin@buildmate.test` | ADMIN | Escrow ledger + mock payout |

Public contractor id: `5bbf65e965e642555b7b9bc3`.  
Chat room: `cd4b87265d7093d2055b26dc`.  
Quotation: `454ead437e6e629e734288a5`.  
ServiceOrder: `25e4fb36465dc5e8fcee817e` / `BM-20261015-D1BE8B`.  
Payment: `88421292131b9365e40c9628`.

---

## Per-test results

### P7-A1 Customer request → chat

| Field | Value |
| --- | --- |
| Test ID | P7-A1 |
| Scenario | Customer login → public contractor profile → create repair request → land in chat |
| Expected | One RepairRequest, one ChatRoom, browser on `/customer/chat/:roomId` |
| Actual | `POST /api/repair-requests` **201**. URL `/customer/chat/cd4b87265d7093d2055b26dc`. PG `repair_requests.id=85` title `Rò rỉ ống nước nhà vệ sinh` |
| Status | **PASS** |
| Browser | `docs/phase-7-artifacts/phase7-a1-contractor-public.png`, `phase7-a1-customer-chat.png` |
| Notes | Placeholder `/uploads/e2e-placeholder.png` 404 (cosmetic) |

### P7-A2 Contractor receives request, quotes 10.000.000

| Field | Value |
| --- | --- |
| Test ID | P7-A2 |
| Scenario | Contractor sees the job, sends 10.000.000 VND quotation; customer sees it in chat |
| Expected | One quotation, no second room |
| Actual | `POST /api/quotations` **201**. Chat card 10.000.000đ. Customer later opened `/customer/quotation/454ead437e6e629e734288a5`. PG quotations = 1, status later ACCEPTED |
| Status | **PASS** |
| Browser | `phase7-a2-contractor-quote-chat.png` |

### P7-B1 Accept quotation 15/5/10/85

| Field | Value |
| --- | --- |
| Test ID | P7-B1 |
| Expected | UI shows 10.000.000 / 1.500.000 / 500.000 / 1.000.000 / 8.500.000. Terms checkbox required. After accept: ServiceOrder + DEPOSIT UNPAID. Contractor cannot start |
| Actual | Split amounts matched. Accept button disabled until checkbox. `PATCH /quotations/…/accept` **200** as CUSTOMER. PG: order `QUOTATION_ACCEPTED` `UNPAID` 10.000.000; payment DEPOSIT UNPAID 1.500.000 `provider=mock`; escrow `NOT_FUNDED` mock. Contractor UI: “Chờ khách thanh toán cọc…” — no start button |
| Status | **PASS** |
| Browser | `phase7-b1-quotation-split.png`, `phase7-b1-quote-accepted.png`, `phase7-b3-start-blocked-before-deposit.png` |
| API | First accept as CONTRACTOR token → **403 Forbidden** (correct). After customer login → 200 |

### P7-B2 Mock pay 15%

| Field | Value |
| --- | --- |
| Test ID | P7-B2 |
| Expected | Payment PAID; escrow HELD 1.500.000 / hold 1.000.000 / fee 500.000 not POSTED yet; no payout |
| Actual | Pay CTA disabled until terms. Checkout + `POST /api/payments/…/mock-success` **200**. Browser: Đã thanh toán, escrow **HELD**, mock copy. PG: payment PAID 1.500.000; order `DEPOSIT_PAID` / `PAID`; escrow HELD, payout NONE, released 0, commissions empty |
| Status | **PASS** |
| Browser | `phase7-b2-payment-before-mock.png`, `phase7-b2-deposit-held.png` |
| Bug fixed | `PaymentPage.tsx` adjacent JSX (label + button) crashed Vite — mock pay page would not render |

### P7-B3 Contractor work after HELD

| Field | Value |
| --- | --- |
| Test ID | P7-B3 |
| Expected | Start blocked before HELD; STARTED after; progress visible; contractor complete; customer nghiệm thu |
| Actual | After HELD, button **Nhận công việc**. Status STARTED → IN_PROGRESS → COMPLETED. Customer page “Chờ bạn nghiệm thu” → confirm. PG order `CUSTOMER_ACCEPTED`. Commissions still empty |
| Status | **PASS** |
| Browser | `phase7-b3-contractor-completed.png` |
| Bug fixed | Contractor order header showed contractor name as “khách”. `OrderDetail.tsx` now shows customer name on contractor view |

### P7-B4 Remaining 85% đối soát

| Field | Value |
| --- | --- |
| Test ID | P7-B4 |
| Expected | 8.500.000 is not platform cash; confirm remaining; no payout until conditions |
| Actual | Customer clicked “Xác nhận đã thanh toán 85% trực tiếp”. PG escrow `RELEASE_PENDING`, `remaining_settled=true`, `released_amount=0`. Ledger `RELEASE_PENDING` note “Direct 85% remaining confirmed (off platform)”. Admin G “Chờ giải ngân” 1.000.000; I fee still 0 |
| Status | **PASS** |

### P7-B5 Admin mock payout

| Field | Value |
| --- | --- |
| Test ID | P7-B5 |
| Expected | canPayout only when ready; mock payout 1.000.000 once; fee 500.000 POSTED; escrow settled; second payout does not create another row |
| Actual | Admin `/escrow` on 5177 against 5055. Row: 10.000.000, 1.500.000/500.000/1.000.000, `RELEASE_PENDING`, 85% Có, `CUSTOMER_ACCEPTED`. `POST …/escrow/settle` **200**. After: H = 1.000.000, I = 500.000, G = 0, payout button **disabled**. PG: escrow `RELEASED` `payout_status=PAID` released 1.000.000 mock; **one** `contractor_payouts` 1.000.000 PAID mock; commission POSTED platform 500.000; ledger PAYOUT 1.000.000. Material GMV 0 |
| Status | **PASS** (second-click UI blocked; extra settle API from this tab returned 401 because admin token is not `buildmate-token` — not a second payout) |
| Browser | `phase7-b5-escrow-before-payout.png`, `phase7-b5-after-payout-fee-posted.png` |

### P7-C Cancel / refund / dispute / concurrent finance

| Test ID | Status |
| --- | --- |
| C1 cancel before deposit | **NOT RUN** |
| C2 customer cancel after deposit | **NOT RUN** |
| C3 contractor cancel refund | **NOT RUN** |
| C4 dispute FROZEN | **NOT RUN** |
| C5 double refund/payout races | **NOT RUN** in browser (API integration covered in Phase 6C). Happy-path double payout button disabled after settle |

### P7-D Material store COD, fee 0

| Field | Value |
| --- | --- |
| Test ID | P7-D1–D3 |
| Expected | Cart → PENDING_CONFIRMATION, no 15% page; COD 2.100.000; deposit 0; fee 0 |
| Actual | Fixture exists (cement 2.000.000, `baseDeliveryFee` 100.000). Browser checkout **not run** |
| Status | **NOT RUN** |

### P7-E Admin analytics, RBAC, VI/EN

| Test ID | Status | Notes |
| --- | --- | --- |
| E1 analytics vs PG | **PARTIAL** | Escrow ledger A–J matched PG for this order. Dedicated Analytics page / Material GMV with a live COD order **not** run |
| E2 RBAC | **PARTIAL** | Contractor cannot `PATCH accept` (403). Customer quotation UI briefly showed with a contractor token because two tabs share `localStorage` — backend still 403. Store/escrow/anonymous matrix **not** fully walked in browser |
| E3 VI/EN + mobile | **NOT RUN** | VI was the default; EN and 390px not exercised |

### Legacy policies

**NOT RUN.** No historical `BuilMate` rows were copied or edited.

---

## Files changed this phase (bugs found in browser)

| File | Why |
| --- | --- |
| `frontend/src/features/payments/pages/PaymentPage.tsx` | Wrap terms checkbox + pay button in a fragment so Vite can compile the mock payment page |
| `frontend/src/features/orders/components/OrderDetail.tsx` | Contractor order shows customer name, not the contractor’s own name |
| `backend/scripts/seed-e2e-browser-actors.js` | Idempotent LIVE/APPROVED demo partners on `BuilMate_test` |
| `backend/scripts/test-db/prove-e2e-env.js` | Environment proof |
| `backend/scripts/test-db/verify-e2e-request.js` / `verify-payout.js` | PG evidence |
| `docs/phase-7-artifacts/*.png` | Browser screenshots (no passwords) |

No contractor 15/5/10/85 formula change. No material fee change. No production migration. No draft policy publish.

---

## PostgreSQL after B5 (BuilMate_test only)

```
escrow: RELEASED, payout PAID, remaining_settled true,
        released 1_000_000, refunded 0, fee 500_000, hold 1_000_000, mock true
payouts: 1 row, 1_000_000, PAID, mock true
commissions: 1 row, platform 500_000 POSTED, contractor_amount 1_000_000
ledger: HOLD 1_500_000 → RELEASE_PENDING (85% off platform) → PAYOUT 1_000_000
indexes: uq_users_email_lower, uq_users_phone_number_nonempty VALID
```

---

## Manual continuation

Keep **only** `http://127.0.0.1:5176` + `http://127.0.0.1:5177` + API `5055`. Do not open `localhost:5000`.

1. Independent orders for C1–C5 (cancel/refund/dispute/races).
2. Material: Demo Portland Cement qty 1, shipping 100.000, total 2.100.000, no deposit page. Walk store statuses. Admin J GMV ≠ I platform fee.
3. RBAC: other customer/contractor/store 403; anonymous 401.
4. EN language + 390px viewport.
5. If a Playwright suite is wanted, confirm before adding the dependency.

---

## Remaining risks

- Two browser tabs share `localStorage` (`buildmate-token`). Switching actors overwrites the other tab. Backend still enforces role.
- Team backend on `:5000` is still running.
- Avatar placeholder 404.
- Cancel/refund/COD journeys unproven in the browser.

## Completion vs Phase 7 gate

| Gate | This session |
| --- | --- |
| 1 Customer sends repair request | **PASS** |
| 2 Contractor sees request and correct chat | **PASS** |
| 3 Contractor sends quotation | **PASS** |
| 4 Customer accepts quotation | **PASS** |
| 5 Customer mock pays 15% | **PASS** |
| 6 Contractor starts after cọc | **PASS** |
| 7 Contractor completes, customer nghiệm thu | **PASS** |
| 8 Admin mock 10% + fee 5% POSTED | **PASS** |
| 9 Cancel/refund policy | **NOT RUN** |
| 10 Material COD no fee | **NOT RUN** |
| 11 Admin finance stats | **PARTIAL** (escrow ledger A–J for this order) |
| 12–13 RBAC / duplicate money | **PARTIAL** (403 on wrong-role accept; payout button disabled after one settle) |
| 14 Team `BuilMate` untouched | **PASS** |
