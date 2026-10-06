const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const required = ['MONGODB_URI', 'JWT_SECRET'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const jwtSecret = process.env.JWT_SECRET;
const isProd = process.env.NODE_ENV === 'production';

if (jwtSecret.length < 32) {
  if (isProd) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
  console.warn('[env] JWT_SECRET should be at least 32 characters');
}

const rateLimitEnabled = String(process.env.RATE_LIMIT_ENABLED || 'true').toLowerCase() !== 'false';
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000;
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX) || (isProd ? 100 : 500);
const rateLimitAuthMax = Number(process.env.RATE_LIMIT_AUTH_MAX) || (isProd ? 10 : 30);
const rateLimitOtpMax = Number(process.env.RATE_LIMIT_OTP_MAX) || (isProd ? 10 : 50);

const DEV_CLIENT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
];

function resolveClientUrl() {
  const configured = String(process.env.CLIENT_URL || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (isProd) return configured.join(',');
  const origins = configured.length ? configured : [...DEV_CLIENT_ORIGINS];
  for (const origin of DEV_CLIENT_ORIGINS) {
    if (!origins.includes(origin)) origins.push(origin);
  }
  return origins.join(',');
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: resolveClientUrl(),
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB) || 8,
  // Face-match thresholds live in the eKYC service config, not here.
  // Prototype values: MATCH <= 0.30, REVIEW_REQUIRED <= 0.42, otherwise NOT_MATCH.
  // Calibrate before any production use.
  ekycServiceUrl: process.env.EKYC_SERVICE_URL || 'http://127.0.0.1:8000',
  ekycInternalToken: process.env.EKYC_INTERNAL_TOKEN || '',
  ekycTimeoutMs: Number(process.env.EKYC_TIMEOUT_MS) || 120000,
  isProd,
  rateLimitEnabled,
  rateLimitWindowMs,
  rateLimitMax,
  rateLimitAuthMax,
  rateLimitOtpMax,
  // EMAIL_* (đồ án) hoặc SMTP_* (tên cũ) — cùng một transporter Nodemailer.
  smtpHost: process.env.EMAIL_HOST || process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.EMAIL_PORT || process.env.SMTP_PORT) || 587,
  smtpUser: process.env.EMAIL_USER || process.env.SMTP_USER || '',
  smtpPass:
    process.env.EMAIL_PASSWORD ||
    process.env.EMAIL_PASS ||
    process.env.SMTP_PASS ||
    '',
  smtpFrom: process.env.EMAIL_FROM || process.env.SMTP_FROM || '',
  vietmapApiKey: process.env.VIETMAP_API_KEY || '',
};

module.exports = { env };
