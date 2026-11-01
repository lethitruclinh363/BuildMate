#!/usr/bin/env node
/**
 * Sets Demo@1234 on two existing @example.com test fixtures only.
 * Does not touch gmail.com or @buildmate.vn users. Does not print hashes.
 */
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.migration'), override: true });
const { prisma } = require('../../src/config/prisma');

const ALLOWED = [
  'repair.customer.42805458@example.com',
  'catalog.runtime.42186740@example.com',
];

async function main() {
  const hash = await bcrypt.hash('Demo@1234', 12);
  for (const email of ALLOWED) {
    const updated = await prisma.$executeRaw`
      UPDATE users
      SET password_hash = ${hash}, email_verified = true, account_status = 'ACTIVE', updated_at = now()
      WHERE lower(email) = ${email}
    `;
    console.log(`unlock ${email} rows=${updated}`);
  }
}

main()
  .catch((err) => {
    console.error('FAIL', String(err.message || err).slice(0, 250));
    process.exit(1);
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch { /* ignore */ }
  });
