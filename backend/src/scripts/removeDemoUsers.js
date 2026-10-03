/**
 * Xóa tài khoản demo và dữ liệu gắn với họ.
 * Không chạy khi file này chỉ được require.
 * Chạy: node src/scripts/remove-demo-users.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const readline = require('readline');
const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const { User } = require('../models/User');
const { ContractorProfile } = require('../models/ContractorProfile');
const { Store } = require('../models/Store');
const { Service } = require('../models/Service');
const { Material } = require('../models/Material');
const { RepairRequest } = require('../models/RepairRequest');
const { ChatRoom } = require('../models/ChatRoom');
const { Message } = require('../models/Message');
const { Quotation } = require('../models/Quotation');
const { Order } = require('../models/Order');
const { Payment } = require('../models/Payment');
const { Commission } = require('../models/Commission');
const { Review } = require('../models/Review');
const { Complaint } = require('../models/Complaint');
const { Notification } = require('../models/Notification');
const { ProgressUpdate } = require('../models/ProgressUpdate');
const { AuditLog } = require('../models/AuditLog');

const DEMO_EMAILS = [
  'oscar.d@example.net',
  'carol.w@example.org',
  'paula.r@example.org',
  'marco.r@example.org',
  'hannah.h@example.com',
  'alice.j@example.com',
  'xavier.y@example.org',
  'yosef.c@example.com',
  'laura.c@example.net',
  'ursula.b@example.com',
  'yosef.c@example.com',
];

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || '').trim().toLowerCase());
    });
  });
}

async function removeRelated(userIds) {
  const stores = await Store.find({ contractorId: { $in: userIds } }).select('_id');
  const storeIds = stores.map((row) => row._id);

  const orders = await Order.find({
    $or: [{ customerId: { $in: userIds } }, { contractorId: { $in: userIds } }, { storeId: { $in: storeIds } }],
  }).select('_id');
  const orderIds = orders.map((row) => row._id);

  const requests = await RepairRequest.find({
    $or: [{ customerId: { $in: userIds } }, { contractorId: { $in: userIds } }, { storeId: { $in: storeIds } }],
  }).select('_id');
  const requestIds = requests.map((row) => row._id);

  const rooms = await ChatRoom.find({
    $or: [{ customerId: { $in: userIds } }, { contractorId: { $in: userIds } }, { requestId: { $in: requestIds } }],
  }).select('_id');
  const roomIds = rooms.map((row) => row._id);

  const counts = {};
  const drop = async (label, model, filter) => {
    const result = await model.deleteMany(filter);
    counts[label] = result.deletedCount || 0;
  };

  await drop('messages', Message, { $or: [{ senderId: { $in: userIds } }, { roomId: { $in: roomIds } }] });
  await drop('chatRooms', ChatRoom, { _id: { $in: roomIds } });
  await drop('notifications', Notification, { userId: { $in: userIds } });
  await drop('complaints', Complaint, {
    $or: [{ createdBy: { $in: userIds } }, { againstUser: { $in: userIds } }, { orderId: { $in: orderIds } }],
  });
  await drop('reviews', Review, {
    $or: [{ customerId: { $in: userIds } }, { targetUserId: { $in: userIds } }, { orderId: { $in: orderIds } }],
  });
  await drop('commissions', Commission, {
    $or: [{ contractorId: { $in: userIds } }, { orderId: { $in: orderIds } }],
  });
  await drop('payments', Payment, {
    $or: [{ customerId: { $in: userIds } }, { contractorId: { $in: userIds } }, { orderId: { $in: orderIds } }],
  });
  await drop('progressUpdates', ProgressUpdate, { orderId: { $in: orderIds } });
  await drop('quotations', Quotation, {
    $or: [{ customerId: { $in: userIds } }, { contractorId: { $in: userIds } }, { requestId: { $in: requestIds } }],
  });
  await drop('repairRequests', RepairRequest, { _id: { $in: requestIds } });
  await drop('orders', Order, { _id: { $in: orderIds } });
  await drop('services', Service, { $or: [{ contractorId: { $in: userIds } }, { storeId: { $in: storeIds } }] });
  await drop('materials', Material, { $or: [{ contractorId: { $in: userIds } }, { storeId: { $in: storeIds } }] });
  await drop('stores', Store, { _id: { $in: storeIds } });
  await drop('contractorProfiles', ContractorProfile, { userId: { $in: userIds } });
  await drop('auditLogs', AuditLog, { actorId: { $in: userIds } });
  await drop('users', User, { _id: { $in: userIds } });

  const db = mongoose.connection.db;
  for (const name of ['workers', 'workerprofiles', 'workassignments', 'assignments']) {
    const exists = await db.listCollections({ name }).hasNext();
    if (!exists) continue;
    await db.collection(name).drop();
    counts[name] = 'dropped';
  }
  return counts;
}

async function main() {
  await connectDatabase();
  const users = await User.find({
    $or: [{ email: { $in: DEMO_EMAILS } }, { role: 'WORKER' }],
  }).select('email role name');

  console.log('Found users:');
  if (!users.length) {
    console.log('- (none)');
    await mongoose.disconnect();
    return;
  }
  users.forEach((user) => {
    console.log(`- ${user.email} ${user.role} ${user.name || ''}`);
  });

  const answer = await ask('DELETE THESE USERS? (yes/no) ');
  if (answer !== 'yes') {
    console.log('Aborted. No data deleted.');
    await mongoose.disconnect();
    return;
  }

  const counts = await removeRelated(users.map((user) => user._id));
  console.log('Deleted:');
  Object.entries(counts).forEach(([label, count]) => {
    console.log(`- ${label}: ${count}`);
  });
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('[cleanup] Failed:', err);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });
}

module.exports = { DEMO_EMAILS, removeRelated };
