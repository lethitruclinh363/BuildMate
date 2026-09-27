const { z } = require('zod');
const { ROLES } = require('../models/user.model');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().email('Enter a valid email').toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password is too long'),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  role: z.enum(
    [ROLES.CUSTOMER, ROLES.CONTRACTOR, ROLES.MATERIAL_STORE_OWNER],
    { errorMap: () => ({ message: 'Select a valid role' }) }
  ),
});

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

const verifyEmailSchema = z.object({
  email: z.string().trim().email('Enter a valid email').toLowerCase(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Code must be 6 digits'),
});

const resendCodeSchema = z.object({
  email: z.string().trim().email('Enter a valid email').toLowerCase(),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Enter a valid email').toLowerCase(),
});

const verifyResetCodeSchema = z.object({
  email: z.string().trim().email('Enter a valid email').toLowerCase(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Code must be 6 digits'),
});

const resetPasswordSchema = z.object({
  email: z.string().trim().email('Enter a valid email').toLowerCase(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Code must be 6 digits'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password is too long'),
});

module.exports = {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendCodeSchema,
  forgotPasswordSchema,
  verifyResetCodeSchema,
  resetPasswordSchema,
};
