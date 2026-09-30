const { authenticate } = require('../middleware/auth.middleware');
const notificationController = require('../controllers/notification.controller');

const router = require('express').Router();

router.use(authenticate);
router.get('/', notificationController.list);
router.patch('/read-all', notificationController.readAll);
router.patch('/:id/read', notificationController.readOne);

module.exports = router;
