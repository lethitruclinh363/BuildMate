const express = require('express');
const { ROLES } = require('../models/User');
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { validate } = require('../utils/validator');
const {
  createListSchema,
  itemBody,
  sendListSchema,
  updateListSchema,
  createQuoteSchema,
  fulfillmentSchema,
} = require('../validators/material-requirement.validator');
const controller = require('../controllers/materialRequirementController');

const router = express.Router();

router.post(
  '/',
  authenticate,
  authorize(ROLES.CONTRACTOR),
  validate(createListSchema),
  controller.create
);

router.get(
  '/',
  authenticate,
  authorize(ROLES.CONTRACTOR, ROLES.CUSTOMER, ROLES.MATERIAL_STORE_OWNER),
  controller.mine
);

router.get('/:id', authenticate, controller.getOne);

router.post(
  '/:id/save',
  authenticate,
  authorize(ROLES.CUSTOMER),
  controller.save
);

router.patch(
  '/:id',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(updateListSchema),
  controller.updateSaved
);

router.post(
  '/:id/items',
  authenticate,
  authorize(ROLES.CONTRACTOR),
  validate(itemBody),
  controller.addItem
);

router.patch(
  '/:id/items/:itemId',
  authenticate,
  authorize(ROLES.CONTRACTOR, ROLES.CUSTOMER),
  validate(itemBody),
  controller.updateItem
);

router.delete(
  '/:id/items/:itemId',
  authenticate,
  authorize(ROLES.CONTRACTOR),
  controller.removeItem
);

router.post(
  '/:id/send',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(sendListSchema),
  controller.send
);

router.post(
  '/:id/cancel',
  authenticate,
  authorize(ROLES.CONTRACTOR, ROLES.CUSTOMER, ROLES.MATERIAL_STORE_OWNER),
  controller.cancel
);

router.get(
  '/:id/catalog-matches',
  authenticate,
  authorize(ROLES.CUSTOMER),
  controller.catalog
);

router.get(
  '/:id/eligible-stores',
  authenticate,
  authorize(ROLES.CUSTOMER),
  controller.eligibleStores
);

router.post(
  '/:id/quotes',
  authenticate,
  authorize(ROLES.MATERIAL_STORE_OWNER),
  validate(createQuoteSchema),
  controller.quote
);

router.post(
  '/:id/confirm',
  authenticate,
  authorize(ROLES.CUSTOMER),
  controller.confirm
);

router.post(
  '/:id/reject',
  authenticate,
  authorize(ROLES.CUSTOMER),
  controller.reject
);

router.patch(
  '/:id/fulfillment',
  authenticate,
  authorize(ROLES.MATERIAL_STORE_OWNER),
  validate(fulfillmentSchema),
  controller.fulfill
);

module.exports = router;
