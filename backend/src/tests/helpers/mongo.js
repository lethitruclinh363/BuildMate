const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

let connectDatabase;
let mongoose;
let skipReason = '';

try {
  ({ connectDatabase } = require('../../config/database'));
  mongoose = require('mongoose');
} catch (err) {
  skipReason = err.message;
}

async function ensureMongo() {
  if (!connectDatabase) return false;
  try {
    if (mongoose.connection.readyState === 1) return true;
    await connectDatabase();
    return true;
  } catch (err) {
    skipReason = err.message;
    return false;
  }
}

function mongoSkip() {
  return skipReason || 'MongoDB is not available';
}

async function stopMongo() {
  if (mongoose && mongoose.connection.readyState) {
    await mongoose.disconnect();
  }
}

module.exports = { ensureMongo, mongoSkip, stopMongo, mongoose };
