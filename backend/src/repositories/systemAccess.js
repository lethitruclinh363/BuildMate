const { env } = require('../config/env');

if (env.databaseProvider === 'postgres') {
  module.exports = require('./system.postgres');
} else {
  module.exports = {
    Notification: require('../models/Notification').Notification,
    AuditLog: require('../models/AuditLog').AuditLog,
    Policy: require('../models/Policy').Policy,
    PolicyRevision: require('../models/PolicyRevision').PolicyRevision,
    LocationCorrection: require('../models/LocationCorrection').LocationCorrection,
  };
}
