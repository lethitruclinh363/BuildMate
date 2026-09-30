# Deployment — BuildMate

Sprint 4.5 là **production-ready foundation**: auth, marketplace, chat, quotation, upload, audit. Thanh toán và tiến độ nhà thầu nằm ở các sprint sau.

## Môi trường

| Biến | Ví dụ | Bắt buộc |
| --- | --- | --- |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/buildmate` | Có |
| `JWT_SECRET` | ≥ 32 ký tự ngẫu nhiên | Có |
| `JWT_EXPIRES_IN` | `7d` | Không |
| `CLIENT_URL` | `https://app.example.com` (CSV nếu nhiều origin) | Có trên prod |
| `PORT` | `5000` | Không |
| `NODE_ENV` | `production` | Prod |
| `UPLOAD_DIR` | `uploads` | Không |
| `MAX_FILE_SIZE_MB` | `8` | Không |
| `VITE_API_URL` | `https://api.example.com/api` | Frontend build |

## Local

```bash
cd deployment && docker compose up -d
cd backend && copy .env.example .env && npm install && npm run seed && npm run dev
cd frontend && copy .env.example .env && npm install && npm run dev
```

## Build

```bash
cd frontend && npm run build
cd backend && npm test && npm start
```

Frontend `dist/` phục vụ bằng Nginx. Proxy:

- `/api` → Node `:5000`
- `/uploads` → Node (static) hoặc object storage sau này
- `/socket.io` → Node, **WebSocket nâng cấp bắt buộc**

## Checklist production

1. `JWT_SECRET` dài, không commit.
2. MongoDB có auth + backup.
3. HTTPS everywhere; `CLIENT_URL` khớp origin frontend.
4. Thư mục `uploads/` ghi được, không list directory.
5. Rate limit auth 40 / 15 phút; API 400 / 15 phút.
6. `NODE_ENV=production` ẩn stack 500.
7. Reverse proxy `trust proxy` (app đã `trust proxy = 1`).
8. Không mở CORS `*`.
9. Seed **không** chạy trên production thật — chỉ staging demo.

## Docker (Mongo)

`deployment/docker-compose.yml` chạy MongoDB 7. API và web deploy riêng (VM hoặc PaaS).

## Health

`GET /api/health` → `{ success: true }`.

## Sprint 5 trở đi

Order, payment, contractor progress photos (`uploads/progress` đã dành sẵn).
