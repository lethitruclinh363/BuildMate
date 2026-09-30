# Mobile architecture (preparation only)

**Sprint 6.3 does not ship a React Native app.** This file locks the client for Sprint 7.

Web stays `frontend/`. Native lives in `mobile-react-native/` (placeholder README today).

---

## 1. Stack

| Layer | Choice |
| --- | --- |
| Runtime | React Native (TypeScript) |
| Navigation | React Navigation (native stack + tab) |
| State | Zustand (same patterns as web `auth.store`) |
| HTTP | Axios or fetch → `VITE`-equivalent `API_URL` + `/api/v1` |
| Realtime | `socket.io-client` (JWT in `auth`) |
| i18n | Shared JSON from `shared/locales` + app overlays |
| Maps | react-native-maps (not Leaflet) |

Do **not** copy Vite/Tailwind. Rebuild screens with RN primitives; keep Construction OS tokens (navy / copper) in a small theme file.

---

## 2. Folder structure

```
mobile-react-native/
  src/
    app/                 bootstrap, providers
    navigation/          auth vs role tabs
    features/
      auth/
      map/
      chat/
      orders/
      payments/
      notifications/
    shared/
      api/               thin clients — no Axios in JSX
      types/             re-export @buildmate/shared
      locales/
```

---

## 3. APIs the phone needs first

| Domain | Surface |
| --- | --- |
| Auth | `POST /api/v1/auth/login` JWT |
| Marketplace | nearby contractors/stores, public contractor/store |
| Chat | rooms, messages, Socket.IO |
| Orders | customer/contractor lists, progress, complete |
| Payment | `GET /payments/order/:id`, checkout (mock until Sprint 7 gateway) |
| Notification | list + `notification:new` |

Same RBAC as web. The contractor app is where site progress is posted.

---

## 4. Shared with web

Use `shared/`:

- `types/` user, order, quotation, notification
- `constants/` roles, order-status, notification types
- `locales/` enum labels VI/EN
- `validators/` auth
- `api-contracts/`

Add payment/review/complaint types in Sprint 7 **without** breaking frozen Sprint 1–5 field names.

---

## 5. Out of scope here

Expo/CLI bootstrap, App Store, push FCM, background location, wallet payout UI.
