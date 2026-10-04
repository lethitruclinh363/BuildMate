const express = require('express');
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/authMiddleware');
const { validate } = require('../utils/validator');
const { profileSchema, passwordSchema } = require('../validators/user.validator');
const { userUpload } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.get('/profile', authenticate, userController.getProfile);
router.patch('/profile', authenticate, validate(profileSchema), userController.updateProfile);
router.patch('/password', authenticate, validate(passwordSchema), userController.changePassword);
router.post('/avatar', authenticate, userUpload.single('avatar'), userController.updateAvatar);

module.exports = router;
