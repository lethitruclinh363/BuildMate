const { User } = require('../models/User');
const { Store } = require('../models/Store');
const { RepairRequest, REQUEST_STATUS, REPAIR_CATEGORY } = require('../models/RepairRequest');
const { ChatRoom } = require('../models/ChatRoom');
const { Message, MESSAGE_TYPE } = require('../models/Message');
const { Quotation, QUOTE_ITEM_TYPE, QUOTATION_STATUS } = require('../models/Quotation');
const { Notification, NOTIFICATION_TYPE } = require('../models/Notification');
const { AuditLog, AUDIT_ACTION } = require('../models/AuditLog');

async function upsertRequest({ customer, contractor, store, payload }) {
  let request = await RepairRequest.findOne({ customerId: customer._id, title: payload.title });
  if (!request) {
    request = await RepairRequest.create({
      customerId: customer._id,
      contractorId: contractor._id,
      storeId: store?._id || null,
      ...payload,
    });
  } else {
    request.status = payload.status;
    request.description = payload.description;
    if (store?._id) request.storeId = store._id;
    await request.save();
  }
  return request;
}

async function seedSprint45() {
  const customer = await User.findOne({ email: 'oscar.d@example.net' });
  const anPhu = await User.findOne({ email: 'paula.r@example.org' });
  const admin = await User.findOne({ email: 'ivan.p@example.net' });

  if (!customer || !anPhu) {
    console.warn('[seed] Sprint 4.5 skipped — customer or contractor missing');
    return;
  }

  const anPhuStore = await Store.findOne({ contractorId: anPhu._id });

  const leak = await upsertRequest({
    customer,
    contractor: anPhu,
    store: anPhuStore,
    payload: {
      category: REPAIR_CATEGORY.WATERPROOF,
      title: 'Bathroom leak above the downstairs ceiling',
      description:
        'Water stains appeared on the ground-floor ceiling after every shower. Tiles look intact; we suspect the wet-room membrane.',
      images: ['https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80'],
      address: '12 Nguyen Van Cu, Ninh Kieu, Can Tho',
      location: { type: 'Point', coordinates: [105.748, 10.046] },
      status: REQUEST_STATUS.ACCEPTED,
    },
  });

  async function ensureRoom(request) {
    return ChatRoom.findOneAndUpdate(
      { requestId: request._id },
      {
        customerId: request.customerId,
        contractorId: request.contractorId,
        requestId: request._id,
        lastMessage: 'Repair request opened',
        lastMessageAt: new Date(),
      },
      { upsert: true, new: true }
    );
  }

  const leakRoom = await ensureRoom(leak);

  const leakQuote =
    (await Quotation.findOne({ requestId: leak._id })) ||
    (await Quotation.create({
      requestId: leak._id,
      customerId: customer._id,
      contractorId: anPhu._id,
      roomId: leakRoom._id,
      items: [
        { type: QUOTE_ITEM_TYPE.LABOR, name: 'Bathroom waterproofing', quantity: 1, unit: 'JOB', price: 2800000 },
        { type: QUOTE_ITEM_TYPE.MATERIAL, name: 'Kova CT-11A coating', quantity: 2, unit: 'pail', price: 385000 },
        { type: QUOTE_ITEM_TYPE.MATERIAL, name: 'Sika 107 slurry', quantity: 1, unit: 'set', price: 520000 },
      ],
      materialCost: 1290000,
      laborCost: 2800000,
      transportCost: 120000,
      totalCost: 4210000,
      estimatedDays: 3,
      note: 'Includes flood test. Access needed 07:30–16:00.',
      status: QUOTATION_STATUS.ACCEPTED,
    }));

  if (leakQuote.status !== QUOTATION_STATUS.ACCEPTED) {
    leakQuote.status = QUOTATION_STATUS.ACCEPTED;
    await leakQuote.save();
  }

  async function seedMessages(room, rows) {
    const count = await Message.countDocuments({ roomId: room._id });
    if (count > 0) return;
    await Message.insertMany(
      rows.map((row, index) => ({
        roomId: room._id,
        senderId: row.senderId,
        type: row.type || MESSAGE_TYPE.TEXT,
        content: row.content,
        quotationId: row.quotationId || null,
        createdAt: new Date(Date.now() - (rows.length - index) * 60 * 60 * 1000),
      }))
    );
    const last = rows[rows.length - 1];
    room.lastMessage = last.content;
    room.lastMessageAt = new Date();
    await room.save();
  }

  await seedMessages(leakRoom, [
    { senderId: customer._id, content: 'The stain is getting larger after every shower. Photos attached on the request.' },
    { senderId: anPhu._id, content: 'We can inspect the wet-room membrane tomorrow. Sending a quotation now.' },
    {
      senderId: anPhu._id,
      type: MESSAGE_TYPE.QUOTATION,
      content: 'Quotation 4.210.000đ',
      quotationId: leakQuote._id,
    },
    { senderId: customer._id, content: 'Looks clear. I accepted the quote — please confirm the start time.' },
  ]);

  const notifSpecs = [
    {
      userId: customer._id,
      title: 'New quotation',
      message: 'Bathroom leak above the downstairs ceiling · 4.210.000đ',
      type: NOTIFICATION_TYPE.QUOTATION,
      link: `/customer/quotation/${leakQuote._id}`,
    },
    {
      userId: anPhu._id,
      title: 'Quotation accepted',
      message: 'Bathroom leak above the downstairs ceiling',
      type: NOTIFICATION_TYPE.QUOTATION_ACCEPTED,
      link: `/contractor/chat/${leakRoom._id}`,
    },
    {
      userId: customer._id,
      title: 'Request accepted',
      message: 'Bathroom leak above the downstairs ceiling',
      type: NOTIFICATION_TYPE.STATUS_UPDATE,
      link: `/customer/chat/${leakRoom._id}`,
    },
    {
      userId: customer._id,
      title: 'New message',
      message: 'We can inspect the wet-room membrane tomorrow.',
      type: NOTIFICATION_TYPE.MESSAGE,
      link: `/customer/chat/${leakRoom._id}`,
    },
  ];

  for (const spec of notifSpecs) {
    const exists = await Notification.findOne({ userId: spec.userId, title: spec.title, message: spec.message });
    if (!exists) await Notification.create(spec);
  }

  const auditExists = await AuditLog.findOne({ action: AUDIT_ACTION.QUOTATION_ACCEPTED, entityId: String(leakQuote._id) });
  if (!auditExists) {
    await AuditLog.insertMany([
      {
        actorId: admin?._id,
        actorRole: 'ADMIN',
        action: AUDIT_ACTION.ADMIN_APPROVE,
        entityType: 'ContractorProfile',
        entityId: String(anPhu._id),
        meta: { businessName: 'An Phu Construction' },
      },
      {
        actorId: customer._id,
        actorRole: 'CUSTOMER',
        action: AUDIT_ACTION.QUOTATION_ACCEPTED,
        entityType: 'Quotation',
        entityId: String(leakQuote._id),
        meta: { totalCost: leakQuote.totalCost },
      },
      {
        actorId: anPhu._id,
        actorRole: 'CONTRACTOR',
        action: AUDIT_ACTION.REQUEST_STATUS,
        entityType: 'RepairRequest',
        entityId: String(leak._id),
        meta: { status: REQUEST_STATUS.ACCEPTED },
      },
    ]);
  }

  console.log('[seed] Sprint 4.5 demo requests, chat, quotations, notifications ready');
}

module.exports = { seedSprint45 };
