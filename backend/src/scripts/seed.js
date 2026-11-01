/**
 * BuildMate PostgreSQL Database Seeder
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { connectDatabase, disconnectDatabase } = require('../config/database');
const { ensureDefaultPolicies } = require('../services/policy.service');

async function seed() {
  console.log('[seed] Connecting to PostgreSQL database...');
  await connectDatabase();

  console.log('[seed] Ensuring default policies...');
  await ensureDefaultPolicies();

  console.log('[seed] Seeding completed successfully.');
  await disconnectDatabase();
  process.exit(0);
}

seed().catch(async (err) => {
  console.error('[seed] Failed:', err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
