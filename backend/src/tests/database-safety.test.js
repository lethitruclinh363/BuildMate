const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  databaseName,
  isBlockedDatabaseName,
  isMaintenanceDatabaseName,
  isolatedTestDatabaseUrl,
} = require('./helpers/database-safety');

describe('database safety guards', () => {
  it('treats BuilMate as a blocked runtime database name', () => {
    assert.equal(isBlockedDatabaseName('BuilMate'), true);
    assert.equal(isBlockedDatabaseName('builmate'), true);
    assert.equal(isBlockedDatabaseName('postgres'), true);
  });

  it('allows postgres only as the maintenance database, never as TEST_DATABASE_URL', () => {
    assert.equal(isMaintenanceDatabaseName('postgres'), true);
    assert.equal(isMaintenanceDatabaseName('BuilMate'), false);
    assert.equal(isMaintenanceDatabaseName('BuilMate_test'), false);
    const previous = process.env.TEST_DATABASE_URL;
    process.env.TEST_DATABASE_URL = 'postgresql://user:secret@127.0.0.1:55432/postgres';
    try {
      assert.equal(isolatedTestDatabaseUrl(), '');
    } finally {
      if (previous == null) delete process.env.TEST_DATABASE_URL;
      else process.env.TEST_DATABASE_URL = previous;
    }
  });

  it('extracts the database name without printing credentials', () => {
    assert.equal(databaseName('postgresql://user:secret@example.internal:5432/BuilMate_test'), 'BuilMate_test');
  });

  it('rejects a TEST_DATABASE_URL that still points at BuilMate', () => {
    const previous = process.env.TEST_DATABASE_URL;
    process.env.TEST_DATABASE_URL = 'postgresql://user:secret@example.internal:5432/BuilMate';
    try {
      assert.equal(isolatedTestDatabaseUrl(), '');
    } finally {
      if (previous == null) delete process.env.TEST_DATABASE_URL;
      else process.env.TEST_DATABASE_URL = previous;
    }
  });

  it('rejects a remote TEST_DATABASE_URL even when the database name is BuilMate_test', () => {
    const previous = process.env.TEST_DATABASE_URL;
    const allow = process.env.TEST_ALLOW_REMOTE;
    process.env.TEST_DATABASE_URL = 'postgresql://user:secret@171.244.39.202:5432/BuilMate_test';
    delete process.env.TEST_ALLOW_REMOTE;
    try {
      assert.equal(isolatedTestDatabaseUrl(), '');
    } finally {
      if (previous == null) delete process.env.TEST_DATABASE_URL;
      else process.env.TEST_DATABASE_URL = previous;
      if (allow == null) delete process.env.TEST_ALLOW_REMOTE;
      else process.env.TEST_ALLOW_REMOTE = allow;
    }
  });
});
