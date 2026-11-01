if (typeof BigInt !== 'undefined' && !BigInt.prototype.toJSON) {
  BigInt.prototype.toJSON = function () {
    return this.toString();
  };
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { env } = require('./config/env');
const { uploadRoot } = require('./middleware/uploadMiddleware');
const { isBlockedPublicUpload } = require('./utils/public-uploads');
const { canServeContractorPublicFile } = require('./utils/contractor-public-upload');
const apiRoutes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { sanitizeInput } = require('./middleware/sanitizeMiddleware');
const { apiLimiter, authLimiter, otpRequestLimiter } = require('./middleware/rateLimitMiddleware');
const { requestTiming } = require('./middleware/requestTiming');
// const { sanitizeInput } = require('./middleware/sanitizeMiddleware');

function allowedOrigins() {
  return String(env.clientUrl || process.env.CLIENT_URL || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function corsOrigin() {
  const allowed = allowedOrigins();

  return function originCheck(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    if (allowed.includes(origin) || allowed.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error('CORS blocked'));
  };
}

function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'no-referrer' },
      frameguard: { action: 'deny' },
    })
  );
  app.use(
    cors({
      origin: corsOrigin(),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );
  app.use(morgan(env.isProd ? 'combined' : 'dev'));
  app.use(requestTiming);
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(sanitizeInput);

  const apiRate = apiLimiter();
  const authRate = authLimiter();
  const otpRate = otpRequestLimiter();
  app.use('/api', apiRate);
  for (const apiPrefix of ['/api', '/api/v1']) {
    app.use(`${apiPrefix}/auth/register`, otpRate);
    app.use(`${apiPrefix}/auth/resend-code`, otpRate);
    app.use(`${apiPrefix}/auth/forgot-password`, otpRate);
  }
  app.use('/api/auth', authRate);
  app.use('/api/v1/auth', authRate);
  app.use('/api/admin/auth', authRate);
  app.use('/api/v1/admin/auth', authRate);

  app.use('/uploads', (req, res, next) => {
    if (!isBlockedPublicUpload(req.path)) return next();
    Promise.resolve(canServeContractorPublicFile(req.path))
      .then((allowed) => {
        if (!allowed) {
          res.status(404).type('text/plain').send('Not found');
          return;
        }
        next();
      })
      .catch(() => {
        res.status(404).type('text/plain').send('Not found');
      });
  });
  app.use('/uploads', express.static(uploadRoot));
  app.use('/api', apiRoutes);
  app.use('/api/v1', apiRoutes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
