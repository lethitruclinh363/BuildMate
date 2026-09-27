require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { connectDatabase } = require('../config/database');
const { User, ROLES, USER_STATUS } = require('../models/User');
const { seedMarketplace } = require('./seed-marketplace');
const { seedSprint45 } = require('./seed-sprint45');
const { seedSprint51 } = require('./seed-sprint51');
const { seedSprint61 } = require('./seed-sprint61');

async function upsertUser(data) {
  if (data.status === USER_STATUS.ACTIVE && data.emailVerified === undefined) {
    data.emailVerified = true;
  }
  let user = await User.findOne({ email: data.email });
  if (!user) {
    user = await User.create(data);
    console.log('[seed] Created', data.role, data.email);
    return user;
  }
  if (data.emailVerified && !user.emailVerified) {
    user.emailVerified = true;
    user.status = data.status || user.status;
    await user.save();
    console.log('[seed] Marked email verified', data.email);
  }
  return user;
}

async function seed() {
  await connectDatabase();

  await upsertUser({
    name: 'BuildMate Admin',
    email: 'ivan.p@example.net',
    password: 'Admin@1234',
    phone: '0900000000',
    role: ROLES.ADMIN,
    status: USER_STATUS.ACTIVE,
  });

  await seedMarketplace();
  await seedSprint45();
  await seedSprint51();
  await seedSprint61();
  console.log('[seed] Done. Demo roles: CUSTOMER, CONTRACTOR, MATERIAL_STORE_OWNER, ADMIN.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
