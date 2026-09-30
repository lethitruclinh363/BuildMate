# Production checklist (Sprint 5 close)

Superseded for Sprint 6 sign-off by [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md). Sprint 5.3 rows below still apply.

## Backend

| Check | Status |
| --- | --- |
| `MONGODB_URI`, `JWT_SECRET` required at boot | Yes (`config/env.js`) |
| JWT HS256 only; secret length warning / prod hard fail if &lt; 32 chars | Yes |
| Helmet, CORS from `CLIENT_URL`, cookie parser | Yes |
| Rate limit `/api` + tighter `/api/auth` | Yes |
| Mongo sanitize (`$` / dotted keys) | Yes |
| Central `errorHandler` + `classifyError` (no stack in production) | Yes |
| Upload: scoped dirs, random names, mime allow-list | Yes |
| Morgan `dev` / `combined` | Yes |
| Socket.IO JWT handshake | Yes |
| Orders never deleted; payment row is `UNPAID` placeholder | Yes |
| `/api` and `/api/v1` dual mount | Yes (5.3) |

## Frontend

| Check | Status |
| --- | --- |
| `ProtectedRoute` by login + role | Yes |
| Axios 401 clears session | Yes |
| ErrorBoundary + reload | Yes |
| Query/list screens: skeleton, empty, retry | Yes (orders included) |
| Confirm modal on assign / accept / complete | Yes |
| Toast on order socket events | Yes |
| i18n VI/EN | Yes |
| Production build (`tsc -b && vite build`) | Required in CI / before demo |

Bundle note: Vite warns the main chunk is &gt; 500 kB (Leaflet + app). Acceptable for Sprint 5; code-split map routes in Sprint 6 if needed.

## Demo accounts (after `npm run seed`)

| Role | Email | Password |
| --- | --- | --- |
| Customer | customer@buildmate.vn | Demo@1234 |
| Contractor | anphu@buildmate.vn | Demo@1234 |
| Material store | materials@buildmate.vn | Demo@1234 |
| Admin | admin@buildmate.vn | Admin@1234 |

## Not production-ready (explicitly later)

Payment gateway, commission, reviews, complaints, React Native binary, CDN uploads.

Sprint 6.1–6.3 implemented **mock** payment + trust APIs. Live gateway and RN remain Sprint 7.
