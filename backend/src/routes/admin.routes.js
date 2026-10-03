const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { allowRole } = require('../middleware/role.middleware');
const { validate } = require('../utils/validator');
const { rejectSchema, catalogReviewSchema, catalogWriteSchema, catalogStatusSchema, materialCategoryNameSchema } = require('../validators/partner.validator');
const { refundSchema, complaintPatchSchema, commissionRuleSchema } = require('../validators/finance.validator');
const adminController = require('../controllers/admin.controller');
const paymentController = require('../controllers/payment.controller');
const complaintController = require('../controllers/complaint.controller');

const router = express.Router();
const adminOnly = [authenticate, allowRole('ADMIN')];

router.get('/stats', ...adminOnly, adminController.stats);
router.get('/customers', ...adminOnly, adminController.listCustomers);
router.get('/customers/:id', ...adminOnly, adminController.getCustomer);
router.get('/audit-logs', ...adminOnly, adminController.auditLogs);
router.get('/verifications', ...adminOnly, adminController.list);
router.get('/verifications/:id', ...adminOnly, adminController.getOne);
router.post('/verifications/:id/approve', ...adminOnly, adminController.approve);
router.post('/verifications/:id/reject', ...adminOnly, validate(rejectSchema), adminController.reject);
router.get('/service-catalog', ...adminOnly, adminController.listCatalog);
router.post('/service-catalog', ...adminOnly, validate(catalogWriteSchema), adminController.createCatalog);
router.patch('/service-catalog/:id/status', ...adminOnly, validate(catalogStatusSchema), adminController.setCatalogStatus);
router.patch('/service-catalog/:id', ...adminOnly, validate(catalogWriteSchema), adminController.updateCatalog);
router.post('/service-catalog/:id/review', ...adminOnly, validate(catalogReviewSchema), adminController.reviewCatalogService);
router.get('/material-categories', ...adminOnly, adminController.listMaterialCategories);
router.post('/material-categories', ...adminOnly, validate(materialCategoryNameSchema), adminController.createMaterialCategory);
router.patch('/material-categories/:id', ...adminOnly, validate(materialCategoryNameSchema), adminController.updateMaterialCategory);
router.get('/analytics', ...adminOnly, adminController.analytics);
router.get('/settings/commission', ...adminOnly, adminController.getCommissionRule);
router.patch('/settings/commission', ...adminOnly, validate(commissionRuleSchema), adminController.setCommissionRule);
router.post('/payments/:id/refund', ...adminOnly, validate(refundSchema), paymentController.refund);
router.get('/complaints', ...adminOnly, complaintController.adminList);
router.patch('/complaints/:id', ...adminOnly, validate(complaintPatchSchema), complaintController.adminPatch);

module.exports = router;
