const { z } = require('zod');
const { fail } = require('./response');

function finiteNumber(message = 'Must be a finite number') {
  return z.coerce.number({ invalid_type_error: message, required_error: message }).finite({ message });
}

function firstValidationMessage(error, fieldErrors) {
  const issue = error.issues?.[0];
  const inner = issue?.code === 'invalid_union' ? issue.unionErrors?.[0]?.issues?.[0] : issue;
  const path = (inner?.path?.length ? inner.path : issue?.path || []).join('.');
  const message = inner?.message || Object.values(fieldErrors || {}).flat()[0] || 'Validation failed';
  if (message === 'Invalid input' && path) return `${path}: ${inner?.message || message}`;
  return message;
}

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      const firstMessage = firstValidationMessage(result.error, fieldErrors);
      return fail(res, firstMessage, 422, fieldErrors);
    }

    req[source] = result.data;
    return next();
  };
}

module.exports = { validate, finiteNumber };
