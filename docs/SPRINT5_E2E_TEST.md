# Sprint 5.3 — E2E workflow validation

Automated coverage for quotation → repair job → contractor progress → customer acceptance. No Worker role.

## How to run

```bash
cd backend && npm test
cd frontend && npm run build
```

Backend uses `node --test --test-concurrency=1` so Mongo suites do not race.

## Coverage

| Scenario | File |
| --- | --- |
| Accept quote → one order, one payment, `ORDER_CREATED` | `edge-orders.test.js`, `order-flow.test.js` |
| Contractor progress maps to `CONTRACTOR_ACCEPTED_JOB`, `CONTRACTOR_UPDATED_PROGRESS`, `CONTRACTOR_COMPLETED_JOB` | `e2e-workflow.test.js`, `contractor-notice.test.js` |
| Extra progress after customer acceptance → 409 | `edge-orders.test.js` |
| Customer cannot accept before the job is `COMPLETED` | `edge-orders.test.js` |
| Stranger `GET /orders/:id` → 403 | `edge-orders.test.js` |

Chat socket events are unchanged: `join_room`, `send_message`, `receive_message`, `typing`, `user_online`.

## Job socket chain

| Event | Meaning |
| --- | --- |
| `order_created` | Quotation accepted; repair job exists |
| `contractor_accepted_job` | Contractor accepted the job |
| `contractor_started_job` | Contractor started work |
| `contractor_updated_progress` | Contractor posted an in-progress update |
| `contractor_completed_job` | Contractor marked the job finished |
| `order_completed` | Customer accepted the finished job |

## Demo

Seed: `cd backend && npm run seed`.

1. **Customer** `customer@buildmate.vn` / `Demo@1234` → bathroom leak job with An Phu.
2. **Contractor** `anphu@buildmate.vn` → accept and post progress.
3. **Material store** `materials@buildmate.vn` → Can Tho Materials catalog.
4. Customer accepts after the contractor marks the job finished.
