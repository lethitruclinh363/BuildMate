#!/usr/bin/env node
/**
 * Inserts four fake actors on the isolated test database only.
 * Emails always end with @buildmate.test. Does not copy live accounts.
 */
const {
  loadTestEnv,
  requireIsolatedTestDatabase,
} = require('../src/tests/helpers/database-safety');

loadTestEnv();

const url = requireIsolatedTestDatabase();
process.env.TEST_DATABASE_URL = url;
process.env.DATABASE_URL = url;
process.env.BUILDMATE_TEST_DATABASE = 'isolated';
process.env.NODE_ENV = 'test';
process.env.EMAIL_HOST = '';
process.env.EMAIL_USER = '';
process.env.EMAIL_PASSWORD = '';

const { createUser, ROLES } = require('../src/tests/helpers/party');
const { userRepository } = require('../src/repositories/userRepository');

const ACTORS = [
  { name: 'Demo Customer', email: 'demo.customer@buildmate.test', password: 'Demo@1234', role: ROLES.CUSTOMER },
  { name: 'Demo Contractor', email: 'demo.contractor@buildmate.test', password: 'Demo@1234', role: ROLES.CONTRACTOR },
  { name: 'Demo Store Owner', email: 'demo.store@buildmate.test', password: 'Demo@1234', role: ROLES.MATERIAL_STORE_OWNER },
  { name: 'Demo Admin', email: 'demo.admin@buildmate.test', password: 'Admin@1234', role: ROLES.ADMIN },
];

async function main() {
  const { ensureDefaultPolicies } = require('../src/services/policy.service');
  await ensureDefaultPolicies();
  for (const actor of ACTORS) {
    const existing = await userRepository.findByEmail(actor.email);
    if (existing) {
      console.log(`[seed-actors] exists ${actor.email}`);
      continue;
    }
    try {
      await createUser(actor);
      console.log(`[seed-actors] created ${actor.email}`);
    } catch (error) {
      const message = String(error.message || error);
      if (/409|unique|already/i.test(message) || error.statusCode === 409) {
        console.log(`[seed-actors] exists ${actor.email}`);
        continue;
      }
      throw error;
    }
  }
}

main().catch((error) => {
  console.error(String(error.message || error).replace(/:[^:@/]+@/g, ':***@'));
  process.exit(1);
});
