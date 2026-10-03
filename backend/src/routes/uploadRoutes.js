const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { UPLOAD_SCOPES, uploaderFor } = require('../middleware/uploadMiddleware');
const { ApiError } = require('../utils/ApiError');
const uploadController = require('../controllers/uploadController');

const router = express.Router();

router.post('/:scope', authenticate, (req, res, next) => {
  if (!UPLOAD_SCOPES[req.params.scope]) {
    return next(new ApiError(400, 'Unknown upload scope'));
  }
  return uploaderFor(req.params.scope).single('file')(req, res, next);
}, uploadController.create);

module.exports = router;
