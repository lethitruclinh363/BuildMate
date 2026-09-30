# @buildmate/shared

Source of truth for **types, enums, API request/response shapes, and status copy**.

This folder is not an app. Web (`frontend/`) and a future React Native client should import from here instead of forking enums.

```
shared/
  types/           User, Order, Quotation, Notification
  constants/       ROLES, ORDER_STATUS, NOTIFICATION_TYPE, SOCKET_EVENTS
  locales/vi|en    Enum labels only (full UI catalogs stay in each client)
  validators/      Pure checks (no Express / Axios)
  api-contracts/   Request + response types only
  utils/           formatVnd, status helpers
```

Web alias (Sprint 5.3): `@buildmate/shared/*` → `../shared/*`.

Do **not** put React, React Native, Mongoose, or fetch clients here.

Mobile implementation is Sprint 7. See `mobile-react-native/README.md`.
