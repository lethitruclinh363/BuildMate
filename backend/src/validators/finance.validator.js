const { z } = require('zod');
const { finiteNumber } = require('../utils/validator');
const { COMPLAINT_STATUS } = require('../models/Complaint');
const { REVIEW_TARGET } = require('../models/Review');

const checkoutSchema = z.object({
  method: z.enum(['MOCK', 'COD', 'BANK_TRANSFER']).optional(),
  termsAccepted: z.boolean().optional(),
  termsVersion: z.string().max(80).optional(),
});

const refundSchema = z.object({
  reason: z.string().trim().max(500).optional().or(z.literal('')),
  cancelCase: z.enum(['UNPAID', 'CUSTOMER_AFTER_DEPOSIT', 'CONTRACTOR_CANCEL', 'MUTUAL', 'DISPUTE']).optional(),
  amount: finiteNumber().int().positive().optional(),
});

const reviewReplySchema = z.object({
  reply: z.string().trim().min(2).max(500),
}).strict();

const reviewReportSchema = z.object({
  reason: z.string().trim().min(8).max(500),
}).strict();

const reviewListQuerySchema = z.object({
  rating: finiteNumber().int().min(1).max(5).optional(),
  sort: z.enum(['newest', 'oldest']).optional().default('newest'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(10),
});

const materialReviewSchema = z.object({
  materialOrderId: z.string().min(8),
  rating: finiteNumber().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().or(z.literal('')),
}).strict();

const reviewSchema = z.object({
  orderId: z.string().min(8),
  targetUserId: z.string().min(8),
  targetType: z.enum(Object.values(REVIEW_TARGET)).optional(),
  rating: finiteNumber().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().or(z.literal('')),
  images: z.array(z.string()).max(4).optional(),
});

const complaintSchema = z.object({
  orderId: z.string().min(8),
  againstUser: z.string().min(8),
  reason: z.string().trim().min(3).max(80),
  description: z.string().trim().min(10).max(2000),
  attachments: z.array(z.string()).max(6).optional(),
});

const complaintPatchSchema = z.object({
  status: z.enum(Object.values(COMPLAINT_STATUS)),
  adminNote: z.string().trim().max(2000).optional().or(z.literal('')),
});

const commissionRuleSchema = z.object({
  percentage: finiteNumber().min(0).max(30),
  name: z.string().trim().max(80).optional(),
});

module.exports = {
  checkoutSchema,
  refundSchema,
  reviewSchema,
  materialReviewSchema,
  reviewReplySchema,
  reviewReportSchema,
  reviewListQuerySchema,
  complaintSchema,
  complaintPatchSchema,
  commissionRuleSchema,
};
