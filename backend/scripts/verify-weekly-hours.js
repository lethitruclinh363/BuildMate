const { prisma } = require('../src/config/prisma');
const { ensureWeeklyHoursColumn } = require('../src/repositories/column-ensure');

const sampleA = {
  configured: true,
  days: [
    { weekday: 1, closed: false, open: '07:00', close: '18:00' },
    { weekday: 2, closed: false, open: '07:00', close: '18:00' },
    { weekday: 3, closed: false, open: '08:00', close: '17:00' },
    { weekday: 4, closed: false, open: '07:00', close: '18:00' },
    { weekday: 5, closed: false, open: '07:00', close: '18:00' },
    { weekday: 6, closed: false, open: '07:00', close: '17:00' },
    { weekday: 7, closed: true, open: null, close: null },
  ],
};

const sampleB = {
  configured: true,
  days: [
    { weekday: 1, closed: false, open: '09:00', close: '12:00' },
    { weekday: 2, closed: true, open: null, close: null },
    { weekday: 3, closed: false, open: '09:00', close: '12:00' },
    { weekday: 4, closed: true, open: null, close: null },
    { weekday: 5, closed: false, open: '09:00', close: '12:00' },
    { weekday: 6, closed: true, open: null, close: null },
    { weekday: 7, closed: true, open: null, close: null },
  ],
};

async function main() {
  await ensureWeeklyHoursColumn();
  const rows = await prisma.$queryRawUnsafe(
    'SELECT id, business_name, weekly_hours FROM contractor_profiles ORDER BY id ASC LIMIT 2'
  );
  if (!rows.length) {
    console.log('NO_PROFILES');
    return;
  }
  const originals = rows.map((row) => ({ id: row.id, weekly_hours: row.weekly_hours }));
  try {
    const first = rows[0];
    await prisma.$executeRawUnsafe(
      `UPDATE contractor_profiles SET weekly_hours = '${JSON.stringify(sampleA).replace(/'/g, "''")}'::jsonb WHERE id = ${Number(first.id)}`
    );
    if (rows[1]) {
      await prisma.$executeRawUnsafe(
        `UPDATE contractor_profiles SET weekly_hours = '${JSON.stringify(sampleB).replace(/'/g, "''")}'::jsonb WHERE id = ${Number(rows[1].id)}`
      );
    }
    const after = await prisma.$queryRawUnsafe(
      `SELECT id, weekly_hours FROM contractor_profiles WHERE id IN (${rows.map((row) => Number(row.id)).join(',')}) ORDER BY id ASC`
    );
    const firstAfter = after.find((row) => String(row.id) === String(first.id));
    const parsedA = typeof firstAfter.weekly_hours === 'string' ? JSON.parse(firstAfter.weekly_hours) : firstAfter.weekly_hours;
    if (!parsedA || parsedA.days[0].open !== '07:00') throw new Error('Partner A hours not saved');
    if (rows[1]) {
      const secondAfter = after.find((row) => String(row.id) === String(rows[1].id));
      const parsedB = typeof secondAfter.weekly_hours === 'string' ? JSON.parse(secondAfter.weekly_hours) : secondAfter.weekly_hours;
      if (!parsedB || parsedB.days[0].open !== '09:00') throw new Error('Partner B hours not isolated');
      if (parsedA.days[0].open === parsedB.days[0].open) throw new Error('Hours leaked across partners');
    }
    console.log(JSON.stringify({
      ok: true,
      partners: after.map((row) => ({ id: String(row.id), open: (row.weekly_hours.days || [])[0]?.open })),
    }));
  } finally {
    for (const row of originals) {
      if (row.weekly_hours == null) {
        await prisma.$executeRawUnsafe(`UPDATE contractor_profiles SET weekly_hours = NULL WHERE id = ${Number(row.id)}`);
      } else {
        const json = JSON.stringify(row.weekly_hours).replace(/'/g, "''");
        await prisma.$executeRawUnsafe(`UPDATE contractor_profiles SET weekly_hours = '${json}'::jsonb WHERE id = ${Number(row.id)}`);
      }
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
