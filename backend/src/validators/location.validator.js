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

const materialSearchQuerySchema = z
  .object({
    category: z.string().trim().max(100).optional(),
    categoryId: z.string().trim().max(50).optional(),
    keyword: z.string().trim().max(100).optional(),
    store: z.string().trim().max(50).optional(),
    minPrice: z.coerce.number().finite().min(0, 'Minimum price cannot be negative').max(1_000_000_000).optional(),
    maxPrice: z.coerce.number().finite().min(0, 'Maximum price cannot be negative').max(1_000_000_000).optional(),
    sellingStatus: z.enum(['all', 'selling', 'out', 'paused', 'discontinued']).optional(),
    sortBy: z.enum(['default', 'price_asc', 'price_desc', 'newest']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .refine(
    (data) => {
      if (data.minPrice != null && data.maxPrice != null && !Number.isNaN(data.minPrice) && !Number.isNaN(data.maxPrice)) {
        return data.minPrice <= data.maxPrice;
      }
      return true;
    },
    {
      message: 'Minimum price cannot exceed maximum price',
      path: ['minPrice'],
    }
  );

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
  materialSearchQuerySchema,
  autocompleteQuerySchema,
  placeQuerySchema,
  reverseQuerySchema,
};
