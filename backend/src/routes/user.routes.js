const express = require('express');
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validate } = require('../utils/validator');
const { profileSchema, passwordSchema } = require('../validators/user.validator');
const { userUpload } = require('../middleware/upload.middleware');

const router = express.Router();

router.get('/profile', authenticate, userController.getProfile);
router.patch('/profile', authenticate, validate(profileSchema), userController.updateProfile);
router.patch('/password', authenticate, validate(passwordSchema), userController.changePassword);
router.post('/avatar', authenticate, userUpload.single('avatar'), userController.updateAvatar);

module.exports = router;
