const { env } = require('../config/env');

if (env.databaseProvider === 'postgres') {
  module.exports = require('./ekyc.postgres');
} else {
  module.exports = {
    ContractorEkycVerification: require('../models/ContractorEkycVerification').ContractorEkycVerification,
  };
}
