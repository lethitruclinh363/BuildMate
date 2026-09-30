# API contract — repair job

Base: `http://localhost:5000/api`  
Auth: `Authorization: Bearer <jwt>`  
Envelope: `{ success, message, data, details }` as in [API.md](./API.md).

Roles: `CUSTOMER`, `CONTRACTOR`, `MATERIAL_STORE_OWNER`, `ADMIN`.

There is no worker assignment API, worker inbox, or roster.

```
Customer Request
    ↓
Contractor Quotation
    ↓
Deposit
    ↓
Repair Job
    ↓
Contractor Progress Update
    ↓
Customer Acceptance
```

## Accept quotation

`PATCH /quotations/:id/accept` — CUSTOMER who owns the quotation, status `SENT`.

Creates the order at `QUOTATION_ACCEPTED`, an `UNPAID` payment, audit `ORDER_CREATED`, and notifies the contractor. A second accept returns the same order. There is no `POST /orders`.

## Orders

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/orders/customer` | CUSTOMER |
| `GET` | `/orders/contractor` | CONTRACTOR |
| `GET` | `/orders/:id` | customer or contractor on the order, or ADMIN |
| `POST` | `/orders/:id/progress` | CONTRACTOR `{ status: STARTED \| IN_PROGRESS \| COMPLETED, description, images[] }` |
| `GET` | `/orders/:id/progress` | parties |
| `POST` | `/orders/:id/complete` | CUSTOMER when status is `COMPLETED` |
| `POST` | `/orders/:id/cancel` | party, only while `QUOTATION_ACCEPTED` or `DEPOSIT_PAID` |

Progress notifies the customer:

| Status | Notification | Socket |
| --- | --- | --- |
| First start | `CONTRACTOR_ACCEPTED_JOB` | `contractor_accepted_job` |
| Later start | `CONTRACTOR_STARTED_JOB` | `contractor_started_job` |
| `IN_PROGRESS` | `CONTRACTOR_UPDATED_PROGRESS` | `contractor_updated_progress` |
| `COMPLETED` | `CONTRACTOR_COMPLETED_JOB` | `contractor_completed_job` |

Customer acceptance sets `CUSTOMER_ACCEPTED`, completes the repair request, and emits `order_completed`.

## Not part of this contract

Worker accounts, worker assignments, worker management, and worker tracking.
