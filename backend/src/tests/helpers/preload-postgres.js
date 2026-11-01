const { loadTestEnv, requireIsolatedTestDatabase } = require('./database-safety');

loadTestEnv();

try {
  process.env.DATABASE_URL = requireIsolatedTestDatabase();
  process.env.BUILDMATE_TEST_DATABASE = 'isolated';
  process.env.NODE_ENV = 'test';
  process.env.EMAIL_HOST = '';
  process.env.EMAIL_USER = '';
  process.env.EMAIL_PASSWORD = '';
  process.env.SMTP_HOST = '';
  process.env.SMTP_USER = '';
  process.env.SMTP_PASS = '';
} catch (error) {
  process.env.BUILDMATE_TEST_DATABASE = 'missing';
  console.error(`[test] ${error.message}`);
  process.exit(1);
}
