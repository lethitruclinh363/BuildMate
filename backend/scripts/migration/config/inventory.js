/**
 * Business source of truth: Mongoose models in backend/src/models.
 * PostgreSQL public schema is the migration destination. This file only
 * names what preflight must see. It does not create or alter tables.
 */

const MONGO_MODELS = [
  { model: 'User', collection: 'users', refs: [] },
  { model: 'Store', collection: 'stores', refs: ['User'] },
  { model: 'ContractorProfile', collection: 'contractorprofiles', refs: ['User'] },
  { model: 'ContractorEkycVerification', collection: 'contractorekycverifications', refs: ['ContractorProfile', 'User'] },
  { model: 'CatalogService', collection: 'catalogservices', refs: ['User'] },
  { model: 'ServiceSuggestion', collection: 'servicesuggestions', refs: ['User', 'ContractorProfile', 'CatalogService'] },
  { model: 'Service', collection: 'services', refs: ['Store', 'User'] },
  { model: 'MaterialCategory', collection: 'materialcategories', refs: ['User', 'Store'] },
  { model: 'Material', collection: 'materials', refs: ['Store'] },
  { model: 'RepairRequest', collection: 'repairrequests', refs: ['User', 'Store'] },
  { model: 'ChatRoom', collection: 'chatrooms', refs: ['User', 'RepairRequest'] },
  { model: 'Quotation', collection: 'quotations', refs: ['RepairRequest', 'User', 'ChatRoom'] },
  { model: 'Message', collection: 'messages', refs: ['ChatRoom', 'User', 'Quotation'] },
  { model: 'Order', collection: 'orders', refs: ['Quotation', 'RepairRequest', 'User', 'Store'] },
  { model: 'ProgressUpdate', collection: 'progressupdates', refs: ['Order', 'User'] },
  { model: 'Payment', collection: 'payments', refs: ['Order', 'User'] },
  { model: 'Commission', collection: 'commissions', refs: ['Payment', 'Order', 'User'] },
  { model: 'CommissionRule', collection: 'commissionrules', refs: [] },
  { model: 'MaterialOrder', collection: 'materialOrders', refs: ['Material', 'User', 'Store'] },
  { model: 'MaterialOrderPayment', collection: 'materialOrderPayments', refs: ['MaterialOrder', 'User'] },
  { model: 'MaterialCommission', collection: 'materialCommissions', refs: ['MaterialOrderPayment', 'MaterialOrder', 'User'] },
  { model: 'Review', collection: 'reviews', refs: ['Order', 'User'] },
  { model: 'Complaint', collection: 'complaints', refs: ['Order', 'User'] },
  { model: 'Notification', collection: 'notifications', refs: ['User'] },
  { model: 'Policy', collection: 'policies', refs: ['User'] },
  { model: 'PolicyRevision', collection: 'policyrevisions', refs: ['Policy', 'User'] },
  { model: 'AuditLog', collection: 'auditlogs', refs: ['User'] },
  { model: 'LocationCorrection', collection: 'locationcorrections', refs: [] },
];

const REQUIRED_ROLES = ['ADMIN', 'CUSTOMER', 'CONTRACTOR', 'MATERIAL_STORE_OWNER'];

/**
 * Tables already referenced by the Phase 1 SQL in this repo.
 * The other public tables are discovered live. Do not invent or create them here.
 */
const REQUIRED_TABLES = ['roles', 'locations', 'users'];

const EXPECTED_PUBLIC_TABLE_COUNT = 55;
const EXPECTED_DATABASE = 'BuilMate';
const EXPECTED_SCHEMA = 'public';

module.exports = {
  MONGO_MODELS,
  REQUIRED_ROLES,
  REQUIRED_TABLES,
  EXPECTED_PUBLIC_TABLE_COUNT,
  EXPECTED_DATABASE,
  EXPECTED_SCHEMA,
};
