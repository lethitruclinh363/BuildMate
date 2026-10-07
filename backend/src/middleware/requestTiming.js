const { env } = require('../config/env');
const { requestStats } = require('../config/requestStats');

function requestTiming(req, res, next) {
  if (env.isProd) return next();
  const stats = { count: 0, ms: 0 };
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const total = Number(process.hrtime.bigint() - start) / 1e6;
    const path = String(req.originalUrl || req.url || '').split('?')[0];
    console.log(
      `${req.method} ${path} ${res.statusCode} ${Math.round(total)}ms db=${stats.count}/${Math.round(stats.ms)}ms`
    );
  });
  requestStats.run(stats, () => next());
}

module.exports = { requestTiming };
