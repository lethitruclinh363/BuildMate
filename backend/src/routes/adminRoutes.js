const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { allowRole } = require('../middleware/roleMiddleware');
const { validate } = require('../utils/validator');
const {
  rejectSchema,
  catalogReviewSchema,
  catalogWriteSchema,
  catalogStatusSchema,
  materialCategoryNameSchema,
  locationChangeRejectSchema,
  locationChangeApproveSchema,
} = require('../validators/partner.validator');
const { refundSchema, complaintPatchSchema, commissionRuleSchema } = require('../validators/finance.validator');
const { adminListUsersQuerySchema, adminLockUserSchema, adminUnlockUserSchema } = require('../validators/adminUser.validator');
const adminController = require('../controllers/adminController');
const contractorEkycController = require('../controllers/contractorEkycController');
const paymentController = require('../controllers/paymentController');
const complaintController = require('../controllers/complaintController');
const orderController = require('../controllers/orderController');
const locationChangeController = require('../controllers/locationChange.controller');

const router = express.Router();
const adminOnly = [authenticate, allowRole('ADMIN')];

router.get('/stats', ...adminOnly, adminController.stats);
router.get('/customers', ...adminOnly, adminController.listCustomers);
router.get('/users', ...adminOnly, adminController.listUsers);
router.get('/users/:id', ...adminOnly, adminController.getUser);
router.post('/users/:id/lock', ...adminOnly, validate(adminLockUserSchema), adminController.lockUser);
router.post('/users/:id/unlock', ...adminOnly, validate(adminUnlockUserSchema), adminController.unlockUser);

router.get('/customers/:id', ...adminOnly, adminController.getCustomer);
router.get('/orders', ...adminOnly, adminController.listRepairOrders);
router.get('/material-orders', ...adminOnly, adminController.listMaterialOrders);
router.get('/material-orders/:id', ...adminOnly, adminController.getMaterialOrder);
router.get('/audit-logs', ...adminOnly, adminController.auditLogs);
router.get('/verifications', ...adminOnly, adminController.list);
router.get('/verifications/:id', ...adminOnly, adminController.getOne);
router.post('/verifications/:id/approve', ...adminOnly, adminController.approve);
router.post('/verifications/:id/reject', ...adminOnly, validate(rejectSchema), adminController.reject);
router.get('/location-change-requests', ...adminOnly, locationChangeController.adminListRequests);
router.get('/location-change-requests/:id', ...adminOnly, locationChangeController.adminGetRequest);
router.post(
  '/location-change-requests/:id/approve',
  ...adminOnly,
  validate(locationChangeApproveSchema),
  locationChangeController.adminApproveRequest
);
router.post(
  '/location-change-requests/:id/reject',
  ...adminOnly,
  validate(locationChangeRejectSchema),
  locationChangeController.adminRejectRequest
);
router.get(
  '/verifications/:id/documents/:documentId/file',
  ...adminOnly,
  adminController.serveDocument
);
router.get('/verifications/:id/ekyc/files/:kind', ...adminOnly, contractorEkycController.adminFile);
router.post('/verifications/:id/ekyc/retake', ...adminOnly, validate(rejectSchema), contractorEkycController.retake);
router.get('/service-catalog', ...adminOnly, adminController.listCatalog);
router.post('/service-catalog', ...adminOnly, validate(catalogWriteSchema), adminController.createCatalog);
router.patch('/service-catalog/:id/status', ...adminOnly, validate(catalogStatusSchema), adminController.setCatalogStatus);
router.patch('/service-catalog/:id', ...adminOnly, validate(catalogWriteSchema), adminController.updateCatalog);
router.post('/service-catalog/:id/review', ...adminOnly, validate(catalogReviewSchema), adminController.reviewCatalogService);
router.get('/material-categories', ...adminOnly, adminController.listMaterialCategories);
router.post('/material-categories', ...adminOnly, validate(materialCategoryNameSchema), adminController.createMaterialCategory);
router.patch('/material-categories/:id', ...adminOnly, validate(materialCategoryNameSchema), adminController.updateMaterialCategory);
router.post('/material-categories/:id/review', ...adminOnly, validate(catalogReviewSchema), adminController.reviewMaterialCategory);
router.get('/analytics', ...adminOnly, adminController.analytics);
router.get('/finance/summary', ...adminOnly, adminController.financeSummary);
router.get('/finance/escrow', ...adminOnly, adminController.listEscrows);
router.get('/settings/commission', ...adminOnly, adminController.getCommissionRule);
router.patch('/settings/commission', ...adminOnly, validate(commissionRuleSchema), adminController.setCommissionRule);
router.post('/payments/:id/refund', ...adminOnly, validate(refundSchema), paymentController.refund);
router.post('/orders/:id/escrow/settle', ...adminOnly, orderController.settleEscrow);
router.post('/orders/:id/escrow/refund', ...adminOnly, validate(refundSchema), orderController.adminRefundEscrow);
router.get('/complaints', ...adminOnly, complaintController.adminList);
router.patch('/complaints/:id', ...adminOnly, validate(complaintPatchSchema), complaintController.adminPatch);

module.exports = router;
