const { z } = require('zod');
const { PROGRESS_STATUS } = require('../utils/order.rules');

const progressSchema = z.object({
  status: z.enum(Object.values(PROGRESS_STATUS)),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  images: z.preprocess((value) => {
    if (value == null || value === '') return undefined;
    return Array.isArray(value) ? value : [value];
  }, z.array(z.string()).optional()),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

const cancelOrderSchema = z.object({
  reason: z.string().trim().min(4).max(500).optional().or(z.literal('')),
});

module.exports = { progressSchema, cancelOrderSchema };
