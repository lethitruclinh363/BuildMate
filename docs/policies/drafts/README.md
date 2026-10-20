# Policy drafts — NOT PUBLISHED

These files are thesis drafts for PAYMENT, REFUND, and MATERIAL STORE.

- `policy_version`: `2.0-DRAFT`
- `effective_date`: unset until the product owner confirms
- Do **not** insert or overwrite `policies` rows on BuilMate
- Customer-cancel 5%/10% allocation after a valid forfeit is **PENDING_ADVISOR_CONFIRMATION**
- Legal review is required before any real-money use

`backend/src/services/policyDefaults.js` is updated for empty-database seed only (`ensureDefaultPolicies` inserts when the table is empty). Existing ACTIVE rows are left unchanged.
