const { z } = require('zod');
const { finiteNumber } = require('../utils/validator');

const itemBody = z.object({
  name: z.string().trim().min(2).max(140),
  specification: z.string().trim().max(200).optional().or(z.literal('')),
  unit: z.string().trim().max(40).optional().or(z.literal('')),
  quantity: finiteNumber().gt(0).lte(1000000),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});

const createListSchema = z.object({
  requestId: z.string().min(8).max(40),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
  items: z.array(itemBody).max(40).optional(),
});

const updateListSchema = z.object({
  note: z.string().trim().max(1000).optional().or(z.literal('')),
  title: z.string().trim().max(140).optional().or(z.literal('')),
});

const sendListSchema = z.object({
  storeId: z.string().min(8).max(40),
});

const directRequestSchema = z.object({
  storeId: z.string().min(8).max(40),
  title: z.string().trim().max(140).optional().or(z.literal('')),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
  items: z.array(itemBody).min(1).max(40),
});

const quoteItemSchema = z.object({
  itemId: z.string().min(1).max(40),
  unitPrice: finiteNumber().min(0).max(1000000000),
  availableQty: finiteNumber().min(0).max(1000000),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});

const createQuoteSchema = z.object({
  items: z.array(quoteItemSchema).min(1),
  deliveryFee: finiteNumber().min(0).max(100000000).optional(),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
});

const fulfillmentSchema = z.object({
  status: z.enum(['PREPARING', 'DELIVERING', 'DELIVERED']),
});

module.exports = {
  itemBody,
  createListSchema,
  updateListSchema,
  sendListSchema,
  directRequestSchema,
  createQuoteSchema,
  fulfillmentSchema,
};
