/**
 * Repair, chat, and quotation runtime check.
 * Does not print passwords or connection strings.
 */
process.env.DATABASE_PROVIDER = 'postgres';

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../../src/config/database');
const { prisma } = require('../../src/config/prisma');
const { userRepository } = require('../../src/repositories/userRepository');
const repairService = require('../../src/services/repairService');
const chatService = require('../../src/services/chatService');
const quotationService = require('../../src/services/quotationService');
const socketService = require('../../src/services/socketService');
const { Message } = require('../../src/repositories/conversationAccess');

const stamp = String(Date.now()).slice(-8);
const results = [];
const socketEvents = [];

function record(name, pass, detail) {
  results.push({ name, pass: Boolean(pass), detail: detail || '' });
  console.log(`RESULT ${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function mongoCounts() {
  const db = mongoose.connection.db;
  const names = ['repairrequests', 'chatrooms', 'messages', 'quotations'];
  const counts = {};
  for (const name of names) counts[name] = await db.collection(name).countDocuments();
  return counts;
}

async function main() {
  const original = console.log;
  console.log = (...args) => {
    const text = args.map((item) => (typeof item === 'string' ? item : '')).join(' ');
    if (text.startsWith('RESULT ') || text.startsWith('[db]')) original(...args);
  };
  socketService.setIO({
    to() {
      return { emit: (event, payload) => socketEvents.push({ event, payload }) };
    },
    emit() {},
  });

  await connectDatabase();
  const before = await mongoCounts();
  const ordersBefore = await mongoose.connection.db.collection('orders').countDocuments();

  const store = await prisma.stores.findFirst({
    where: { status: 'LIVE', store_type: 'SERVICES' },
    include: { users: { select: { legacy_mongo_id: true } } },
    orderBy: { id: 'desc' },
  });
  if (!store) throw new Error('No live service store is available for the repair test');
  const contractorId = store.users.legacy_mongo_id;
  const customer = await userRepository.create({
    fullName: 'Repair Customer',
    email: `repair.customer.${stamp}@example.com`,
    password: 'AuthPg1a',
    phoneNumber: `06${stamp}`,
    role: 'CUSTOMER',
    acceptedPolicy: true,
    profileStatus: 'INCOMPLETE',
    status: 'ACTIVE',
    emailVerified: true,
  });

  const created = await repairService.createRequest(customer._id, {
    contractorId,
    storeId: store.legacy_mongo_id,
    catalogServiceId: 'Electrical::Wiring',
    title: `Runtime leak ${stamp}`,
    description: 'Water is coming through the ceiling',
    images: ['/uploads/leak-a.jpg', '/uploads/leak-b.jpg'],
    videos: ['/uploads/leak.mp4'],
    address: '15 Nguyen Van Cu, Can Tho',
    lat: 10.045,
    lng: 105.787,
    locationConfirmed: true,
    locationSource: 'GPS',
  });
  const media = await prisma.repair_request_media.findMany({
    where: { repair_requests: { legacy_mongo_id: created.id } },
  });
  const mine = await repairService.listMine(customer._id);
  const detail = await repairService.getById(created.id, { id: customer._id });
  const received = await repairService.listReceived(contractorId);
  record(
    'customer create repair request with media',
    created.roomId && created.images.length === 2 && created.videos.length === 1 && media.length === 3 && mine.some((item) => item.id === created.id) && detail.title === created.title && received.some((item) => item.id === created.id),
    created.status
  );

  const declined = await repairService.createRequest(customer._id, {
    contractorId,
    catalogServiceId: 'Electrical::Lighting',
    title: `Runtime decline ${stamp}`,
    description: 'Second request that the contractor declines',
    address: '15 Nguyen Van Cu, Can Tho',
    lat: 10.046,
    lng: 105.788,
    locationConfirmed: true,
    locationSource: 'MANUAL_PIN',
  });
  const rejectedRequest = await repairService.setStatus(declined.id, contractorId, 'REJECTED');
  record('contractor decline request', rejectedRequest.status === 'REJECTED', rejectedRequest.status);

  const room = await chatService.assertMember(created.roomId, customer._id);
  const textMessage = await chatService.sendMessage({
    roomId: room._id,
    senderId: customer._id,
    type: 'TEXT',
    content: 'Can you come this afternoon?',
  });
  const imageMessage = await chatService.sendMessage({
    roomId: room._id,
    senderId: contractorId,
    type: 'IMAGE',
    content: '/uploads/chat-photo.jpg',
  });
  const videoMessage = await chatService.sendMessage({
    roomId: room._id,
    senderId: contractorId,
    type: 'VIDEO',
    content: '/uploads/chat-video.mp4',
  });
  const locationMessage = await chatService.sendMessage({
    roomId: room._id,
    senderId: customer._id,
    type: 'LOCATION',
    location: { lat: 10.045, lng: 105.787, address: '15 Nguyen Van Cu', label: 'Job site' },
  });
  const unread = await Message.findOne({ _id: textMessage.id });
  unread.read = true;
  await unread.save();
  const readBack = await Message.findById(textMessage.id);
  const rooms = await chatService.listRooms(customer._id, 'CUSTOMER');
  record(
    'chat text image video location and read',
    textMessage.type === 'TEXT' && textMessage.read === false && imageMessage.type === 'IMAGE' && videoMessage.type === 'VIDEO' && locationMessage.location?.label === 'Job site' && readBack.read === true && rooms.some((item) => item.id === room._id) && socketEvents.some((item) => item.event === 'receive_message'),
    `events ${socketEvents.length}`
  );

  const acceptedRequest = await repairService.setStatus(created.id, contractorId, 'ACCEPTED');
  record('contractor accept request before quotation', acceptedRequest.status === 'ACCEPTED', acceptedRequest.status);

  const firstQuote = await quotationService.createQuotation(contractorId, {
    requestId: created.id,
    transportCost: 50000,
    estimatedDays: 2,
    note: 'First visit included',
    items: [
      { type: 'MATERIAL', name: 'Sealant', quantity: 2, unit: 'tube', price: 40000 },
      { type: 'LABOR', name: 'Repair labor', quantity: 1, unit: 'job', price: 200000 },
    ],
  });
  const modified = await quotationService.customerAction(firstQuote.id, customer._id, 'modify', 'Please reduce the labor cost');
  const revised = await quotationService.createQuotation(contractorId, {
    requestId: created.id,
    transportCost: 20000,
    estimatedDays: 2,
    note: 'Revised after the customer note',
    items: [
      { type: 'MATERIAL', name: 'Sealant', quantity: 2, unit: 'tube', price: 40000 },
      { type: 'LABOR', name: 'Repair labor', quantity: 1, unit: 'job', price: 150000 },
    ],
  });
  const spare = await quotationService.createQuotation(contractorId, {
    requestId: created.id,
    transportCost: 0,
    estimatedDays: 1,
    note: 'Spare quote to decline',
    items: [{ type: 'LABOR', name: 'Inspection', quantity: 1, unit: 'job', price: 80000 }],
  });
  const declinedQuote = await quotationService.customerAction(spare.id, customer._id, 'reject');
  const accepted = await quotationService.customerAction(revised.id, customer._id, 'accept');
  const quoteRow = await prisma.quotations.findFirst({
    where: { legacy_mongo_id: revised.id },
    include: { quotation_items: true },
  });
  const itemTotal = quoteRow.quotation_items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0) + Number(quoteRow.transport_cost);
  const quotationMessages = await chatService.listMessages(room._id, contractorId);
  record(
    'quotation modify reject and accept',
    modified.status === 'MODIFICATION_REQUEST' && declinedQuote.status === 'REJECTED' && accepted.status === 'ACCEPTED' && Number(quoteRow.total_cost) === 250000 && Math.abs(itemTotal - 250000) < 0.001 && quotationMessages.some((item) => item.type === 'QUOTATION' && item.quotation),
    accepted.status
  );

  const sampleRepair = await mongoose.connection.db.collection('repairrequests').findOne();
  const mappedRepair = await prisma.repair_requests.findFirst({ where: { legacy_mongo_id: String(sampleRepair._id) }, select: { id: true } });
  const newRepairInMongo = await mongoose.connection.db.collection('repairrequests').countDocuments({ _id: new mongoose.Types.ObjectId(created.id) });
  const after = await mongoCounts();
  const ordersAfter = await mongoose.connection.db.collection('orders').countDocuments();
  record('old mongo repair mapped and new rows absent', Boolean(mappedRepair) && newRepairInMongo === 0 && JSON.stringify(before) === JSON.stringify(after), JSON.stringify(after));
  record('accept still creates the existing mongo order', ordersAfter === ordersBefore + 1, `orders ${ordersBefore}->${ordersAfter}`);

  const orphans = await prisma.$queryRaw`
    SELECT
      (SELECT COUNT(*) FROM public.repair_requests r LEFT JOIN public.users u ON u.id = r.customer_user_id WHERE u.id IS NULL) AS repair_customer,
      (SELECT COUNT(*) FROM public.chat_rooms c LEFT JOIN public.repair_requests r ON r.id = c.repair_request_id WHERE r.id IS NULL) AS rooms,
      (SELECT COUNT(*) FROM public.quotations q LEFT JOIN public.repair_requests r ON r.id = q.repair_request_id WHERE r.id IS NULL) AS quotes,
      (SELECT COUNT(*) FROM public.quotation_items i LEFT JOIN public.quotations q ON q.id = i.quotation_id WHERE q.id IS NULL) AS items,
      (SELECT COUNT(*) FROM public.messages m LEFT JOIN public.chat_rooms c ON c.id = m.chat_room_id WHERE c.id IS NULL) AS messages
  `;
  const orphanCount = ['repair_customer', 'rooms', 'quotes', 'items', 'messages'].reduce((sum, key) => sum + Number(orphans[0][key]), 0);
  record('repair chat quotation orphans', orphanCount === 0, `orphans ${orphanCount}`);
}

main()
  .catch((error) => {
    record('runtime check', false, error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    const failed = results.filter((item) => !item.pass).length;
    process.stdout.write(`RESULT summary pass=${results.filter((item) => item.pass).length} fail=${failed}\n`);
    await prisma.$disconnect().catch(() => {});
    await disconnectDatabase().catch(() => {});
  });
