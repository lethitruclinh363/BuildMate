# Sprint 5.2 — Repair job frontend

Status: **implemented**. The contractor updates the job. There is no Worker screen.

## Routes

| Role | Path | Screen |
| --- | --- | --- |
| CUSTOMER | `/customer/orders` | Order list + filters |
| CUSTOMER | `/customer/orders/:id` | Timeline, progress, customer acceptance |
| CONTRACTOR | `/contractor/orders` | Repair jobs |
| CONTRACTOR | `/contractor/orders/:id` | Accept job and post progress |

## Feature modules

```
src/features/
  orders/     types, API, hooks, cards, timeline, detail, realtime
  progress/   progress form on the contractor order page
```

Pages stay under `src/pages/{customer,contractor}/*`.

## API mapping

| UI action | Endpoint |
| --- | --- |
| Customer list | `GET /api/orders/customer` |
| Contractor list | `GET /api/orders/contractor` |
| Detail | `GET /api/orders/:id` + `GET /api/orders/:id/progress` |
| Progress | `POST /api/orders/:id/progress` |
| Customer acceptance | `POST /api/orders/:id/complete` |
| Cancel | `POST /api/orders/:id/cancel` |

## Status copy

| Enum | VI | EN |
| --- | --- | --- |
| QUOTATION_ACCEPTED | Đã chấp nhận báo giá | Quotation accepted |
| DEPOSIT_PAID | Đã đặt cọc | Deposit paid |
| STARTED | Đã bắt đầu | Started |
| IN_PROGRESS | Đang thi công | In progress |
| COMPLETED | Nhà thầu đã hoàn thành | Contractor finished |
| CUSTOMER_ACCEPTED | Khách đã nghiệm thu | Customer accepted |
| CANCELLED | Đã hủy | Cancelled |

Legacy worker status codes, if a stored document still has them, display as in progress. The UI does not show a Worker label.

## Realtime

`OrderRealtimeListener` listens for `order_created`, `order_completed`, `contractor_accepted_job`, `contractor_started_job`, `contractor_updated_progress`, and `contractor_completed_job`. Toast fires; lists refetch via the order live store.

## Demo flow

1. Customer `customer@buildmate.vn` opens the bathroom-leak repair job.
2. Contractor `anphu@buildmate.vn` accepts the job and posts progress.
3. Customer accepts the job after the contractor marks it `COMPLETED`.

```
Customer Request → Contractor Quotation → Deposit → Repair Job → Contractor Progress Update → Customer Acceptance
```
