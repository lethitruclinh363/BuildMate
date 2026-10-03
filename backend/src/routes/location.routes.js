const express = require('express');
const { validate } = require('../utils/validator');
const { nearbyQuerySchema, geocodeQuerySchema, reverseQuerySchema } = require('../validators/location.validator');
const locationController = require('../controllers/location.controller');

const router = express.Router();

router.get('/stores/nearby', validate(nearbyQuerySchema, 'query'), locationController.nearbyStores);
router.get('/contractors/nearby', validate(nearbyQuerySchema, 'query'), locationController.nearbyContractors);
router.get('/geocode', validate(geocodeQuerySchema, 'query'), locationController.geocode);
router.get('/reverse', validate(reverseQuerySchema, 'query'), locationController.reverse);

module.exports = router;
