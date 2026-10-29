const express = require('express');
const { validate } = require('../utils/validator');
const { searchQuerySchema, materialSearchQuerySchema } = require('../validators/location.validator');
const marketplaceController = require('../controllers/marketplaceController');

const router = express.Router();

router.get('/stores/:id', marketplaceController.getStore);
router.get('/contractors/:id', marketplaceController.getContractor);
router.get('/materials/categories', marketplaceController.getMaterialCategories);
router.get('/materials/search', validate(materialSearchQuerySchema, 'query'), marketplaceController.searchMaterials);
router.get('/services/search', validate(searchQuerySchema, 'query'), marketplaceController.searchServices);

module.exports = router;
