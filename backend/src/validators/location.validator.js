const { z } = require('zod');

const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(1).max(50).optional().default(5),
  category: z.string().trim().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  storeType: z.enum(['SERVICES', 'MATERIALS', 'BOTH']).optional(),
});

const searchQuerySchema = z.object({
  category: z.string().trim().optional(),
  keyword: z.string().trim().optional(),
  store: z.string().trim().optional(),
});

const autocompleteQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  focusLat: z.coerce.number().min(-90).max(90).optional(),
  focusLng: z.coerce.number().min(-180).max(180).optional(),
});

const placeQuerySchema = z.object({
  refId: z.string().trim().min(3).max(2000),
});

const reverseQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

module.exports = {
  nearbyQuerySchema,
  searchQuerySchema,
  autocompleteQuerySchema,
  placeQuerySchema,
  reverseQuerySchema,
};
