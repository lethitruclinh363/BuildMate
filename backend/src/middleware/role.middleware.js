const { ApiError } = require('../utils/ApiError');

/**
 * CUSTOMER | CONTRACTOR | MATERIAL_STORE_OWNER | ADMIN
 *
 * Dùng sau authenticate:
 *   router.get('/x', authenticate, allowRole('CUSTOMER'), handler)
 *   router.get('/y', authenticate, allowRole('ADMIN'), handler)
 *
 * Sai role → 403 Forbidden
 */
function allowRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, 'Forbidden'));
    }

    return next();
  };
}

// Tên cũ — các route Sprint trước vẫn chạy.
const authorize = allowRole;

module.exports = { allowRole, authorize };
