const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');

const RATE_MESSAGE = {
  success: false,
  message: 'Bạn thao tác quá nhanh. Vui lòng chờ vài giây.',
  data: null,
};

function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

function isHealth(req) {
  return /\/health\/?(\?|$)/.test(req.originalUrl || req.url || '');
}

function isAuthPath(req) {
  return /\/auth(\/|\?|$)/.test(req.originalUrl || req.url || '');
}

function apiLimiter() {
  if (!env.rateLimitEnabled) {
    return (_req, _res, next) => next();
  }
  return rateLimit({
    windowMs: env.rateLimitWindowMs,
    max: env.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS' || isHealth(req) || isAuthPath(req),
    message: RATE_MESSAGE,
  });
}

function authLimiter() {
  if (!env.rateLimitEnabled) {
    return (_req, _res, next) => next();
  }
  return rateLimit({
    windowMs: env.rateLimitWindowMs,
    max: env.rateLimitAuthMax,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    skip: (req) => req.method === 'OPTIONS',
    message: RATE_MESSAGE,
    keyGenerator: (req) => {
      const email = String(req.body?.email || 'unknown').trim().toLowerCase();
      return `login:${clientIp(req)}:${email}`;
    },
  });
}

module.exports = { apiLimiter, authLimiter };
