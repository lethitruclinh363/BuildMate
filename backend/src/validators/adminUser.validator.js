const { z } = require('zod');

const adminListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(['ALL', 'CUSTOMER', 'CONTRACTOR', 'MATERIAL_STORE_OWNER', 'ADMIN']).optional().default('ALL'),
  status: z.enum(['ALL', 'ACTIVE', 'BLOCKED', 'PENDING_EMAIL', 'PENDING_APPROVAL', 'REJECTED', 'INACTIVE']).optional().default('ALL'),
  keyword: z.string().trim().max(100).optional(),
});

const adminLockUserSchema = z.object({
  reason: z.string().trim().max(500, 'Reason cannot exceed 500 characters').optional().default(''),
});

const adminUnlockUserSchema = z.object({
  reason: z.string().trim().max(500, 'Reason cannot exceed 500 characters').optional().default(''),
});

module.exports = {
  adminListUsersQuerySchema,
  adminLockUserSchema,
  adminUnlockUserSchema,
};

