const { z } = require('zod');
const { ROLES } = require('../models/user.model');

const publicRoles = [
  ROLES.CUSTOMER,
  ROLES.CONTRACTOR,
  ROLES.MATERIAL_STORE_OWNER,
];

const createUserSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(80).optional(),
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80).optional(),
    email: z.string().trim().email('Enter a valid email').toLowerCase(),
    phone: z.string().trim().max(20).optional().or(z.literal('')),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password is too long'),
    role: z.enum(publicRoles, {
      errorMap: () => ({ message: 'Select a valid role' }),
    }),
  })
  .refine((data) => Boolean(data.fullName || data.name), {
    message: 'Name must be at least 2 characters',
    path: ['fullName'],
  });

const profileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(80).optional(),
    name: z.string().trim().min(2).max(80).optional(),
    phone: z.string().trim().max(20).optional(),
    preferredLanguage: z.enum(['vi', 'en']).optional(),
  })
  .strict();

const passwordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z
    .string()
    .min(8)
    .max(72)
    .regex(/[A-Z]/, 'Password must include an uppercase letter')
    .regex(/[0-9]/, 'Password must include a number'),
});

module.exports = { createUserSchema, profileSchema, passwordSchema, publicRoles };
