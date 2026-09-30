# API versioning

## Today (non-breaking)

| Prefix | Status |
| --- | --- |
| `/api/...` | **Current public surface.** Keep forever for Sprint 1–5 clients. |
| `/api/v1/...` | **Alias** of the same Express router (Sprint 5.3). Same handlers, same JWT, same JSON. |

Example: `GET /api/health` and `GET /api/v1/health` return the same payload.

Web Vite already proxies `/api` (including `/api/v1`) to port 5000.

## Envelope

Success (unchanged):

```json
{ "success": true, "message": "…", "data": {} }
```

Error (Sprint 5.3 additive):

```json
{
  "success": false,
  "message": "…",
  "details": {},
  "errors": {},
  "data": null
}
```

`errors` is an alias of `details` so older web code that reads `details` / Axios `message` does not break. New clients (RN) should prefer `errors`.

## When to mint `/api/v2`

Only when a **breaking** change is required, for example:

- Removing a field from `orders`
- Changing quotation accept so it no longer returns root-level quotation fields
- Replacing JWT for a different auth scheme

Until then: additive fields only, dual-mount `/api` + `/api/v1`.

## Client guidance

| Client | Base URL |
| --- | --- |
| Current web | `VITE_API_URL` → `/api` |
| New web / RN | `/api/v1` |

Do not delete `/api` while the graduation demo and existing localStorage sessions still call it.
