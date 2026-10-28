# PROMPT 20 — Customer ↔ Material Store chat (DEV)

Ngày: 2026-10-26.

**Bản demo PROMPT 17 không bị sửa.** Không commit / push / merge / reset / clean. Không migrate `BuilMate_test` hay database nhóm. Không đụng COD 0%, 15/5/10/85, Escrow.

Worktree phát triển: `D:\Kì 9\BUILDMATE (2)\BUILDMATE-dev-prompt18`  
Nhánh: `prompt-18-mrl`  
HEAD: `cb88441775c4dfcd518a86500cde82cc4672f4ea` (cùng commit với demo; overlay dirty)

---

## 1. Git của hai worktree

| | Demo PROMPT 17 | DEV Prompt 18–20 |
|---|---|---|
| Thư mục | `D:\Kì 9\BUILDMATE (2)\BUILDMATE` | `D:\Kì 9\BUILDMATE (2)\BUILDMATE-dev-prompt18` |
| Branch | `Duc` (ahead 1 so với `origin/Duc`) | `prompt-18-mrl` |
| HEAD | `cb88441775c4dfcd518a86500cde82cc4672f4ea` | `cb88441775c4dfcd518a86500cde82cc4672f4ea` |
| Working tree | dirty sẵn từ Prompt 17; **không** thêm ChatStoreButton / `room_kind` | dirty; thêm chat Customer–Store + SQL 20 |
| `prisma/schema.prisma` demo | `repair_request_id BigInt @unique`, không `room_kind` | `repair_request_id BigInt?`, `store_id`, `room_kind` |
| Prisma client generate | không chạy thành công vào `node_modules` demo (EPERM dll đang dùng bởi :5055) | output **riêng** `backend/prisma/generated/client` |

`backend/node_modules` của DEV là junction sang demo. Prompt 20 **không** ghi đè client Prisma demo: generator DEV trỏ `./generated/client`. File `node_modules/.prisma/client/schema.prisma` demo vẫn `repair_request_id BigInt @unique`. API demo `:5055` health 200 sau generate DEV.

---

## 2. Phân tích Chat Room hiện tại (trước mở rộng)

| Hạng mục | Hiện trạng đã xác minh |
|---|---|
| Tạo room | `createRoomForRequest(request)` upsert theo `requestId` khi Contractor accept |
| Bắt buộc | `customer_user_id`, `contractor_user_id`, `repair_request_id` NOT NULL + UNIQUE |
| Unique | một room / một repair request |
| Thành viên | `customerId` **hoặc** `contractorId` (`assertMember`) |
| senderId | luôn `req.user.id` / `socket.user.id`, không nhận spoof từ body |
| Socket join | JWT + `assertMember` rồi `socket.join(room:${id})` |
| Message | TEXT / IMAGE / VIDEO / LOCATION / QUOTATION; emit `receive_message` |
| Notification | `NOTIFICATION_TYPE.MESSAGE`, link theo role |
| Frontend dùng chung | `ChatPage`, `SocketProvider.useRoomMessages`, `chatApi` |
| `/store/chat/:roomId` | route vỏ; Store Dashboard **không** có mục Tin nhắn trước Prompt 20 |
| Migration chat cũ | Prompt 11: `chat_rooms` + `messages`; không có `store_id` |

Không gắn `repair_request_id` giả cho cửa hàng.

---

## 3. Phương án mở rộng nhỏ nhất

Discriminator `room_kind`:

- `CUSTOMER_CONTRACTOR` — `repair_request_id NOT NULL`, `store_id NULL` (phòng cũ).
- `CUSTOMER_MATERIAL_STORE` — `store_id NOT NULL`, `repair_request_id NULL`.

`contractor_user_id` trên phòng Store = `stores.owner_user_id` (không nhầm Contractor sửa chữa). Unique PostgreSQL:

```sql
UNIQUE (customer_user_id, store_id)
WHERE room_kind = 'CUSTOMER_MATERIAL_STORE' AND store_id IS NOT NULL
```

Chính sách:

- Tạo phòng mới: store `LIVE` + `MATERIALS`/`BOTH`, owner không BLOCKED/BANNED.
- Phòng đã có: mở lại kể cả khi store PAUSED.
- Gửi tin: chặn khi account hoặc store BLOCKED/BANNED; PAUSED vẫn nhắn.
- Không xóa lịch sử khi ngừng bán.
- QUOTATION cấm trên phòng Store (409).
- Không tạo Material Order / Escrow / COD từ chat.

---

## 4. Prisma / bảng / migration DEV

| Thay đổi | Chi tiết |
|---|---|
| `chat_rooms.repair_request_id` | `BigInt?` (nullable) |
| `chat_rooms.store_id` | FK `stores(id)` |
| `chat_rooms.room_kind` | VARCHAR(32) default `CUSTOMER_CONTRACTOR` |
| CHECK | XOR hai kind |
| Unique repair | giữ `@unique` trên `repair_request_id` |
| Unique store pair | partial index `uq_chat_rooms_customer_store` |

SQL: `backend/scripts/dev-db/20-customer-store-chat.sql`  
Apply: `node scripts/dev-db/apply-store-chat.js` với `DEV_DATABASE_URL` port **55433** / `BuilMate_dev` (guard từ chối `BuilMate`, `BuilMate_test`, :55432, :5432).

Kết quả apply:

```
{"db":"BuilMate_dev","roomsBefore":13,"roomsAfter":13,"kinds":[{"room_kind":"CUSTOMER_CONTRACTOR","n":13}]}
```

13 phòng sửa chữa giữ nguyên. Không `db push`, không migrate reset.

Prisma client DEV: `npx prisma generate` → `backend/prisma/generated/client` (`gitignore`). `src/config/prisma.js` require đường dẫn này.

---

## 5. API mới / mở rộng và phân quyền

| Method | Path | Role | Ghi chú |
|---|---|---|---|
| POST | `/api/chat/stores/:storeId/rooms` | CUSTOMER | tạo hoặc tái sử dụng; Guest 401; Contractor 403; store thiếu 404 |
| GET | `/api/chat/rooms` | đã login | Customer: mọi phòng của mình; Contractor: chỉ `CUSTOMER_CONTRACTOR`; Store: chỉ `CUSTOMER_MATERIAL_STORE` |
| GET | `/api/chat/rooms/:roomId` | thành viên | Store/Customer đúng phòng; Contractor 403 trên phòng Store |
| GET/POST | `.../messages` | thành viên | senderId = user JWT |
| POST | `.../media` | thành viên trước upload | `assertMember` rồi `chatUpload` |
| Socket `join_room` | — | JWT + member | Contractor join phòng Store bị từ chối |
| Socket `send_message` | — | JWT | `senderId` từ socket user |

---

## 6. Frontend đã sửa

- `ChatStoreButton` trên `StorePublicPage` (khi bán vật liệu) và `StoreProfileShowcase` (không preview, không owner; ẩn nếu role ≠ CUSTOMER).
- Guest → `/login?next=...` rồi quay lại trang cửa hàng.
- `ExplorePopup` store gọi `chatApi.openStoreRoom`.
- `StoreDashboard` nav **Tin nhắn** → `/store/chat`.
- `App.tsx`: `/customer/chat`, `/customer/chat/:roomId`, `/store/chat`, `/store/chat/:roomId`.
- `ChatPage` inbox khi thiếu `roomId`; ẩn tạo báo giá trên phòng Store; tên/ảnh cửa hàng; placeholder store; chống double-enter; dedupe REST+socket.
- `roleNav` Customer **Tin nhắn**; dashboard Customer trỏ `/customer/chat`.
- Locale `chat.chatStore`, `nav.store.messages`, `notify.titles` MRL; `notificationTitle` không còn trả `—` khi thiếu key.

Sản phẩm công khai chỉ link về cửa hàng (không chat theo từng SKU).

---

## 7. Luồng Customer tạo/mở chat

Login Customer → trang `Demo Can Tho Materials` (`82a98eb32f87abb362a131ba`) → **Chat với cửa hàng** → `POST /chat/stores/:id/rooms` → `/customer/chat/1f9ff6eb9a2000b1c6a87999`. Lần 2 cùng URL. Header **Demo Can Tho Materials**, không hiện SĐT owner trên peer chat.

## 8. Luồng Store nhận/phản hồi

Login Store → **Tin nhắn** → một phòng **Demo Customer**, last message đúng, không lẫn room Repair. Mở `/store/chat/1f9ff6eb9a2000b1c6a87999`, đọc TEXT, trả lời.

---

## 9. Bảng kết quả

STT | Chức năng | Vai trò | Kết quả trước | Thay đổi | Kết quả sau | Loại test | PASS/FAIL/BLOCKED
---|---|---|---|---|---|---|---
1 | Discriminator room | — | Chỉ repair unique | `room_kind` + `store_id` | 13 repair + 1 store | POSTGRESQL | PASS
2 | Unique Customer–Store | Customer | Không có | Partial unique + P2002 reuse | 1 phòng sau click/HTTP/concurrent | HTTP+PG | PASS
3 | POST open store room | Customer | 404/không có | `createRoomForStore` | 200 kind=CUSTOMER_MATERIAL_STORE, tên Demo Can Tho Materials | HTTP | PASS
4 | Reuse room | Customer | — | findFirst rồi unique | cùng id `1f9ff6eb9a2000b1c6a87999` | HTTP+BROWSER | PASS
5 | Guest open/list | Guest | — | `authenticate` | 401 | HTTP | PASS
6 | Contractor tạo/đọc store room | Contractor | — | authorize + list filter + assertMember | 403 open/get/messages; inbox 13 repair, 0 store | HTTP | PASS
7 | Store inbox | Store | Route vỏ | listRooms kind store | 1 phòng Demo Customer | HTTP+BROWSER | PASS
8 | TEXT hai chiều | Customer+Store | Không | sendMessage | 6 hàng `messages` trên BuilMate_dev | HTTP+PG+BROWSER | PASS
9 | Empty TEXT | Customer | validator | 422 | 422 | HTTP | PASS
10 | Spoof senderId | Customer | JWT sender | body senderId bỏ qua | sender = customer | HTTP | PASS
11 | QUOTATION trên store room | Store | — | `quotationAllowed` | 409 | HTTP | PASS
12 | IMAGE/VIDEO/LOCATION UI | cả hai | Chat repair | tái sử dụng ChatPage + `/uploads/chat/` | SOURCE PASS; không browser-upload riêng store | SOURCE | PASS
13 | Socket hai JWT | Customer+Store | — | join + send_message | storeGot + customerGot; contractor join denied | SOCKET | PASS
14 | Browser realtime đồng thời | hai profile | — | một tab Cursor | không chạy | BROWSER | BLOCKED
15 | Notification MESSAGE | cả hai | link contractor | `chatPathForRole` | `/customer/chat/:id` và `/store/chat/:id` | HTTP | PASS
16 | Locale MRL title | Store/Contractor | `—` | `notify.titles` + fallback | key Material requirement/quote có bản dịch | SOURCE | PASS
17 | Browser sequential Customer | Customer | — | ChatStoreButton | mở room, gửi Browser P20, reload còn lịch sử | BROWSER | PASS
18 | Browser sequential Store | Store | — | `/store/chat` | thấy Customer, trả lời, PG 6 msgs | BROWSER | PASS
19 | Chat Customer–Contractor | cả hai | Prompt 11 | không đụng unique repair | 13 phòng, contractor inbox 13, flow-11 48 pass | UNIT+PG | PASS
20 | MRL Prompt 19 | Contractor+Store | PASS | không sửa workflow | GET lists=2 CONFIRMED; COD orders=4 | HTTP+PG | PASS
21 | Finance 15/5/10/85 + COD 0% | — | PASS | không đụng rates | 33/33 finance + source COD | UNIT | PASS
22 | Media chat public URL | — | Prompt 11 `/uploads/chat` công khai | không mở rộng | rủi ro còn (xem §14) | ANALYZE | PASS (documented)
23 | Demo Prompt 17 | — | HEAD Duc | không sửa thư mục demo | HEAD giữ; API 5055 200 | GIT+HTTP | PASS

---

## 10. Socket

Script: `backend/scripts/dev-db/run-prompt20-store-chat-socket.js` (hai JWT, không in token).

```
storeGotCustomerText: true
customerGotStoreReply: true
contractorJoinDenied: true
roomId: 1f9ff6eb9a2000b1c6a87999
```

**PASS SOCKET** hai JWT độc lập. **BLOCKED BROWSER realtime đồng thời** (một profile Cursor).

---

## 11. Notification

- Customer gửi → Store `MESSAGE` link `/store/chat/:roomId`.
- Store gửi → Customer `MESSAGE` link `/customer/chat/:roomId`.
- Không dùng `/contractor/chat` cho Store.
- Click bell dùng `n.link` sẵn có.
- Locale MRL: `Material requirement list` / `Material quote received` / `Material quote confirmed` (vi+en). `notificationTitle` fallback về title gốc nếu i18n trả `—`.

---

## 12. Bảo mật room / media

- Guest 401; Contractor không đọc phòng Store; Store chỉ phòng `CUSTOMER_MATERIAL_STORE` của owner.
- Upload media: `assertMember` trước `chatUpload`.
- Chat media URL vẫn `/uploads/chat/...` **công khai** (Prompt 11). Quyền GET messages **không** bảo vệ file. Không mở rộng public scope. Phương án tương thích: static auth middleware hoặc signed URL — ngoài Prompt 20.
- eKYC/CCCD không đi qua `chatUpload`.
- Prisma generate DEV không đè client demo.

---

## 13. Chống tạo room trùng

- Unique index PostgreSQL + `persistRoom` bắt P2002 rồi trả phòng sẵn có.
- HTTP: open lần 2 + `Promise.all` hai POST → cùng id.
- Browser click Chat lần 2 → cùng `/customer/chat/1f9ff6eb9a2000b1c6a87999`.
- PG `HAVING COUNT(*) > 1` = 0. Store rooms = 1.

Không tuyên bố an toàn đa instance ngoài unique constraint (chưa load-test nhiều Node).

---

## 14. Browser E2E (tuần tự :5178)

Stack: FE 5178, API 5065, PG 55433 `BuilMate_dev`.

1. Customer login → cửa hàng Demo Can Tho Materials → Chat với cửa hàng → room `1f9ff6eb9a2000b1c6a87999`.
2. Gửi `Browser P20: con xi mang 50kg khong?` (DOM + PG).
3. Store login → Tin nhắn → Demo Customer → cùng room; đọc được TEXT; gửi `Browser P20 store: con 50kg, bao nhieu bao?`.
4. Customer reload URL room: cả hai câu còn; click Chat lại: cùng room.

**PASS BROWSER tuần tự.** Không PASS realtime browser đồng thời.

---

## 15. PostgreSQL

| Metric | Giá trị |
|---|---|
| DB | `BuilMate_dev` :55433 |
| Repair rooms | 13 (không đổi kind) |
| Store rooms | 1 |
| Messages phòng store | 6 |
| Pair | store `82a98eb32f87abb362a131ba` / `demo.customer@buildmate.test` |
| material_orders | 4 (không tăng vì chat) |
| material_requirement_lists | 2 CONFIRMED |

---

## 16. Tổng PASS / FAIL / SKIP

| Loại | Kết quả |
|---|---|
| UNIT/SOURCE (`chat-store`, `chat-flow-11`, finance, MRL) | 48 PASS, 2 SKIP (HTTP :5000 / isolated test DB) |
| HTTP DEV :5065 | 31/31 PASS (`run-prompt20-store-chat-http.js`) |
| SOCKET hai JWT | PASS |
| BROWSER tuần tự | PASS |
| BROWSER realtime 2 profile | BLOCKED |
| IMAGE/VIDEO browser store | SKIP (tái sử dụng UI/API repair; không upload file trong E2E này) |
| FAIL | 0 |

Chức năng **IMPLEMENTED (DEV)** với bằng chứng HTTP + PG + browser tuần tự + socket JWT. Không chỉ source.

---

## 17. P0 / P1 / P2 còn lại

| Mức | Mục |
|---|---|
| P1 | Dual-profile browser realtime BLOCKED (tool). Socket JWT đã PASS. |
| P2 | `/uploads/chat` public (Prompt 11). |
| P2 | IMAGE/VIDEO store chưa browser-upload riêng. |
| P2 | Flash ErrorState khi đổi `roomId` lúc inbox→room — đã vá `trackId`/`loading` trên DEV. |
| P2 | Customer inbox trộn phòng Contractor và Store (đúng một hộp thư). |

Không P0.

---

## 18. File đã sửa (DEV)

Backend: `prisma/schema.prisma`, `scripts/dev-db/20-customer-store-chat.sql`, `apply-store-chat.js`, `run-prompt20-store-chat-http.js`, `run-prompt20-store-chat-socket.js`, `src/config/prisma.js`, `controllers/chatController.js`, `routes/chatRoutes.js`, `services/chatService.js`, `models/ChatRoom.js`, `repositories/conversation.postgres.js`, `repositories/offering.postgres.js`, `utils/chat-room.rules.js`, `tests/chat-store.test.js`, `tests/chat-flow-11.test.js`.

Frontend: `App.tsx`, `ChatPage.tsx`, `ChatStoreButton.tsx`, `sprint4.api.ts`, `sprint4.ts`, `StoreDashboard.jsx`, `StorePublicPage.tsx`, `StoreProfileShowcase.tsx`, `ExplorePopup.tsx`, `roleNav.ts`, `CustomerDashboardPage.tsx`, `notificationLabel.ts`, locales `vi/en` `chat.json` + `common.json`.

Docs: báo cáo này; `BUILDMATE-FUNCTION-GAP-ANALYSIS.md`.

---

## 19. Regression Chat Customer–Contractor và MRL

- flow-11: room repair unique nullable, `createRoomForRequest` giữ, ACL, socket join, MESSAGE type, NotificationBell source — PASS.
- Contractor list 13 phòng, không thấy store room.
- MRL GET contractor=2, store=2, statuses CONFIRMED,CONFIRMED.
- COD store orders=4.
- Finance unit 15/5/10/85 + COD 0% PASS.
- Không tạo Escrow/Material Order từ chat.

---

## 20. Demo PROMPT 17

| Kiểm tra | Kết quả |
|---|---|
| HEAD | `cb88441775c4dfcd518a86500cde82cc4672f4ea` nhánh `Duc` |
| Thư mục `BUILDMATE` | không thêm ChatStoreButton / SQL 20 / `room_kind` |
| `BuilMate_test` | không migrate |
| API 5055 | health 200 |
| Prisma demo client | schema chat_rooms cũ |

---

## KẾT LUẬN

- Customer có thể Chat trực tiếp với Material Store trên DEV? **Có.**
- Store có nhận phòng chat mới? **Có** (inbox 1 phòng, đúng Customer).
- Gửi tin hai chiều? **Có** (HTTP + browser + socket).
- Lưu PostgreSQL `BuilMate_dev`? **Có** (1 room, 6 messages).
- Realtime? **PASS SOCKET hai JWT.** **BLOCKED** browser hai profile đồng thời.
- Lịch sử sau refresh? **Có.**
- Tạo trùng phòng? **Không** (unique PG + reuse).
- Phân quyền Customer/Store? **Có** (401/403, contractor không đọc).
- Notification đúng vai trò? **Có** (link `/customer/chat` vs `/store/chat`).
- Chat Customer–Contractor cũ? **Còn** (13 phòng).
- MRL Prompt 19? **Không ảnh hưởng.**
- Demo Prompt 17? **An toàn.**

**IMPLEMENTED (DEV).** Không merge sang demo trong Prompt 20.
