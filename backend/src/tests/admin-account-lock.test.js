const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { USER_STATUS, ROLES } = require('../models/user.model');
const { AUDIT_ACTION } = require('../models/AuditLog');
const { adminListUsersQuerySchema, adminLockUserSchema, adminUnlockUserSchema } = require('../validators/adminUser.validator');
const adminUserService = require('../services/adminUserService');
const { authenticate } = require('../middleware/authMiddleware');
const { allowRole } = require('../middleware/roleMiddleware');
const socketService = require('../services/socketService');
const { signToken } = require('../utils/jwt');

// Helper to invoke Express middleware and await result
function runMiddleware(middleware, req, res = {}) {
  return new Promise((resolve, reject) => {
    try {
      middleware(req, res, (err) => {
        if (err) return reject(err);
        resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}

describe('PROMPT 25 - Admin Account Lock & Unlock Management', () => {

  describe('1. Zod Validation Schemas', () => {
    it('validates list users query parameters with sensible defaults', () => {
      const parsed = adminListUsersQuerySchema.parse({});
      assert.equal(parsed.page, 1);
      assert.equal(parsed.limit, 20);
      assert.equal(parsed.role, 'ALL');
      assert.equal(parsed.status, 'ALL');

      const custom = adminListUsersQuerySchema.parse({
        page: '3',
        limit: '50',
        role: 'CONTRACTOR',
        status: 'BLOCKED',
        keyword: '  Tho Dien Nuoc  ',
      });
      assert.equal(custom.page, 3);
      assert.equal(custom.limit, 50);
      assert.equal(custom.role, 'CONTRACTOR');
      assert.equal(custom.status, 'BLOCKED');
      assert.equal(custom.keyword, 'Tho Dien Nuoc');
    });

    it('rejects invalid query values', () => {
      assert.throws(() => adminListUsersQuerySchema.parse({ page: 0 }));
      assert.throws(() => adminListUsersQuerySchema.parse({ limit: 500 }));
      assert.throws(() => adminListUsersQuerySchema.parse({ role: 'HACKER' }));
    });

    it('validates lock and unlock schemas and trims reason', () => {
      const lockParsed = adminLockUserSchema.parse({ reason: ' Vi phạm chính sách an toàn lao động  ' });
      assert.equal(lockParsed.reason, 'Vi phạm chính sách an toàn lao động');

      const emptyParsed = adminLockUserSchema.parse({});
      assert.equal(emptyParsed.reason, '');

      const unlockParsed = adminUnlockUserSchema.parse({ reason: 'Đã giải trình và khắc phục' });
      assert.equal(unlockParsed.reason, 'Đã giải trình và khắc phục');

      assert.throws(() => adminLockUserSchema.parse({ reason: 'a'.repeat(501) }));
    });
  });

  describe('2. RBAC & Route Access Control', () => {
    it('rejects requests without authentication header with 401', async () => {
      const req = { headers: {} };
      await assert.rejects(
        () => runMiddleware(authenticate, req),
        (err) => err.statusCode === 401
      );
    });

    it('rejects non-admin roles (CUSTOMER, CONTRACTOR, STORE_OWNER) with 403', async () => {
      const middleware = allowRole('ADMIN');
      for (const role of ['CUSTOMER', 'CONTRACTOR', 'MATERIAL_STORE_OWNER']) {
        const req = { user: { id: 'u1', role } };
        await assert.rejects(
          () => runMiddleware(middleware, req),
          (err) => err.statusCode === 403
        );
      }
    });

    it('allows ADMIN role through authorization middleware', async () => {
      const middleware = allowRole('ADMIN');
      const req = { user: { id: 'admin1', role: 'ADMIN' } };
      await assert.doesNotReject(() => runMiddleware(middleware, req));
    });
  });

  describe('3. Lock & Unlock Business Rules and Constraints', () => {
    it('cannot lock an account with role ADMIN (returns 403)', async () => {
      // User 5 is Auth Admin in DB
      await assert.rejects(
        async () => {
          await adminUserService.lockUser('312d38e2cec83348e193e2d2', 'some-other-admin-id', 'test');
        },
        (err) => err.statusCode === 403 && err.message.includes('Administrator accounts cannot be locked')
      );
    });

    it('cannot lock own account (self-lock protection returns 403)', async () => {
      await assert.rejects(
        async () => {
          await adminUserService.lockUser('312d38e2cec83348e193e2d2', '312d38e2cec83348e193e2d2', 'test self lock');
        },
        (err) => err.statusCode === 403 && err.message.includes('Cannot lock your own account')
      );
    });

    it('throws 404 when locking a non-existent user', async () => {
      await assert.rejects(
        async () => {
          await adminUserService.lockUser('000000000000000000000000', 'admin-id', 'test');
        },
        (err) => err.statusCode === 404 && err.message.includes('User not found')
      );
    });

    it('throws 404 when unlocking a non-existent user', async () => {
      await assert.rejects(
        async () => {
          await adminUserService.unlockUser('000000000000000000000000', 'admin-id', 'test');
        },
        (err) => err.statusCode === 404 && err.message.includes('User not found')
      );
    });

    it('throws 409 when unlocking an account that is already ACTIVE', async () => {
      // User 1 is ACTIVE
      await assert.rejects(
        async () => {
          await adminUserService.unlockUser('056282b256f8b5836a54af27', 'admin-id', 'test');
        },
        (err) => err.statusCode === 409 && err.message.includes('Account is not currently locked')
      );
    });
  });

  describe('4. Token Invalidation and Session Expiration on Lock', () => {
    it('authenticates active user when tokenVersion matches', async () => {
      const user = {
        _id: '056282b256f8b5836a54af27',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        tokenVersion: 1,
      };
      const token = signToken(user);

      const req = { headers: { authorization: `Bearer ${token}` } };
      await assert.doesNotReject(() => runMiddleware(authenticate, req));
      assert.equal(req.user.id, user._id);
      assert.equal(req.user.role, 'CUSTOMER');
      assert.equal(req.user.status, 'ACTIVE');
    });

    it('rejects old token when tokenVersion does not match (session expired with 401)', async () => {
      const user = {
        _id: '056282b256f8b5836a54af27',
        role: 'CUSTOMER',
        tokenVersion: 999, // Mismatched version simulating old session after tokenVersion bump
      };
      const token = signToken(user);

      const req = { headers: { authorization: `Bearer ${token}` } };
      await assert.rejects(
        () => runMiddleware(authenticate, req),
        (err) => err.statusCode === 401 && /Session expired/i.test(err.message)
      );
    });
  });

  describe('5. Socket Invalidation and Disconnect Handler', () => {
    it('disconnectUser function exists on socketService and safely handles disconnected or unknown users', () => {
      assert.equal(typeof socketService.disconnectUser, 'function');
      assert.doesNotThrow(() => {
        socketService.disconnectUser('non-existent-user-id');
      });
    });
  });

  describe('6. Audit Actions Registration', () => {
    it('AUDIT_ACTION includes ADMIN_LOCK_USER and ADMIN_UNLOCK_USER', () => {
      assert.equal(AUDIT_ACTION.ADMIN_LOCK_USER, 'ADMIN_LOCK_USER');
      assert.equal(AUDIT_ACTION.ADMIN_UNLOCK_USER, 'ADMIN_UNLOCK_USER');
    });
  });

  describe('7. User Listing for Admin', () => {
    it('lists users with pagination, counts and filters', async () => {
      const res = await adminUserService.listUsers({ page: 1, limit: 10 });
      assert.ok(Array.isArray(res.items));
      assert.ok(typeof res.total === 'number');
      assert.ok(res.total >= 5);
      assert.ok(res.stats);
      assert.ok(typeof res.stats.total === 'number');
      assert.ok(typeof res.stats.active === 'number');
      assert.ok(typeof res.stats.blocked === 'number');
    });

    it('filters users by role', async () => {
      const res = await adminUserService.listUsers({ role: 'CONTRACTOR', limit: 10 });
      assert.ok(Array.isArray(res.items));
      for (const item of res.items) {
        assert.equal(item.role, 'CONTRACTOR');
      }
    });

    it('fetches complete user details with counts and audit history', async () => {
      const details = await adminUserService.getUser('056282b256f8b5836a54af27');
      assert.ok(details.user);
      assert.equal(details.user.id, '056282b256f8b5836a54af27');
      assert.ok(details.counts);
      assert.ok(Array.isArray(details.auditHistory));
    });
  });
});
