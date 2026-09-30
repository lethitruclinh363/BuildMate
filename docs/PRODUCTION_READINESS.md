# Production readiness (Sprint 6.3)

Thesis demo on a VPS is acceptable. Live money is **not**.

Companion: [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) (Sprint 5.3 base).

---

## Go for demo

| Area | Status |
| --- | --- |
| Auth JWT HS256, secret length in prod | Yes |
| RBAC on admin / contractor / customer APIs | Yes (6.3 suite) |
| Helmet, CORS from `CLIENT_URL`, rate limit `/api` + `/api/auth` | Yes |
| Mongo sanitize `$` / dotted keys | Yes |
| Upload mime + random names | Yes |
| Error envelope, no stack in production | Yes |
| `/api` and `/api/v1` | Yes |
| Payment unique `{orderId, type}`, commission unique `paymentId` | Yes |
| mock-success **404 in production** | Yes |
| i18n VI/EN, no raw finance enums on UI | Yes |
| `npm test` + `frontend npm run build` | Required before defense |

## Do not go live (payments)

- Real MoMo / Stripe / bank webhook
- Contractor bank payout
- PCI / KYC
- CDN for uploads
- Horizontal replica set (single Mongo is fine for defense)

## Ops checklist

1. `JWT_SECRET` ≥ 32 chars, `NODE_ENV=production`, `CLIENT_URL` exact origin.
2. Seed demo accounts only on staging.
3. Reverse proxy TLS; uploads disk quota.
4. Do not expose `POST /payments/:id/mock-success` (already 404 when `env.isProd`).
5. Analytics cache 60s — acceptable for demo load.

## Frontend

- Role guards + 401 logout
- ErrorBoundary
- Lazy chunks for map / chat / finance
- Bundle still large (Leaflet). Acceptable for defense; not a CDN-grade SPA.

## Sign-off

Sprint 6 business layer is **demo-ready**. Sprint 7 is mobile + real money.
