const { prisma } = require('../src/config/prisma');
const { ensureWeeklyHoursColumn } = require('../src/repositories/column-ensure');

async function main() {
  await ensureWeeklyHoursColumn();
  const rows = await prisma.$queryRawUnsafe(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'contractor_profiles' AND column_name = 'weekly_hours'"
  );
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
