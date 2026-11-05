-- PROPOSAL ONLY. Do not run against production.
-- TASK 05 unmounted material e-commerce at runtime. Historical tables stay
-- because they may hold financial history and FK relations.
-- Risk: DROP would destroy historical material_orders / payments / shipments.
-- Execute only after an explicit archive/export and a dedicated migration review.

-- Suggested later (not executed):
-- DROP TABLE IF EXISTS material_order_status_history;
-- DROP TABLE IF EXISTS material_order_items;
-- DROP TABLE IF EXISTS material_order_payments;
-- DROP TABLE IF EXISTS material_orders;

-- Keep:
-- material_requirement_lists, material_requirement_items, material_quotes,
-- material_quote_items, chat rooms/messages, repair orders, repair payments,
-- escrow, commissions, customers, stores, catalog materials.
