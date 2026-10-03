const { z } = require('zod');
const { SERVICE_CATEGORIES } = require('../models/Service');
const { MATERIAL_CATEGORIES } = require('../models/Material');
const {
  isSystemService,
  findSystemService,
  normalizeServiceName,
  isCategory,
} = require('../constants/contractorServices');

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

const profileSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name is required').max(100),
  representativeName: z.string().trim().max(100).optional().or(z.literal('')),
  contactPhone: contactPhoneSchema.optional().or(z.literal('')),
  contactEmail: z.union([z.literal(''), z.string().trim().email('Enter a valid email').max(120)]).optional(),
  workerCount: z.coerce.number().int().min(1).max(500).optional(),
  taxCode: z.string().trim().max(30).optional().or(z.literal('')),
  address: z.union([z.literal(''), z.string().trim().min(4, 'Address is required').max(200)]).optional(),
  city: z.string().trim().max(80).optional(),
  description: z.string().trim().max(1200).optional().or(z.literal('')),
  yearsExperience: z.coerce.number().min(0).max(80).optional(),
  serviceAreas: z.array(z.string().trim().min(1)).max(12).optional(),
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
});

const portfolioSlotSchema = z.object({
  slot: z.enum(['avatar', 'teamLogo', 'workshop', 'construction', 'certificate']),
});

const portfolioRemoveSchema = portfolioSlotSchema.extend({
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
  openingHours: z.string().trim().max(80).optional().or(z.literal('')),
  achievements: z.string().trim().max(500).optional().or(z.literal('')),
  yearsExperience: z.coerce.number().min(0).max(80).optional(),
  workerCount: z.coerce.number().int().min(0).max(500).optional(),
}).strict();

const verificationChangeSchema = z.object({
  note: z.string().trim().min(8).max(500),
}).strict();

const storeSchema = z.object({
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
  serviceRadiusKm: z.coerce.number().min(1).max(50).optional(),
  category: z.string().trim().max(80).optional(),
  status: z.enum(['DRAFT', 'LIVE', 'PAUSED']).optional(),
  lng: z.coerce.number().optional(),
  lat: z.coerce.number().optional(),
});

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
  basePrice: z.coerce.number().refine((value) => value > 0, 'Enter a base price'),
  unit: z.enum(['JOB', 'HOUR', 'M2', 'DAY']).optional(),
  estimatedHours: z.coerce.number().min(0.5).max(240).optional(),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  image: z.string().trim().max(500).optional().or(z.literal('')),
});

const materialSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2),
  sku: z.string().trim().max(40).optional().or(z.literal('')),
  unit: z.string().trim().max(20).optional(),
  price: z.coerce.number().min(0),
  stock: z.coerce.number().min(0).optional(),
  minOrderQty: z.coerce.number().min(1).optional(),
  image: z.string().trim().optional().or(z.literal('')),
  description: z.string().trim().max(800).optional().or(z.literal('')),
  isActive: z.coerce.boolean().optional(),
});

const submitSchema = z.object({
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Terms of Service' }),
  }),
});

const catalogReviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
});

const rejectSchema = z.object({
  reason: z.string().trim().min(8, 'Provide a clear rejection reason').max(500),
});

module.exports = {
  profileSchema,
  documentTypeSchema,
  portfolioSlotSchema,
  portfolioRemoveSchema,
  publicProfileSchema,
  verificationChangeSchema,
  storeSchema,
  registerServiceSchema,
  offeringUpdateSchema,
  catalogCheckSchema,
  catalogCreateSchema,
  catalogWriteSchema,
  catalogStatusSchema,
  catalogReviewSchema,
  materialSchema,
  rejectSchema,
  submitSchema,
  SERVICE_CATEGORIES,
  MATERIAL_CATEGORIES,
};
