const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { ROLES } = require('../models/User');
const { chatUpload } = require('../middleware/uploadMiddleware');
const { asyncHandler } = require('../utils/asyncHandler');
const { validate } = require('../utils/validator');
const { sendMessageSchema } = require('../validators/sprint4.validator');
const chatController = require('../controllers/chatController');
const chatService = require('../services/chatService');

const router = require('express').Router();

router.use(authenticate);
router.get('/rooms', chatController.rooms);
router.post('/stores/:storeId/rooms', authorize(ROLES.CUSTOMER), chatController.openStore);
router.get('/rooms/:roomId', chatController.getRoom);
router.get('/rooms/:roomId/messages', chatController.messages);
router.post('/rooms/:roomId/messages', validate(sendMessageSchema), chatController.send);
router.post(
  '/rooms/:roomId/media',
  asyncHandler(async (req, _res, next) => {
    await chatService.assertMember(req.params.roomId, req.user.id);
    next();
  }),
  chatUpload.single('file'),
  chatController.upload
);

module.exports = router;
