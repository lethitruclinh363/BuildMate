# Architecture

## Layers

```
React (Vite)  ──HTTP/JWT──►  Express
     │                          │
  Zustand auth              services/
  Design system             models/ (Mongoose)
  Role dashboards           Socket.IO (JWT rooms)
                            Multer (repair + chat media)
```

Backend is **route → controller → service → model**.  
UI is **page → feature/layout/ui**. Business calls live in `lib/api.ts` + Zustand, not inside presentational components.

## Design system

Tokens: `frontend/src/theme/design-token.ts`  
Primitives: Button, Input, Card, Modal, Badge, Avatar, Dropdown  
Layouts: MainLayout, AuthLayout, DashboardLayout

Brand: Construction navy + copper highlight on warm paper. Space Grotesk + Manrope.

## Actors

```
Customer
    |
Contractor
    |
Material Store Owner
    |
Admin
```

| Role | Responsibility |
| --- | --- |
| Customer | Opens a repair request, accepts a quotation, pays the deposit, and accepts the finished job |
| Contractor | Sends the quotation, runs the repair job, and posts progress |
| Material Store Owner | Publishes a materials catalog the job can reference |
| Admin | Approves partners and reviews finance, complaints, and analytics |

There is no Worker account, roster, assignment, or job-tracking role.

## Repair job

```
Customer Request
    ↓
Contractor Quotation
    ↓
Deposit
    ↓
Repair Job
    ↓
Contractor Progress Update
    ↓
Customer Acceptance
```

The order record uses `QUOTATION_ACCEPTED` → `DEPOSIT_PAID` → `STARTED` → `IN_PROGRESS` → `COMPLETED` → `CUSTOMER_ACCEPTED`. The contractor posts progress (`STARTED`, `IN_PROGRESS`, `COMPLETED`). The customer accepts only after `COMPLETED`. Cancel is allowed only before work starts (`QUOTATION_ACCEPTED` or `DEPOSIT_PAID`).

Job notifications are `CONTRACTOR_ACCEPTED_JOB`, `CONTRACTOR_STARTED_JOB`, `CONTRACTOR_UPDATED_PROGRESS`, and `CONTRACTOR_COMPLETED_JOB`. Chat messages and payment notices stay separate.

## Auth

1. Register / login return JWT + public user.
2. Token persisted in Zustand (`buildmate-auth`).
3. Axios interceptor attaches `Authorization`.
4. `AuthProvider` restores session via `GET /user/profile`.
5. `ProtectedRoute` gates by login and role.

## Extension points

| Sprint | Hook already in place |
| --- | --- |
| 2 | ContractorProfile, Store, Service, Material, admin review |
| 3 | Public `$geoNear` on `stores.location`, Leaflet explore map |
| 4 | RepairRequest, ChatRoom, Message, Quotation, Notification + Socket.IO |
| 4.5 | Feedback UI, profile, uploads, auditlogs, filters, Helmet/CORS/sanitize |
| 5 | Repair job, contractor progress, `uploads/progress` |
| 6 | Admin dashboard + ADMIN role |

## Marketplace (Sprint 3)

Public GeoJSON search uses existing `stores.location` (`2dsphere`). Nearby contractors are LIVE yards with `storeType` SERVICES or BOTH; nearby stores are MATERIALS or BOTH. Catalog search reuses `services` and `materials`.

```
/explore  ──►  GET /api/location/{stores|contractors}/nearby
               GET /api/stores/:id
               GET /api/contractors/:id
               GET /api/{services|materials}/search
```

Leaflet + OpenStreetMap only.

## Chat + quotation (Sprint 4)

A repair request opens a 1:1 chat room. Messages persist in MongoDB; Socket.IO fans them out. Quotations are first-class documents, also rendered as chat cards. Accepting a quote **creates `orders` + `payments` (UNPAID)** — see [SPRINT5_ARCHITECTURE.md](./SPRINT5_ARCHITECTURE.md).

