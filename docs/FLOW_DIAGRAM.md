# Flow diagrams — Sprint 5 lock

All six sequences assume JWT already issued. Envelope and auth match [API.md](./API.md).  
Order factory and states: [ORDER_DESIGN.md](./ORDER_DESIGN.md). HTTP: [API_CONTRACT_SPRINT5.md](./API_CONTRACT_SPRINT5.md).

Legend: **solid** = existing Sprint 4; **bold notes** = Sprint 5 additions.

---

## Flow 1 — Customer creates Repair Request

Existing. Unchanged except notifications already fire.

```mermaid
sequenceDiagram
  autonumber
  actor C as Customer
  participant UI as Web
  participant API as Express
  participant DB as MongoDB
  participant S as Socket.IO
  actor K as Contractor

  C->>UI: Explore map, open contractor, Request repair
  UI->>API: POST /repair-requests (multipart)
  API->>API: contractor verified? store LIVE?
  API->>DB: insert repairrequests PENDING
  API->>DB: upsert chatrooms (1:1 requestId)
  API->>DB: insert notifications REQUEST (contractor)
  API->>S: notification:new → contractor
  API-->>UI: 201 { request, roomId }
  UI->>UI: navigate /customer/chat/:roomId
  K->>UI: sees bell + /contractor/requests
```

**Failure:** unverified contractor → `400`; empty title → `422`.  
**No Order** at this step.

---

## Flow 2 — Chat and create Quotation

Existing. Unchanged.

```mermaid
sequenceDiagram
  autonumber
  actor K as Contractor
  actor C as Customer
  participant UI as Web
  participant API as Express
  participant IO as Socket.IO
  participant DB as MongoDB

  K->>UI: open /contractor/chat/:roomId
  UI->>API: GET /chat/rooms/:id/messages
  C->>UI: send photo/text
  UI->>IO: send_message / POST /chat/rooms/:id/messages
  IO->>DB: insert messages
  IO->>IO: receive_message to room
  Note over IO,C: also notification MESSAGE if peer offline

  K->>UI: Create quotation
  UI->>API: POST /quotations { requestId, items, transportCost, estimatedDays }
  API->>DB: insert quotations SENT
  API->>DB: insert messages type QUOTATION
  API->>DB: notify customer QUOTATION
  API->>IO: receive_message + notification:new
  API-->>UI: 201 quotation
  C->>UI: quotation card in thread
```

**Rules:** contractor must own request; items ≥ 1; request not `REJECTED`.  
Multiple `SENT` quotes allowed until one is accepted.

---

## Flow 3 — Accept quotation creates Order

**Sprint 5 extends accept.** This is the architecture hinge.

```mermaid
sequenceDiagram
  autonumber
  actor C as Customer
  participant UI as Web
  participant API as Express
  participant DB as MongoDB
  participant IO as Socket.IO
  actor K as Contractor

  C->>UI: Confirm accept (ConfirmModal)
  UI->>API: PATCH /quotations/:id/accept
  API->>API: customerId match, status SENT
  API->>DB: quotation SENT → ACCEPTED
  API->>DB: other SENT on requestId → REJECTED
  API->>DB: repairrequest → ACCEPTED
  API->>DB: insert orders QUOTATION_ACCEPTED (unique quotationId)
  alt duplicate key
    API->>DB: load existing order
  end
  API->>DB: insert payments UNPAID
  API->>DB: notify contractor ORDER_CREATED + QUOTATION_ACCEPTED
  API->>DB: audit ORDER_CREATED
  API->>IO: notification:new
  API-->>UI: 200 { quotation ACCEPTED, order QUOTATION_ACCEPTED }
  UI->>UI: toast + /customer/orders/:id
  K->>UI: contractor orders board
```

The new order is `QUOTATION_ACCEPTED`. Deposit payment then moves it to `DEPOSIT_PAID`.

---

## Flow 4 — Deposit

```mermaid
sequenceDiagram
  autonumber
  actor C as Customer
  participant API as Express
  participant DB as MongoDB

  C->>API: POST /payments/:id/checkout (type DEPOSIT)
  API->>DB: payment PAID
  API->>DB: Order → DEPOSIT_PAID when still before that step
```

---

## Flow 5 — Contractor progress

```mermaid
sequenceDiagram
  autonumber
  actor K as Contractor
  participant UI as Web
  participant API as Express
  participant DB as MongoDB
  participant IO as Socket.IO
  actor C as Customer

  K->>UI: /contractor/orders/:id progress form
  UI->>API: POST /orders/:id/progress
  API->>API: JWT CONTRACTOR owns the order
  API->>DB: insert progressupdates
  API->>DB: advance order STARTED / IN_PROGRESS / COMPLETED
  API->>DB: notify customer CONTRACTOR_* 
  API->>IO: contractor_accepted_job / contractor_started_job / contractor_updated_progress / contractor_completed_job
  C->>UI: timeline on /customer/orders/:id
```

Progress status: `STARTED` `IN_PROGRESS` `COMPLETED`. Closed after `CUSTOMER_ACCEPTED` or `CANCELLED`.

---

## Flow 6 — Customer acceptance

```mermaid
sequenceDiagram
  autonumber
  actor K as Contractor
  actor C as Customer
  participant API as Express
  participant DB as MongoDB
  participant IO as Socket.IO

  K->>API: POST /orders/:id/progress status COMPLETED
  API->>DB: Order → COMPLETED
  API->>IO: contractor_completed_job
  C->>API: POST /orders/:id/complete
  API->>DB: Order CUSTOMER_ACCEPTED, completedAt
  API->>DB: RepairRequest COMPLETED
  API->>DB: notify contractor ORDER_COMPLETED
  API->>IO: order_completed
```

Reviews are allowed only after `CUSTOMER_ACCEPTED`. Targets are the contractor and, when the order’s store is a material store, that store.

---

## End-to-end

```mermaid
flowchart LR
  A[Customer Request] --> B[Contractor Quotation]
  B --> C[Deposit]
  C --> D[Repair Job]
  D --> E[Contractor Progress Update]
  E --> F[Customer Acceptance]
```

---

## Timing vs collections

| Step | Writes |
| --- | --- |
| Flow 1 | repairrequests, chatrooms, notifications |
| Flow 2 | messages, quotations, notifications |
| Flow 3 | quotations, repairrequests, orders, payments, notifications, auditlogs |
| Flow 4 | payments, orders |
| Flow 5 | progressupdates, orders, notifications |
| Flow 6 | orders, repairrequests, notifications, auditlogs |
