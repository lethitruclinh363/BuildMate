/**
 * Lỗi nghiệp vụ do Service ném ra (400/401/403/404/409...).
 * errorHandler đọc statusCode + message rồi trả JSON fail().
 */
class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

module.exports = { ApiError };
