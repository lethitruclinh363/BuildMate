# Future sprint guide

Do **not** rewrite the auth stack, design tokens, or partner collections.

## Sprint 2 — done

- `ContractorProfile` + verification documents (Multer)
- Admin approve / reject
- `Store` (GeoJSON + radius)
- `Service`, `Material` CRUD behind approved contractor

## Sprint 3 — done

- Public `$geoNear` APIs on `stores.location`
- Leaflet + OSM explore map (3 / 5 / 10 km)
- Public contractor + store pages (chat button reserved)
- Catalog search on existing Service / Material collections

## Sprint 4 — done

- Repair requests + chat rooms (1:1)
- Socket.IO JWT rooms, typing, presence, `notification:new`
- Dynamic quotation cards in chat (accept / reject / modify)
- No work orders yet

## Sprint 4.5 — done (product polish)

- Global loading / empty / error / success / toast / confirm
- Notification page + STATUS_UPDATE
- Profile (avatar, password, status)
- Upload scopes, Helmet + rate limit + mongo sanitize + JWT HS256
- `auditlogs`, demo seed for the full quote flow
- Docs: USER_GUIDE, DEMO_SCRIPT, DEPLOYMENT

## Sprint 5.1 — done (backend order core)

See [SPRINT5_BACKEND.md](./SPRINT5_BACKEND.md).

- Order factory on `PATCH /quotations/:id/accept` (no `POST /orders`)
- Contractor updates repair-job progress after accept
- Append-only progress, sockets, notifications, audit
- Payment row `UNPAID` only

## Sprint 5.2 — done (Order UI)

See [SPRINT5_FRONTEND.md](./SPRINT5_FRONTEND.md).

Customer / contractor order screens, timeline, progress photos, Socket.IO toasts.

## Sprint 5.3 — done (E2E + shared contracts)

See [SPRINT5_E2E_TEST.md](./SPRINT5_E2E_TEST.md), [SHARED_ARCHITECTURE.md](./SHARED_ARCHITECTURE.md), [API_VERSIONING.md](./API_VERSIONING.md), [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md).

## Sprint 6 — Architecture locked

See [SPRINT6_ARCHITECTURE.md](./SPRINT6_ARCHITECTURE.md).

## Sprint 6.1 — done (backend finance)

See [SPRINT6_BACKEND.md](./SPRINT6_BACKEND.md).

Mock checkout, commission 5% snapshot, reviews, complaints, admin analytics. No live gateway.

## Sprint 6.2 — done (finance UI)

See [SPRINT6_FRONTEND.md](./SPRINT6_FRONTEND.md).

## Sprint 6.3 — done (validation)

See [SPRINT6_E2E_VALIDATION.md](./SPRINT6_E2E_VALIDATION.md), [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md), [MOBILE_ARCHITECTURE.md](./MOBILE_ARCHITECTURE.md).

No new business features. Complaint status machine locked to OPEN → PROCESSING → RESOLVED|REJECTED. Order COMPLETED may stay UNPAID.

## Sprint 7 — Mobile + payout (later)

- React Native against `shared/` + `/api/v1`
- Optional real disbursement / `PAID_OUT`
