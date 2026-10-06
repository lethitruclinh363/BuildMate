const express = require('express');
const featuredProviderController = require('../controllers/featuredProviderController');

const router = express.Router();

router.get('/featured-providers', featuredProviderController.featured);

module.exports = router;
