const express = require('express');
<<<<<<< HEAD
const authRoutes = require('./authRoute');
const userRoutes = require('./userRoutes');
const contractorRoutes = require('./contractorRoutes');
const adminAuthRoutes = require('./adminAuthRoutes');
const adminRoutes = require('./adminRoutes');
const locationRoutes = require('./locationRoutes');
const marketplaceRoutes = require('./marketplaceRoutes');
const repairRoutes = require('./repairRoutes');
const chatRoutes = require('./chatRoutes');
const quotationRoutes = require('./quotationRoutes');
const notificationRoutes = require('./notificationRoutes');
const uploadRoutes = require('./uploadRoutes');
const orderRoutes = require('./orderRoutes');
const progressRoutes = require('./progressRoutes');
const paymentRoutes = require('./paymentRoutes');
const reviewRoutes = require('./reviewRoutes');
const complaintRoutes = require('./complaintRoutes');
const materialStoreRoutes = require('./materialStoreRoutes');
const policyRoutes = require('./policyRoutes');
const catalogRoutes = require('./catalogRoutes');
=======
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const contractorRoutes = require('./contractor.routes');
const adminAuthRoutes = require('./adminAuth.routes');
const adminRoutes = require('./admin.routes');
const locationRoutes = require('./location.routes');
const marketplaceRoutes = require('./marketplace.routes');
const repairRoutes = require('./repair.routes');
const chatRoutes = require('./chat.routes');
const quotationRoutes = require('./quotation.routes');
const notificationRoutes = require('./notification.routes');
const uploadRoutes = require('./upload.routes');
const orderRoutes = require('./order.routes');
const progressRoutes = require('./progress.routes');
const paymentRoutes = require('./payment.routes');
const reviewRoutes = require('./review.routes');
const complaintRoutes = require('./complaint.routes');
const materialStoreRoutes = require('./material-store.routes');
const materialCheckoutRoutes = require('./material-checkout.routes');
const materialOrderRoutes = require('./material-order.routes');
const policyRoutes = require('./policy.routes');
const catalogRoutes = require('./catalog.routes');
>>>>>>> origin/Duc

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'BuildMate API is running',
    data: { service: 'buildmate-api', time: new Date().toISOString() },
  });
});

router.use('/policies', policyRoutes);
router.use('/service-catalog', catalogRoutes);
router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/contractor', contractorRoutes);
router.use('/material-store', materialStoreRoutes);
router.use('/material-checkout', materialCheckoutRoutes);
router.use('/material-orders', materialOrderRoutes);
router.use('/admin/auth', adminAuthRoutes);
router.use('/admin', adminRoutes);
router.use('/location', locationRoutes);
router.use('/repair-requests', repairRoutes);
router.use('/chat', chatRoutes);
router.use('/quotations', quotationRoutes);
router.use('/orders', orderRoutes);
router.use('/orders', progressRoutes);
router.use('/payments', paymentRoutes);
router.use('/reviews', reviewRoutes);
router.use('/complaints', complaintRoutes);
router.use('/notifications', notificationRoutes);
router.use('/uploads', uploadRoutes);
router.use('/', marketplaceRoutes);

module.exports = router;
