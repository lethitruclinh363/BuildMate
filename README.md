# BuildMate — Nền tảng xây dựng & vật liệu địa phương

BuildMate kết nối **chủ nhà**, **chủ đội thợ / chủ cửa hàng**, **thợ thi công** và **quản trị viên** trên một nền tảng: tìm kiếm theo vị trí, cửa hàng vật liệu, chat realtime, báo giá động và theo dõi sửa chữa.

Giao diện mặc định: **tiếng Việt**, chuyển **English** bằng 🇻🇳 VI | 🇬🇧 EN (không reload). Catalog JSON: `frontend/src/locales/{vi,en}/*.json`. Lưu `localStorage` key `buildmate-language`. Mã nguồn, API, cơ sở dữ liệu PostgreSQL và vai trò (`CUSTOMER`, `CONTRACTOR`, `MATERIAL_STORE_OWNER`, `ADMIN`) giữ tiếng Anh.

Sprint 1–6.3: auth, marketplace, chat, orders, **mock payment + commission + review + complaint + analytics**, E2E validation.  
Web: [docs/SPRINT6_FRONTEND.md](docs/SPRINT6_FRONTEND.md). Backend: [docs/SPRINT6_BACKEND.md](docs/SPRINT6_BACKEND.md). QA: [docs/SPRINT6_E2E_VALIDATION.md](docs/SPRINT6_E2E_VALIDATION.md). Mobile prep: [docs/MOBILE_ARCHITECTURE.md](docs/MOBILE_ARCHITECTURE.md).

## Cấu trúc monorepo

```
BUILDMATE_PLATFORM/
├── frontend/          React + Vite + TypeScript (web)
├── backend/           Node.js + Express + PostgreSQL + Prisma ORM
├── shared/            Types, enums, API contracts (web + future RN)
├── mobile-react-native/  Placeholder Sprint 7
├── database/          Ghi chú schema & seed
├── docs/              API, kiến trúc, sprint
├── deployment/        Docker Compose (PostgreSQL)
└── mobile/            Dành cho client sau này
```

## Yêu cầu

- Node.js 20+
- PostgreSQL 16+ (quản lý qua pgAdmin 4 hoặc Docker)

## Chạy nhanh

### 1. Cơ sở dữ liệu

```bash
cd deployment
docker compose up -d
```


### 2. Backend

```bash
cd backend
copy .env.example .env
npm install
npm run seed
npm run dev
```

API: `http://localhost:5000/api/health`

### 3. Frontend

```bash
cd frontend
copy .env.example .env
npm install
npm run dev
```

Web: `http://localhost:5173`

## Tài khoản demo (sau khi seed)

| Vai trò (DB) | Hiển thị trên UI | Email | Mật khẩu | Ghi chú |
| --- | --- | --- | --- | --- |
| ADMIN | Quản trị viên | ivan.p@example.net | Admin@1234 | Duyệt đối tác tại `/admin/verification` |
| CUSTOMER | Khách hàng | oscar.d@example.net | Demo@1234 | Mở `/customer/explore` |
| CONTRACTOR | Nhà thầu | paula.r@example.org | Demo@1234 | An Phu Construction, cửa hàng dịch vụ |
| MATERIAL_STORE_OWNER | Cửa hàng vật liệu | yosef.c@example.com | Demo@1234 | Can Tho Materials |

## Đa ngôn ngữ (i18n)

- Package: `i18next` + `react-i18next`
- Catalog: `frontend/src/locales/vi/` và `en/` (`common`, `auth`, `dashboard`, `marketplace`, `chat`, `quotation`)
- Switcher: `frontend/src/components/common/LanguageSwitcher.tsx`
- Không đổi endpoint (`/api/repair-requests`, `/api/quotations`, …)

Xem [Hướng dẫn người dùng & demo](docs/HUONG_DAN.md).

## Tài liệu

- [Hướng dẫn người dùng & demo](docs/HUONG_DAN.md)
- [USER_GUIDE](docs/USER_GUIDE.md)
- [DEMO_SCRIPT](docs/DEMO_SCRIPT.md)
- [DEPLOYMENT](docs/DEPLOYMENT.md)
- [Sprint 6.3 E2E validation](docs/SPRINT6_E2E_VALIDATION.md)
- [Production readiness](docs/PRODUCTION_READINESS.md)
- [Mobile architecture (no RN app yet)](docs/MOBILE_ARCHITECTURE.md)
- [Sprint 6.2 frontend](docs/SPRINT6_FRONTEND.md)
- [Sprint 6.1 backend](docs/SPRINT6_BACKEND.md)
- [Sprint 6 architecture lock](docs/SPRINT6_ARCHITECTURE.md)
- [Sprint 5.3 E2E + shared architecture](docs/SPRINT5_E2E_TEST.md)
- [Sprint 5.2 frontend](docs/SPRINT5_FRONTEND.md)
- [Sprint 5.1 backend](docs/SPRINT5_BACKEND.md)
- [Sprint 5 architecture lock](docs/SPRINT5_ARCHITECTURE.md)
- [API](docs/API.md) — đường dẫn giữ tiếng Anh
- [Cơ sở dữ liệu](docs/DATABASE.md)
- [Kiến trúc](docs/ARCHITECTURE.md)
- [Sprint tiếp theo](docs/FUTURE_SPRINTS.md)
