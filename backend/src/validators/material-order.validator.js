const { z } = require('zod');
const { MATERIAL_ORDER_STATUS } = require('../utils/material-order.rules');

const objectId = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const createMaterialOrderSchema = z
  .object({
    storeId: objectId,
    deliveryAddress: z.string().trim().min(4, 'Enter a delivery address').max(240),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    locationConfirmed: z.literal(true),
    locationSource: z.enum(['VIETMAP_PLACE', 'GPS', 'MANUAL_PIN']).optional(),
    providerRefId: z.string().trim().max(2000).optional(),
    customerNote: z.string().trim().max(500).optional().default(''),
    items: z
      .array(
        z
          .object({
            materialId: objectId,
            quantity: z.number().finite().int().min(1).max(10000),
          })
          .strict()
      )
      .min(1)
      .max(40),
  })
  .strict();

const depositCheckoutSchema = z
  .object({
    method: z.enum(['MOCK']).optional(),
  })
  .strict();

const updateMaterialOrderStatusSchema = z
  .object({
    status: z.enum(Object.values(MATERIAL_ORDER_STATUS)),
    note: z.string().trim().max(500).optional().default(''),
  })
  .strict();

const settleRemainingSchema = z
  .object({
    settled: z.literal(true),
  })
  .strict();

module.exports = { createMaterialOrderSchema, updateMaterialOrderStatusSchema, depositCheckoutSchema, settleRemainingSchema };
