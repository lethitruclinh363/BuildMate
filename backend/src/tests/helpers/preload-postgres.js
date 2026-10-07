const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env.migration'), override: true });

function databaseName(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  const name = databaseName(testUrl);
  const productionName = process.env.PGDATABASE || 'BuilMate';
  if (!name || name.toLowerCase() === 'builmate' || name.toLowerCase() === productionName.toLowerCase()) {
    throw new Error('TEST_DATABASE_URL must point at a database other than production BuilMate');
  }
  process.env.DATABASE_URL = testUrl;
  process.env.BUILDMATE_TEST_DATABASE = 'isolated';
} else {
  process.env.DATABASE_PROVIDER = 'postgres';
  process.env.BUILDMATE_TEST_DATABASE = 'scoped';
  if (!global.__buildmateTestDbWarned) {
    global.__buildmateTestDbWarned = true;
    console.warn(
      '[test] TEST_DATABASE_URL is not set. Fixtures use the runtime database and cleanup deletes only @buildmate.test rows. Provide a separate database before treating this suite as isolated from BuilMate.'
    );
  }
}

process.env.DATABASE_PROVIDER = 'postgres';
