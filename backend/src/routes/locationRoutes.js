const express = require('express');
const { validate } = require('../utils/validator');
const { nearbyQuerySchema } = require('../validators/location.validator');
const locationController = require('../controllers/locationController');

const router = express.Router();

router.get('/stores/nearby', validate(nearbyQuerySchema, 'query'), locationController.nearbyStores);
router.get('/contractors/nearby', validate(nearbyQuerySchema, 'query'), locationController.nearbyContractors);

module.exports = router;
