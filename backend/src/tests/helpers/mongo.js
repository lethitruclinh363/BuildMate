const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

let mongoose;
let skipReason = '';

try {
  mongoose = require('mongoose');
} catch (err) {
  skipReason = err.message;
}

async function ensureMongo() {
  if (!mongoose) return false;
  try {
    if (mongoose.connection.readyState === 1) return true;
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      skipReason = 'MONGODB_URI is not set';
      return false;
    }
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 4000 });
    return true;
  } catch (err) {
    skipReason = 'MongoDB is not available';
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
