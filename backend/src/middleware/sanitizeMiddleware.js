function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const clean = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.')) continue;
    clean[key] = sanitizeValue(nested);
  }
  return clean;
}

function replaceContents(target, next) {
  if (!isPlainObject(target) || !isPlainObject(next)) return;
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, next);
}

function sanitizeInput(req, _res, next) {
  if (req.body) req.body = sanitizeValue(req.body);
  if (req.params) replaceContents(req.params, sanitizeValue(req.params));
  if (req.query) replaceContents(req.query, sanitizeValue(req.query));
  next();
}

module.exports = { sanitizeInput, mongoSanitize: sanitizeInput, sanitizeValue };
