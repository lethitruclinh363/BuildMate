const { fail } = require('./response');

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      const firstMessage =
        Object.values(fieldErrors).flat()[0] || 'Validation failed';
      return fail(res, firstMessage, 422, fieldErrors);
    }

    req[source] = result.data;
    return next();
  };
}

module.exports = { validate };
