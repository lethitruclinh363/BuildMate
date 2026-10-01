const express = require('express');
const catalogService = require('../services/catalog.service');
const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const data = await catalogService.listActive();
    return success(res, data, 'Service catalog retrieved');
  })
);

module.exports = router;
