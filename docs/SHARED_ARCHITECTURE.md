# Shared architecture (Sprint 5.3)

Prepare one contract layer so **web** and a future **React Native** client stay aligned. No RN app in this sprint.

## Target layout

```
BUILDMATE_PLATFORM/
  backend/                 Express + Mongo (source of runtime truth)
  frontend/                React web (Vite) — keep this name so npm scripts stay stable
  mobile-react-native/     Sprint 7 placeholder
  shared/                  Types, enums, locales, validators, API contracts
  docs/
```

`frontend-web/` in the original sketch maps to today’s `frontend/`. Renaming is a later git mv once RN exists; it is not required to share types.

## What lives in `shared/`

| Folder | Contents | Not allowed |
| --- | --- | --- |
| `types/` | User, Order, Quotation, Notification | React components |
| `constants/` | ROLES, ORDER_STATUS, NOTIFICATION_TYPE, SOCKET_EVENTS | Env secrets |
| `locales/` | Enum labels VI/EN | Full dashboard copy (stays in each client) |
| `validators/` | Pure functions | Express/Zod middleware |
| `api-contracts/` | Request + response TypeScript types | Axios / fetch implementations |
| `utils/` | `formatVnd`, open-status helper | Node `fs` / Mongoose |

Web already aliases `@buildmate/shared/*` → `../shared/*` (`tsconfig.app.json` + `vite.config.ts`). `frontend/src/types/user.ts` and order domain types re-export from shared.

## Migration rule for Sprint 7

1. Scaffold RN with the same JWT login as web.
2. Import `@buildmate/shared` (workspace package or Metro extraNodeModules).
3. Hit `/api/v1/...` (see [API_VERSIONING.md](./API_VERSIONING.md)).
4. Do not duplicate order status enums in the mobile repo.
