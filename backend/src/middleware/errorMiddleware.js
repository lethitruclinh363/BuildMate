/**
 * Middleware lỗi tập trung.
 *
 * Controller / Service ném ApiError (hoặc lỗi database).
 * File này đổi lỗi thành JSON thống nhất qua utils/response.fail().
 *
 * Luôn để errorHandler SAU cùng trong app.js (sau notFound).
 */
const { fail } = require('../utils/response');
const { env } = require('../config/env');
const { classifyError } = require('../utils/httpError');

function notFound(_req, res) {
  return fail(res, 'Route not found', 404);
}

function errorHandler(err, _req, res, _next) {
  const mapped = classifyError(err, { isProd: env.isProd });

  if (!env.isProd && mapped.status >= 500) {
    console.error('[error]', err);
  }

  return fail(res, mapped.message, mapped.status, mapped.details);
}

module.exports = { notFound, errorHandler, classifyError };
