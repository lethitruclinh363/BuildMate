const fs = require('fs');
const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const adminService = require('../services/adminService');
const adminUserService = require('../services/adminUserService');
const catalogService = require('../services/catalogService');
const materialCategoryService = require('../services/material-category.service');
const materialOrderService = require('../services/material-order.service');
const { CATALOG_STATUS } = require('../models/CatalogService');

const stats = asyncHandler(async (_req, res) => {
  const data = await adminService.adminStats();
  return success(res, data, 'Admin stats retrieved');
});

const listCustomers = asyncHandler(async (_req, res) => {
  const data = await adminService.listCustomers();
  return success(res, data, 'Customers retrieved');
});

const listRepairOrders = asyncHandler(async (_req, res) => {
  const data = await adminService.listRepairOrders();
  return success(res, data, 'Repair orders retrieved');
});

const listMaterialOrders = asyncHandler(async (req, res) => {
  const data = await materialOrderService.listAllForAdmin(req.query);
  return success(res, data, 'Material orders retrieved');
});

const getMaterialOrder = asyncHandler(async (req, res) => {
  const data = await materialOrderService.getForAdmin(req.params.id);
  return success(res, data, 'Material order retrieved');
});

const getCustomer = asyncHandler(async (req, res) => {
  const data = await adminService.getCustomer(req.params.id);
  return success(res, data, 'Customer retrieved');
});

const list = asyncHandler(async (req, res) => {
  const data = await adminService.listVerifications(req.query.status);
  return success(res, data, 'Partner applications retrieved');
});

const getOne = asyncHandler(async (req, res) => {
  const data = await adminService.getVerification(req.params.id);
  return success(res, data, 'Application retrieved');
});

const approve = asyncHandler(async (req, res) => {
  const data = await adminService.approve(req.params.id, req.user.id);
  return success(res, data, 'Partner approved');
});

const reject = asyncHandler(async (req, res) => {
  const data = await adminService.reject(req.params.id, req.user.id, req.body.reason);
  return success(res, data, 'Partner rejected');
});

const serveDocument = asyncHandler(async (req, res, next) => {
  const opened = await adminService.openDocumentFile(req.params.id, req.params.documentId, req.user);
  res.setHeader('Content-Type', opened.contentType);
  res.setHeader('Cache-Control', 'private, no-store');
  const stream = fs.createReadStream(opened.full);
  stream.on('error', (err) => {
    if (!res.headersSent) return next(err);
    res.end();
  });
  stream.pipe(res);
});

const auditLogs = asyncHandler(async (req, res) => {
  const data = await adminService.listAudit({
    action: req.query.action,
    limit: req.query.limit,
  });
  return success(res, data, 'Audit logs retrieved');
});

const analytics = asyncHandler(async (_req, res) => {
  const data = await adminService.analytics();
  return success(res, data, 'Analytics retrieved');
});

const financeSummary = asyncHandler(async (_req, res) => {
  const adminFinanceService = require('../services/adminFinanceService');
  const data = await adminFinanceService.buildLedger();
  return success(res, data, 'Mock finance ledger retrieved');
});

const listEscrows = asyncHandler(async (_req, res) => {
  const adminFinanceService = require('../services/adminFinanceService');
  const data = await adminFinanceService.listEscrows();
  return success(res, data, 'Mock escrow register retrieved');
});

const getCommissionRule = asyncHandler(async (_req, res) => {
  const data = await adminService.getCommissionRule();
  return success(res, data, 'Commission rule retrieved');
});

const reviewCatalogService = asyncHandler(async (req, res) => {
  const status = req.body.decision === 'reject' ? CATALOG_STATUS.REJECTED : CATALOG_STATUS.ACTIVE;
  const data = await catalogService.reviewCatalogService(req.params.id, status, req.user.id);
  return success(res, data, status === CATALOG_STATUS.ACTIVE ? 'Custom service approved' : 'Custom service rejected');
});

const listCatalog = asyncHandler(async (req, res) => {
  const data = await catalogService.listForAdmin({
    q: req.query.q,
    category: req.query.category,
    status: req.query.status,
  });
  return success(res, data, 'Service catalog retrieved');
});

const createCatalog = asyncHandler(async (req, res) => {
  const data = await catalogService.createCatalogService({ ...req.body, adminId: req.user.id });
  return success(res, data, 'Service added', 201);
});

const updateCatalog = asyncHandler(async (req, res) => {
  const data = await catalogService.updateCatalogService(req.params.id, req.body);
  return success(res, data, 'Service updated');
});

const listMaterialCategories = asyncHandler(async (_req, res) => {
  const data = await materialCategoryService.listForAdmin();
  return success(res, data, 'Material categories retrieved');
});

const createMaterialCategory = asyncHandler(async (req, res) => {
  const data = await materialCategoryService.createAdminSystemCategory(req.body);
  return success(res, data, 'Material category added', 201);
});

const updateMaterialCategory = asyncHandler(async (req, res) => {
  const data = await materialCategoryService.updateAdminSystemCategory(req.params.id, req.body);
  return success(res, data, 'Material category updated');
});

const reviewMaterialCategory = asyncHandler(async (req, res) => {
  const { decision, reason } = req.body;
  const data = await materialCategoryService.reviewMaterialCategory(req.params.id, decision, req.user.id, reason);
  return success(res, data, `Material category ${decision === 'reject' ? 'rejected' : 'approved'}`);
});

const setCatalogStatus = asyncHandler(async (req, res) => {
  const data = await catalogService.setCatalogStatus(req.params.id, req.body.status);
  return success(res, data, 'Service status updated');
});

const setCommissionRule = asyncHandler(async (req, res) => {
  const data = await adminService.setCommissionRule(req.body, req.user.id);
  return success(res, data, 'Commission rule updated');
});


const listUsers = asyncHandler(async (req, res) => {
  const data = await adminUserService.listUsers(req.query);
  return success(res, data, 'Users retrieved');
});

const getUser = asyncHandler(async (req, res) => {
  const data = await adminUserService.getUser(req.params.id);
  return success(res, data, 'User retrieved');
});

const lockUser = asyncHandler(async (req, res) => {
  const data = await adminUserService.lockUser(req.params.id, req.user.id, req.body?.reason);
  return success(res, data, data.message);
});

const unlockUser = asyncHandler(async (req, res) => {
  const data = await adminUserService.unlockUser(req.params.id, req.user.id, req.body?.reason);
  return success(res, data, data.message);
});

module.exports = {
  listUsers,
  getUser,
  lockUser,
  unlockUser,
  stats,
  listCustomers,
  listRepairOrders,
  listMaterialOrders,
  getMaterialOrder,
  getCustomer,
  list,
  getOne,
  serveDocument,
  approve,
  reject,
  auditLogs,
  analytics,
  financeSummary,
  listEscrows,
  getCommissionRule,
  setCommissionRule,
  reviewCatalogService,
  listCatalog,
  createCatalog,
  updateCatalog,
  setCatalogStatus,
  listMaterialCategories,
  createMaterialCategory,
  updateMaterialCategory,
  reviewMaterialCategory,
};
