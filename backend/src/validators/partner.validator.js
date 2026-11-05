const { z } = require('zod');
const { finiteNumber } = require('../utils/validator');
const { SERVICE_CATEGORIES } = require('../models/Service');
const { MATERIAL_CATEGORIES } = require('../models/Material');
const {
  isSystemService,
  findSystemService,
  normalizeServiceName,
  isCategory,
} = require('../constants/contractorServices');

const weeklyDaySchema = z.object({
  weekday: z.number().int().min(1).max(7).optional(),
  dayOfWeek: z.number().int().min(1).max(7).optional(),
  day: z.number().int().min(1).max(7).optional(),
  closed: z.boolean().optional(),
  isOpen: z.boolean().optional(),
  open: z.union([z.string().max(8), z.null()]).optional(),
  close: z.union([z.string().max(8), z.null()]).optional(),
  openTime: z.union([z.string().max(8), z.null()]).optional(),
  closeTime: z.union([z.string().max(8), z.null()]).optional(),
});

const weeklyHoursSchema = z
  .union([
    z.array(weeklyDaySchema).length(7),
    z.object({
      configured: z.boolean().optional(),
      days: z.array(weeklyDaySchema).length(7).optional(),
      operatingHours: z.array(weeklyDaySchema).length(7).optional(),
    }),
  ])
  .nullable()
  .optional();

const operatingHoursSchema = z.array(weeklyDaySchema).length(7).optional();

const contactPhoneSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    if (!value) return;
    if (!/^\d+$/.test(value) || value.length !== 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: /^\d*$/.test(value) ? 'Please enter a valid 10-digit phone number' : 'Invalid phone number',
      });
      return;
    }
    if (!/^(03|05|07|08|09)\d{8}$/.test(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid phone number' });
    }
  });

const latitudeSchema = z.coerce
  .number()
  .refine((v) => Number.isFinite(v) && !Number.isNaN(v), 'Latitude must be a valid number')
  .refine((v) => v >= -90 && v <= 90, 'Latitude must be between -90 and 90');

const longitudeSchema = z.coerce
  .number()
  .refine((v) => Number.isFinite(v) && !Number.isNaN(v), 'Longitude must be a valid number')
  .refine((v) => v >= -180 && v <= 180, 'Longitude must be between -180 and 180');

const profileSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name is required').max(100),
  representativeName: z.string().trim().max(100).optional().or(z.literal('')),
  contactPhone: contactPhoneSchema.optional().or(z.literal('')),
  contactEmail: z.union([z.literal(''), z.string().trim().email('Enter a valid email').max(120)]).optional(),
  workerCount: finiteNumber().int().min(1).max(500).optional(),
  taxCode: z.string().trim().max(30).optional().or(z.literal('')),
  address: z.union([z.literal(''), z.string().trim().min(4, 'Address is required').max(200)]).optional(),
  city: z.string().trim().max(80).optional(),
  lat: latitudeSchema.nullable().optional(),
  lng: longitudeSchema.nullable().optional(),
  latitude: latitudeSchema.nullable().optional(),
  longitude: longitudeSchema.nullable().optional(),
  locationConfirmed: z.boolean().optional(),
  locationSource: z.enum(['VIETMAP_PLACE', 'GPS', 'MANUAL_PIN']).optional().or(z.literal('')).or(z.null()),
  providerRefId: z.string().trim().max(2000).optional().or(z.literal('')).or(z.null()),
  description: z.string().trim().max(1200).optional().or(z.literal('')),
  yearsExperience: finiteNumber().min(0).max(80).optional(),
  weeklyHours: weeklyHoursSchema,
  serviceAreas: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  materialCategories: z
    .array(
      z.object({
        name: z.string().trim().min(1, 'Please enter a category name.').max(80),
        type: z.enum(['SYSTEM', 'CUSTOM']).optional(),
        categoryId: z.union([z.string().trim().max(40), z.null()]).optional(),
        status: z.enum(['APPROVED', 'PENDING_APPROVAL', 'REJECTED']).optional(),
      })
    )
    .max(12)
    .optional(),
  completedSteps: z.array(z.boolean()).length(6).optional(),
  services: z
    .array(
      z.object({
        category: z.string().trim().max(40).optional().or(z.literal('')),
        name: z.string().trim().min(1, 'Enter a service name').max(80),
        type: z.enum(['SYSTEM', 'CUSTOM']).optional(),
        serviceId: z.union([z.string().trim().max(120), z.null()]).optional(),
        status: z.enum(['APPROVED', 'PENDING_APPROVAL', 'REJECTED']).optional(),
      })
    )
    .max(40)
    .optional()
    .superRefine((items, ctx) => {
      if (!items) return;
      const seen = new Set();
      items.forEach((item, index) => {
        const type = item.type === 'CUSTOM' ? 'CUSTOM' : 'SYSTEM';
        const name = item.name.trim();
        if (!name) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a service name', path: [index, 'name'] });
          return;
        }
        const system = findSystemService(name);
        if (type === 'CUSTOM') {
          if (system) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'This service already exists in the BuildMate catalog.',
              path: [index, 'name'],
            });
            return;
          }
          const key = `custom:${normalizeServiceName(name)}`;
          if (seen.has(key)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'This service is already added.', path: [index, 'name'] });
            return;
          }
          seen.add(key);
          if (item.category && item.category !== 'Custom' && !isCategory(item.category)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose a service category.', path: [index, 'category'] });
          }
          return;
        }
        if (!isSystemService(item.category, name) && !(system && system.category === item.category && system.name === name)) {
          if (!item.serviceId) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select a valid service', path: [index] });
            return;
          }
        }
        const key = item.serviceId || `${item.category}::${name}`;
        if (seen.has(key)) return;
        seen.add(key);
      });
    }),
}).superRefine((data, ctx) => {
  const lat = data.lat !== undefined ? data.lat : data.latitude;
  const lng = data.lng !== undefined ? data.lng : data.longitude;
  if (data.locationConfirmed && lat === 0 && lng === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Coordinates (0, 0) cannot be used as a valid confirmed location',
      path: ['lat'],
    });
  }
});

const portfolioSlotSchema = z.object({
  slot: z.enum(['avatar', 'teamLogo', 'workshop', 'construction', 'certificate']),
});

const portfolioRemoveSchema = portfolioSlotSchema.extend({
  url: z.string().trim().min(1).max(500),
});

const portfolioProjectSchema = z.object({
  serviceId: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
});

const projectImageRemoveSchema = z.object({
  url: z.string().trim().min(1).max(500),
});

const documentTypeSchema = z.object({
  type: z.enum(['BUSINESS_LICENSE', 'CERTIFICATE', 'CCCD_FRONT', 'CCCD_BACK', 'ID_CARD', 'STORE_IMAGE', 'PORTFOLIO']),
});

const publicProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  slogan: z.string().trim().max(140).optional().or(z.literal('')),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  avatar: z.string().trim().max(500).optional().or(z.literal('')),
  logo: z.string().trim().max(500).optional().or(z.literal('')),
  coverImage: z.string().trim().max(500).optional().or(z.literal('')),
  gallery: z.array(z.string().max(500)).max(8).optional(),
  crewPhotos: z.array(z.string().max(500)).max(8).optional(),
  publicCertificates: z.array(z.string().max(500)).max(8).optional(),
  serviceAreas: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  openingHours: z.string().trim().max(200).optional().or(z.literal('')),
  weeklyHours: weeklyHoursSchema,
  operatingHours: operatingHoursSchema,
  achievements: z.string().trim().max(500).optional().or(z.literal('')),
  yearsExperience: finiteNumber().min(0).max(80).optional(),
  workerCount: finiteNumber().int().min(0).max(500).optional(),
}).strict();

const storePublicProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  slogan: z.string().trim().max(140).optional().or(z.literal('')),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  contactName: z.string().trim().max(80).optional().or(z.literal('')),
  contactEmail: z.string().trim().max(120).optional().or(z.literal('')),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  avatar: z.string().trim().max(500).optional().or(z.literal('')),
  logo: z.string().trim().max(500).optional().or(z.literal('')),
  coverImage: z.string().trim().max(500).optional().or(z.literal('')),
  gallery: z.array(z.string().max(500)).max(12).optional(),
  serviceAreas: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  openingHours: z.string().trim().max(200).optional().or(z.literal('')),
  weeklyHours: weeklyHoursSchema,
  operatingHours: operatingHoursSchema,
  showroomNote: z.string().trim().max(500).optional().or(z.literal('')),
  deliveryNote: z.string().trim().max(500).optional().or(z.literal('')),
  serviceRadiusKm: finiteNumber().min(1).max(50).optional(),
}).strict();

const verificationChangeSchema = z.object({
  note: z.string().trim().min(8).max(500),
}).strict();

const storeBaseSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slogan: z.string().trim().max(140).optional().or(z.literal('')),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  address: z.string().trim().min(4).max(200),
  city: z.string().trim().max(80).optional(),
  storeType: z.enum(['SERVICES', 'MATERIALS', 'BOTH']).optional(),
  coverImage: z.string().trim().optional().or(z.literal('')),
  gallery: z.array(z.string()).max(8).optional(),
  openingHours: z.string().trim().max(80).optional(),
  serviceRadiusKm: finiteNumber().min(1).max(50).optional(),
  deliveryEnabled: z.boolean().optional(),
  baseDeliveryFee: finiteNumber().min(0).optional(),
  freeDeliveryRadiusKm: finiteNumber().min(0).max(50).optional(),
  deliveryFeePerKm: finiteNumber().min(0).optional(),
  minimumOrderAmount: finiteNumber().min(0).optional(),
  deliveryNote: z.string().trim().max(500).optional().or(z.literal('')),
  category: z.string().trim().max(80).optional(),
  lng: longitudeSchema.nullable().optional(),
  lat: latitudeSchema.nullable().optional(),
  longitude: longitudeSchema.nullable().optional(),
  latitude: latitudeSchema.nullable().optional(),
  locationConfirmed: z.boolean().optional(),
  locationSource: z.enum(['VIETMAP_PLACE', 'GPS', 'MANUAL_PIN']).optional().or(z.literal('')).or(z.null()),
  providerRefId: z.string().trim().max(2000).optional().or(z.literal('')).or(z.null()),
});

const withStoreLocationGuard = (schema) =>
  schema.superRefine((data, ctx) => {
    const lat = data.lat !== undefined ? data.lat : data.latitude;
    const lng = data.lng !== undefined ? data.lng : data.longitude;
    if (data.locationConfirmed && lat === 0 && lng === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Coordinates (0, 0) cannot be used as a valid confirmed location',
        path: ['lat'],
      });
    }
  });

const storeSchema = withStoreLocationGuard(storeBaseSchema);
const storeUpdateSchema = withStoreLocationGuard(storeBaseSchema.partial());

const catalogCheckSchema = z.object({
  name: z.string().trim().min(1, 'Enter a service name').max(120),
});

const catalogCreateSchema = z.object({
  name: z.string().trim().min(1, 'Enter a service name').max(120),
  category: z.string().trim().min(1, 'Choose a service category.').max(40),
  description: z.string().trim().max(500).optional().or(z.literal('')),
});

const catalogWriteSchema = z.object({
  name: z.string().trim().min(2, 'Enter a service name').max(80),
  category: z.string().trim().min(1, 'Choose a service category.').max(40),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  acknowledgeSimilar: z.boolean().optional(),
});

const catalogStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

const registerServiceSchema = z.object({
  catalogKey: z.string().trim().min(1, 'Register a service from the BuildMate catalog.').max(80),
});

const offeringUpdateSchema = z.object({
  basePrice: finiteNumber().gt(0, { message: 'Enter a base price' }),
  unit: z.enum(['JOB', 'HOUR', 'M2', 'DAY']).optional(),
  estimatedHours: finiteNumber().min(0.5).max(240).optional(),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  image: z.string().trim().max(500).optional().or(z.literal('')),
});

const offeringAvailabilitySchema = z.object({
  isActive: z.boolean(),
});

const materialCategoryNameSchema = z.object({
  name: z.string().trim().min(1, 'Please enter a category name.').max(80),
});

const storeCategorySchema = z.object({
  name: z.string().trim().min(1, 'Please enter a category name.').max(80),
  description: z.string().trim().max(400).optional().or(z.literal('')),
  image: z.string().trim().max(2000).optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

const materialSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2),
  sku: z.string().trim().max(40).optional().or(z.literal('')),
  unit: z.string().trim().max(20).optional(),
  price: finiteNumber().min(0).max(1_000_000_000),
  stock: finiteNumber().min(0).max(1_000_000).optional(),
  minOrderQty: finiteNumber().min(1).max(100000).optional(),
  image: z.string().trim().optional().or(z.literal('')),
  description: z.string().trim().max(800).optional().or(z.literal('')),
  isActive: z.coerce.boolean().optional(),
  listingStatus: z.enum(['ACTIVE', 'PAUSED', 'DISCONTINUED']).optional(),
  saleAvailability: z.enum(['AVAILABLE', 'MANUALLY_UNAVAILABLE']).optional(),
  restockExpectedOn: z.string().trim().max(40).optional().or(z.literal('')).or(z.null()),
  statusNote: z.string().trim().max(400).optional().or(z.literal('')),
});

const submitSchema = z.object({
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Terms of Service' }),
  }),
});

const catalogReviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(500).optional(),
});

const serviceSuggestionSchema = z.object({
  description: z.string().trim().min(8, 'Please describe the service you would like to suggest.').max(500),
});

const suggestionRejectSchema = z.object({
  adminNote: z.string().trim().max(500).optional().or(z.literal('')),
});

const rejectSchema = z.object({
  reason: z.string().trim().min(8, 'Provide a clear rejection reason').max(500),
});

const locationChangeRequestSchema = z.object({
  proposedAddress: z.string().trim().min(4, 'Address must be at least 4 characters').max(200),
  proposedCity: z.string().trim().min(2, 'City must be at least 2 characters').max(80).optional(),
  proposedLat: latitudeSchema,
  proposedLng: longitudeSchema,
  locationSource: z.enum(['VIETMAP_PLACE', 'GPS', 'MANUAL_PIN']).optional().or(z.literal('')).or(z.null()),
  providerRefId: z.string().trim().max(2000).optional().or(z.literal('')).or(z.null()),
  reason: z.string().trim().min(8, 'Reason must be at least 8 characters').max(1000),
}).superRefine((data, ctx) => {
  if (data.proposedLat === 0 && data.proposedLng === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Coordinates (0, 0) cannot be used as a valid location',
      path: ['proposedLat'],
    });
  }
});

const locationChangeRejectSchema = z.object({
  reason: z.string().trim().min(8, 'Rejection reason must be at least 8 characters').max(1000),
});

const locationChangeApproveSchema = z.object({
  adminNote: z.string().trim().max(1000).optional().or(z.literal('')),
});

module.exports = {
  profileSchema,
  documentTypeSchema,
  portfolioSlotSchema,
  portfolioRemoveSchema,
  portfolioProjectSchema,
  projectImageRemoveSchema,
  publicProfileSchema,
  storePublicProfileSchema,
  verificationChangeSchema,
  storeSchema,
  storeUpdateSchema,
  registerServiceSchema,
  offeringUpdateSchema,
  offeringAvailabilitySchema,
  catalogCheckSchema,
  catalogCreateSchema,
  catalogWriteSchema,
  catalogStatusSchema,
  catalogReviewSchema,
  materialCategoryNameSchema,
  storeCategorySchema,
  materialSchema,
  rejectSchema,
  serviceSuggestionSchema,
  suggestionRejectSchema,
  submitSchema,
  locationChangeRequestSchema,
  locationChangeRejectSchema,
  locationChangeApproveSchema,
  SERVICE_CATEGORIES,
  MATERIAL_CATEGORIES,
};
