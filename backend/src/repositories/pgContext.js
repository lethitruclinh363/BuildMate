const { AsyncLocalStorage } = require('async_hooks');
const { prisma } = require('../config/prisma');

const storage = new AsyncLocalStorage();

function db() {
  return storage.getStore() || prisma;
}

function runInTransaction(work) {
  const current = storage.getStore();
  if (current) return work(current);
  return prisma.$transaction((tx) => storage.run(tx, () => work(tx)), { timeout: 20000 });
}

module.exports = { db, runInTransaction };
