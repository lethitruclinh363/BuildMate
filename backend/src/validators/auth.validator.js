const { z } = require('zod');
const { ROLES } = require('../models/user.model');
const { normalizeEmail, normalizeVnMobile, isValidVnMobile } = require('../utils/identity');

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const PASSWORD_MESSAGE =
  'Password must be at least 8 characters and include uppercase, lowercase, and a number';

const phoneNumberSchema = z
  .string({
    required_error: 'Please enter a valid 10-digit phone number',
    invalid_type_error: 'Invalid phone number',
  })
  .trim()
  .transform((value) => normalizeVnMobile(value))
  .refine((value) => isValidVnMobile(value), {
    message: 'Invalid phone number',
  });

const passwordSchema = z
  .string({
    required_error: 'Password is required',
    invalid_type_error: 'Password is required',
  })
  .min(1, 'Password is required')
  .max(72, 'Password is too long')
  .refine((value) => PASSWORD_RULE.test(value), PASSWORD_MESSAGE);

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email').transform((value) => normalizeEmail(value)),
  password: passwordSchema,
  phoneNumber: phoneNumberSchema,
  acceptedPolicy: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms and privacy policy' }),
  }),
  policyLanguage: z.enum(['vi', 'en']).optional(),
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
  newPassword: passwordSchema,
});

module.exports = {
  PASSWORD_RULE,
  PASSWORD_MESSAGE,
  passwordSchema,
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendCodeSchema,
  forgotPasswordSchema,
  verifyResetCodeSchema,
  resetPasswordSchema,
};
