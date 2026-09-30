const express = require('express');
const { validate } = require('../utils/validator');
const { searchQuerySchema } = require('../validators/location.validator');
const marketplaceController = require('../controllers/marketplace.controller');

const router = express.Router();

router.get('/stores/:id', marketplaceController.getStore);
router.get('/contractors/:id', marketplaceController.getContractor);
router.get('/materials/search', validate(searchQuerySchema, 'query'), marketplaceController.searchMaterials);
router.get('/services/search', validate(searchQuerySchema, 'query'), marketplaceController.searchServices);

module.exports = router;
