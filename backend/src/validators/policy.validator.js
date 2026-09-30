const { z } = require('zod');
const { POLICY_TYPES, POLICY_STATUS } = require('../models/Policy');

const policyBody = {
  title: z.string().trim().min(1, 'Title is required').max(160),
  type: z.enum(Object.values(POLICY_TYPES)),
  content: z.string().trim().min(1, 'Content is required'),
  language: z.enum(['vi', 'en']),
  version: z.string().trim().min(1, 'Version is required').max(32),
  status: z.enum(Object.values(POLICY_STATUS)).optional(),
  effectiveDate: z.union([z.string().trim().min(4), z.literal('')]).optional(),
};

const createPolicySchema = z.object(policyBody);

const updatePolicySchema = z
  .object({
    title: policyBody.title.optional(),
    type: policyBody.type.optional(),
    content: policyBody.content.optional(),
    language: policyBody.language.optional(),
    version: policyBody.version.optional(),
    status: policyBody.status,
    effectiveDate: policyBody.effectiveDate,
  })
  .refine((value) => Object.keys(value).length > 0, 'No changes');

const activeQuerySchema = z.object({
  type: z.enum(Object.values(POLICY_TYPES)),
  language: z.enum(['vi', 'en']).optional(),
});

module.exports = { createPolicySchema, updatePolicySchema, activeQuerySchema };
