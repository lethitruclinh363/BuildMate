const { env } = require('../config/env');

const postgres = env.databaseProvider === 'postgres';
const models = postgres
  ? require('./partner.postgres')
  : {
      ContractorProfile: require('../models/ContractorProfile').ContractorProfile,
      Store: require('../models/Store').Store,
    };

async function loadUser(id) {
  if (!postgres) {
    const { User } = require('../models/user.model');
    return User.findById(id);
  }
  const { userRepository } = require('./userRepository');
  return userRepository.findById(id);
}

async function updateUser(id, fields) {
  if (!postgres) {
    const { User } = require('../models/user.model');
    return User.findByIdAndUpdate(id, fields, { new: true });
  }
  const { userRepository } = require('./userRepository');
  return userRepository.updateById(id, fields);
}

async function findUsersByIds(ids) {
  const unique = [...new Set((ids || []).map((id) => String(id || '')).filter(Boolean))];
  if (!unique.length) return [];
  if (!postgres) {
    const { User } = require('../models/user.model');
    return User.find({ _id: { $in: unique } });
  }
  const { userRepository } = require('./userRepository');
  return userRepository.findManyByIds(unique);
}

async function findUsersByRole(role) {
  if (!postgres) {
    const { User } = require('../models/user.model');
    return User.find({ role }).select('_id');
  }
  const { prisma } = require('../config/prisma');
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
  postgres,
};
