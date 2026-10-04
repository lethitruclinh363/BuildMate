const { authenticate } = require('../middleware/authMiddleware');
const { allowRole, authorize } = require('../middleware/roleMiddleware');
const { validate } = require('../utils/validator');
const { cancelOrderSchema } = require('../validators/order.validator');
const orderController = require('../controllers/orderController');

const router = require('express').Router();

router.use(authenticate);

router.get('/customer', allowRole('CUSTOMER'), orderController.listCustomer);
router.get('/contractor', authorize('CONTRACTOR'), orderController.listContractor);
router.post('/:id/complete', allowRole('CUSTOMER'), orderController.complete);
router.post('/:id/cancel', validate(cancelOrderSchema), orderController.cancel);
router.get('/:id', orderController.getOne);

module.exports = router;
