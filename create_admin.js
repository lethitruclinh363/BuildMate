const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, 'backend/.env') });
const { db } = require('./backend/src/repositories/pgContext');
const bcrypt = require('./backend/node_modules/bcryptjs');

async function createAdmin() {
  try {
    const role = await db().roles.findFirst({ where: { name: 'ADMIN' } });
    if (!role) {
      console.error('ADMIN role not found');
      process.exit(1);
    }
    
    const passwordHash = await bcrypt.hash('Admin@1234', 10);
    
    const user = await db().users.create({
      data: {
        full_name: 'BuildMate Admin',
        email: 'admin@buildmate.com',
        password_hash: passwordHash,
        role_id: role.id,
        account_status: 'ACTIVE',
        email_verified: true,
        accepted_policy: true,
        accepted_policy_version: '1.0.0'
      }
    });
    
    console.log('Admin created:', user.email);
    process.exit(0);
  } catch (err) {
    console.error('Failed to create admin:', err);
    process.exit(1);
  }
}

createAdmin();
