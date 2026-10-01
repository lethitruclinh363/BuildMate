function classifyError(err, { isProd = false } = {}) {
  if (!err) {
    return { status: 500, message: 'Internal server error', details: null };
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return { status: 400, message: 'File is too large', details: null };
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return { status: 400, message: 'Unexpected file field', details: null };
  }
  if (err.name === 'MulterError') {
    return { status: 400, message: err.message || 'Upload failed', details: null };
  }
  if (err.name === 'CastError') {
    return { status: 404, message: 'Resource not found', details: null };
  }
  if (err.code === 11000) {
    const key = Object.keys(err.keyPattern || err.keyValue || {})[0];
    if (key === 'email') {
      return { status: 409, message: 'Email already exists', details: null };
    }
    if (key === 'phone' || key === 'phoneNumber') {
      return { status: 409, message: 'Phone number already exists', details: null };
    }
    return { status: 409, message: 'Duplicate resource', details: err.keyValue || null };
  }
  if (err.name === 'ValidationError') {
    return { status: 400, message: err.message, details: err.errors || null };
  }
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return { status: 401, message: 'Invalid or expired token', details: null };
  }

  const status = Number(err.statusCode) || 500;
  const message = status === 500 && isProd ? 'Internal server error' : err.message || 'Request failed';
  return { status, message, details: err.details || null };
}

module.exports = { classifyError };
