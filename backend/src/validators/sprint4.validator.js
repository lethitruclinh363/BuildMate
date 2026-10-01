const { z } = require('zod');
const { MESSAGE_TYPE } = require('../models/Message');
const { QUOTE_ITEM_TYPE } = require('../models/Quotation');

const createRepairSchema = z.object({
  contractorId: z.string().min(8),
  storeId: z.string().optional().or(z.literal('')),
  category: z.string().trim().min(2).max(40),
  catalogServiceId: z.string().trim().max(80).optional().or(z.literal('')),
  serviceName: z.string().trim().max(80).optional().or(z.literal('')),
  title: z.string().trim().min(4).max(140),
  description: z.string().trim().min(8).max(2000),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

const sendMessageSchema = z.object({
  type: z.enum(Object.values(MESSAGE_TYPE)).optional(),
  content: z.string().max(4000).optional().default(''),
});

const quotationItemSchema = z.object({
  type: z.enum(Object.values(QUOTE_ITEM_TYPE)),
  name: z.string().trim().min(2).max(140),
  quantity: z.coerce.number().min(0).optional(),
  unit: z.string().trim().max(40).optional().or(z.literal('')),
  price: z.coerce.number().min(0),
  catalogId: z.string().optional().or(z.literal('')),
});

const createQuotationSchema = z.object({
  requestId: z.string().min(8),
  items: z.array(quotationItemSchema).min(1),
  transportCost: z.coerce.number().min(0).optional(),
  estimatedDays: z.coerce.number().min(1).max(180).optional(),
  note: z.string().max(1000).optional().or(z.literal('')),
});

const modifyQuotationSchema = z.object({
  note: z.string().trim().min(4).max(1000),
});

module.exports = {
  createRepairSchema,
  sendMessageSchema,
  createQuotationSchema,
  modifyQuotationSchema,
};
