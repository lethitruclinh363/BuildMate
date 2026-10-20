const { loadTestEnv, requireIsolatedTestDatabase } = require('./database-safety');

loadTestEnv();

try {
  requireIsolatedTestDatabase();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
