const { db } = require('./backend/src/repositories/pgContext');

async function check() {
  try {
    const admins = await db().users.findMany({
      where: { roles: { name: 'ADMIN' } },
      select: { email: true, full_name: true }
    });
    console.log('Admins:', JSON.stringify(admins, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
