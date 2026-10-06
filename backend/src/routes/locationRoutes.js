const express = require('express');
const { validate } = require('../utils/validator');
const {
  nearbyQuerySchema,
  autocompleteQuerySchema,
  placeQuerySchema,
  reverseQuerySchema,
} = require('../validators/location.validator');
const locationController = require('../controllers/locationController');

const router = express.Router();

router.get('/stores/nearby', validate(nearbyQuerySchema, 'query'), locationController.nearbyStores);
router.get('/contractors/nearby', validate(nearbyQuerySchema, 'query'), locationController.nearbyContractors);
router.get('/autocomplete', validate(autocompleteQuerySchema, 'query'), locationController.autocomplete);
router.get('/place', validate(placeQuerySchema, 'query'), locationController.place);
router.get('/reverse', validate(reverseQuerySchema, 'query'), locationController.reverse);

module.exports = router;
