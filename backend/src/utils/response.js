/**
 * Envelope JSON dùng chung cho mọi API.
 *
 * Thành công:
 *   { success: true,  message, data }
 * Thất bại:
 *   { success: false, message, details, errors, data: null }
 *
 * Frontend chỉ cần đọc success + data / message. Không đổi field này
 * để không phá app React hiện tại.
 */
function success(res, data = null, message = 'OK', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

function fail(res, message = 'Request failed', statusCode = 400, details = null) {
  return res.status(statusCode).json({
    success: false,
    message,
    details,
    errors: details,
    data: null,
  });
}

function created(res, data, message = 'Created') {
  return success(res, data, message, 201);
}

module.exports = { success, fail, created };
