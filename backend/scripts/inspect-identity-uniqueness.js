const { prisma } = require('../src/config/prisma');

function json(value) {
  return JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? item.toString() : item), 2);
}

async function main() {
  const indexes = await prisma.$queryRawUnsafe(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'users'
      AND (indexdef ILIKE '%email%' OR indexdef ILIKE '%phone%')
    ORDER BY indexname
  `);
  const emailDupes = await prisma.$queryRawUnsafe(`
    SELECT lower(email) AS email, count(*)::int AS n
    FROM users
    GROUP BY lower(email)
    HAVING count(*) > 1
  `);
  const phoneDupes = await prisma.$queryRawUnsafe(`
    SELECT phone_number, count(*)::int AS n
    FROM users
    WHERE phone_number IS NOT NULL AND btrim(phone_number) <> ''
    GROUP BY phone_number
    HAVING count(*) > 1
  `);
  const phoneNormDupes = await prisma.$queryRawUnsafe(`
    SELECT
      CASE
        WHEN regexp_replace(phone_number, '[^0-9+]', '', 'g') ~ '^\\+?84'
          THEN '0' || regexp_replace(regexp_replace(phone_number, '[^0-9+]', '', 'g'), '^\\+?84', '')
        ELSE regexp_replace(phone_number, '[^0-9]', '', 'g')
      END AS normalized,
      count(*)::int AS n
    FROM users
    WHERE phone_number IS NOT NULL AND btrim(phone_number) <> ''
    GROUP BY 1
    HAVING count(*) > 1
  `);
  const profileDupes = await prisma.$queryRawUnsafe(`
    SELECT user_id, count(*)::int AS n
    FROM contractor_profiles
    GROUP BY user_id
    HAVING count(*) > 1
  `);
  const storeDupes = await prisma.$queryRawUnsafe(`
    SELECT owner_user_id, count(*)::int AS n
    FROM stores
    GROUP BY owner_user_id
    HAVING count(*) > 1
  `);
  const profileIdx = await prisma.$queryRawUnsafe(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE tablename IN ('contractor_profiles', 'stores')
      AND (indexdef ILIKE '%user_id%' OR indexdef ILIKE '%owner_user_id%')
    ORDER BY tablename, indexname
  `);
  const envFacts = await prisma.$queryRawUnsafe(`
    SELECT
      current_database() AS database_name,
      current_user AS db_user,
      (SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user) AS can_create_database
  `);
  const leftoverTestUsers = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS n
    FROM users
    WHERE lower(email) LIKE '%@buildmate.test'
  `);
  const emptyPhones = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS n
    FROM users
    WHERE phone_number IS NULL OR btrim(phone_number) = ''
  `);
  console.log(json({
    testDatabaseUrlConfigured: Boolean(process.env.TEST_DATABASE_URL),
    envFacts,
    leftoverTestUsers,
    emptyPhones,
    indexes,
    emailDupes,
    phoneDupes,
    phoneNormDupes,
    profileDupes,
    storeDupes,
    profileIdx,
  }));
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
