const { z } = require('zod');
const { SERVICE_CATEGORIES } = require('../models/Service');
const { MATERIAL_CATEGORIES } = require('../models/Material');

const profileSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name is required').max(100),
  taxCode: z.string().trim().max(30).optional().or(z.literal('')),
  address: z.string().trim().min(4, 'Address is required').max(200),
  city: z.string().trim().max(80).optional(),
  description: z.string().trim().max(1200).optional().or(z.literal('')),
  yearsExperience: z.coerce.number().min(0).max(80).optional(),
  serviceAreas: z.array(z.string().trim().min(1)).max(12).optional(),
});

const documentTypeSchema = z.object({
  type: z.enum(['BUSINESS_LICENSE', 'CERTIFICATE', 'ID_CARD', 'STORE_IMAGE', 'PORTFOLIO']),
});

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

const serviceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  basePrice: z.coerce.number().min(0),
  unit: z.enum(['JOB', 'HOUR', 'M2', 'DAY']).optional(),
  estimatedHours: z.coerce.number().min(0.5).max(240).optional(),
  image: z.string().trim().optional().or(z.literal('')),
  isActive: z.coerce.boolean().optional(),
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

const rejectSchema = z.object({
  reason: z.string().trim().min(8, 'Provide a clear rejection reason').max(500),
});

module.exports = {
  profileSchema,
  documentTypeSchema,
  storeSchema,
  serviceSchema,
  materialSchema,
  rejectSchema,
  SERVICE_CATEGORIES,
  MATERIAL_CATEGORIES,
};
