const { z } = require('zod');

const objectId = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const checkoutQuoteSchema = z
  .object({
    storeId: objectId,
    address: z.string().trim().min(4, 'Enter a delivery address').max(240),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    items: z
      .array(
        z
          .object({
            materialId: objectId,
            quantity: z.number().int().min(1).max(10000),
          })
          .strict()
      )
      .min(1)
      .max(40),
  })
  .strict();

module.exports = { checkoutQuoteSchema };
