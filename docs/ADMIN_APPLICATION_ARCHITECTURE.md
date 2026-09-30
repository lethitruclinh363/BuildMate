# BuildMate Admin Application Architecture

Independent React portal for platform operators. It does **not** import `frontend/src`, share `frontend/package.json`, or reuse the customer router, Zustand stores, or UI kit.

## Structure

```
BUILDMATE_PLATFORM/admin
├── public/favicon.svg
├── src/
│   ├── app/            App shell + router
│   ├── auth/           Login, JWT store, ProtectedRoute, role guard
│   ├── layouts/        AdminLayout, sidebar, topbar
│   ├── dashboard/
│   ├── users/
│   ├── contractors/    Directory + verification queue
│   ├── orders/
│   ├── payments/
│   ├── commissions/
│   ├── reviews/
│   ├── complaints/
│   ├── analytics/
│   ├── settings/
│   ├── audit/
│   ├── components/     Enterprise glass UI (not customer components)
│   ├── hooks/
│   ├── services/       api.ts + admin.api.ts
│   ├── stores/
│   ├── types/
│   └── locales/        vi / en
├── .env / .env.example
├── package.json
├── vite.config.ts      port 5174, strictPort: true
└── tsconfig*.json
```

| App | URL |
| --- | --- |
| User app | http://localhost:5173 |
| Admin portal | http://localhost:5174 |
| API | http://localhost:5000 |

Admin Vite **never** falls back to 5175: `server.port = 5174` and `strictPort: true`. If 5174 is taken, Vite exits with an error.

CORS (`CLIENT_URL`) allows only:

```
http://localhost:5173,http://localhost:5174
```

Backend splits that comma-separated list and matches the request `Origin`. Unknown origins (including `http://localhost:5175`) are rejected.

Design system: dark navy canvas, copper accent, glass cards. Sidebar: Dashboard, Users, Contractors, Verification, Orders, Payments, Commission, Reviews, Complaints, Analytics, Audit, Settings.

## Run command

Requires MongoDB and the existing backend. Seed already creates the operator account.

```bash
# Terminal 1
cd backend
npm run seed
npm run dev

# Terminal 2 — customer / contractor / store app
cd frontend
npm run dev

# Terminal 3 — this portal
cd admin
npm install
npm run dev
```

| App | URL |
| --- | --- |
| User app | http://localhost:5173 |
| Admin portal | http://localhost:5174 |
| API | http://localhost:5000 |

Scripts: `npm run dev`, `npm run build`, `npm run preview`.

### Admin credentials

| Field | Value |
| --- | --- |
| Email | `admin@buildmate.vn` |
| Password | `Admin@1234` |
| Role | `ADMIN` |

Created by `backend` `npm run seed` (`upsertUser` in `backend/src/scripts/seed.js`). No new backend API was added.

Login: `POST /api/v1/auth/login`. The portal stores the JWT only when `user.role === 'ADMIN'`. Any other role is treated as **403** and is never persisted. `ProtectedRoute` + `RoleGuard` block CUSTOMER / CONTRACTOR / MATERIAL_STORE_OWNER.

## Deployment

1. Build static assets: `cd admin && npm run build` → `admin/dist`.
2. Serve `dist` behind HTTPS (nginx, CloudFront, or the same host as other SPAs).
3. Set `VITE_API_URL` at **build time** to the public API root, including `/api/v1` (example: `https://api.buildmate.vn/api/v1`).
4. Allow the admin origin in backend `CLIENT_URL` (comma-separated). Local default: `http://localhost:5173,http://localhost:5174`.
5. Deploy this SPA independently from `frontend/`. Do not merge bundles.

## API mapping

Base URL: `VITE_API_URL` (default `http://localhost:5000/api/v1`).

There is **no** dedicated admin list API for all users, orders, payments, or reviews. Those screens compose data from endpoints the ADMIN role is already allowed to call. Backend routes were not changed.

| Screen | Method | Path |
| --- | --- | --- |
| Login | POST | `/auth/login` |
| Session restore | GET | `/user/profile` |
| Logout | POST | `/auth/logout` |
| Dashboard / stats | GET | `/admin/stats` |
| Analytics | GET | `/admin/analytics` |
| Users / contractors | GET | `/admin/verifications` |
| Verification approve | POST | `/admin/verifications/:id/approve` |
| Verification reject | POST | `/admin/verifications/:id/reject` |
| Complaints list | GET | `/admin/complaints` |
| Complaint update | PATCH | `/admin/complaints/:id` |
| Commission rule | GET / PATCH | `/admin/settings/commission` |
| Audit | GET | `/admin/audit-logs` |
| Order detail | GET | `/orders/:id` |
| Payments for order | GET | `/payments/order/:orderId` |
| Refund | POST | `/admin/payments/:id/refund` |
| Reviews | GET | `/reviews/user/:id` |

Orders and payments lists collect IDs from complaints + audit logs (`entityType=Order` / `meta.orderId`), then call the existing detail endpoints.
