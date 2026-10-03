const { authenticate } = require('../middleware/authMiddleware');
const { chatUpload } = require('../middleware/uploadMiddleware');
const { validate } = require('../utils/validator');
const { sendMessageSchema } = require('../validators/sprint4.validator');
const chatController = require('../controllers/chatController');

const router = require('express').Router();

router.use(authenticate);
router.get('/rooms', chatController.rooms);
router.get('/rooms/:roomId', chatController.getRoom);
router.get('/rooms/:roomId/messages', chatController.messages);
router.post('/rooms/:roomId/messages', validate(sendMessageSchema), chatController.send);
router.post('/rooms/:roomId/media', chatUpload.single('file'), chatController.upload);

module.exports = router;
