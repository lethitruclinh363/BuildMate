const models = require('./partner.postgres');
const { userRepository } = require('./userRepository');
const { prisma } = require('../config/prisma');

async function loadUser(id) {
  return userRepository.findById(id);
}

async function updateUser(id, fields) {
  return userRepository.updateById(id, fields);
}

async function findUsersByIds(ids) {
  const unique = [...new Set((ids || []).map((id) => String(id || '')).filter(Boolean))];
  if (!unique.length) return [];
  return userRepository.findManyByIds(unique);
}

async function findUsersByRole(role) {
  const rows = await prisma.users.findMany({
    where: { roles: { code: role } },
    select: { legacy_mongo_id: true },
  });
  return rows.map((row) => ({ _id: row.legacy_mongo_id }));
}

module.exports = {
  ContractorProfile: models.ContractorProfile,
  Store: models.Store,
  loadUser,
  updateUser,
  findUsersByIds,
  findUsersByRole,
  postgres: true,
};
