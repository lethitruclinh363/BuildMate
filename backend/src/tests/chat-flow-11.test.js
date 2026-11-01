const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isAllowedFile, isChatMedia } = require('../utils/upload');
const { sendMessageSchema } = require('../validators/sprint4.validator');
const { materialStatusNotice } = require('../utils/material-order.rules');
const { NOTIFICATION_TYPE } = require('../models/Notification');
const { MESSAGE_TYPE } = require('../models/Message');
const { testDatabaseReady } = require('./helpers/pg-cleanup');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
const ADMIN_ROOT = path.resolve(__dirname, '../../../admin/src');
const BACKEND_ROOT = path.resolve(__dirname, '..');

function readFe(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

function readAdmin(rel) {
  return fs.readFileSync(path.join(ADMIN_ROOT, rel), 'utf8');
}

function readBe(rel) {
  return fs.readFileSync(path.join(BACKEND_ROOT, rel), 'utf8');
}

describe('Flow 11 chat rooms and membership', () => {
  it('binds a room to one repair request and only those two members', () => {
    const schema = fs.readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
    const roomModel = readBe('models/ChatRoom.js');
    const chat = readBe('services/chatService.js');
    const repair = readBe('services/repairService.js');
    const roomsBlock = schema.slice(schema.indexOf('model chat_rooms'), schema.indexOf('model commission_rules'));
    assert.match(roomsBlock, /repair_request_id\s+BigInt\?/);
    assert.match(roomsBlock, /store_id/);
    assert.doesNotMatch(roomsBlock, /material_order_id/);
    assert.match(chat, /createRoomForRequest/);
    assert.match(chat, /requestId: request\._id/);
    assert.match(repair, /const room = await createRoomForRequest\(request\)/);
    assert.match(chat, /You are not in this conversation/);
    assert.match(chat, /String\(room\.customerId\) !== uid && String\(room\.contractorId\) !== uid/);
    assert.doesNotMatch(chat, /materialOrderId/);
  });

  it('adds a Customer–Material Store room without replacing repair chat', () => {
    const app = readFe('App.tsx');
    const storeNav = readFe('pages/store/StoreDashboard.jsx');
    const explore = readFe('features/map/components/ExplorePopup.tsx');
    const chat = readBe('services/chatService.js');
    const material = readBe('services/material-order.service.js');
    assert.match(app, /path="\/store\/chat\/:roomId"/);
    assert.match(storeNav, /\/store\/chat/);
    assert.match(explore, /kind === 'contractor' \? repairCreatePath/);
    assert.match(chat, /createRoomForStore/);
    assert.match(chat, /MATERIAL_STORE_OWNER/);
    assert.doesNotMatch(material, /createRoomForRequest|ChatRoom/);
  });

  it('keeps chat open after request status changes and still gates quotes', () => {
    const chat = readBe('services/chatService.js');
    const page = readFe('pages/chat/ChatPage.tsx');
    assert.doesNotMatch(chat, /REQUEST_STATUS/);
    assert.match(page, /canCreateQuotation\(room\?\.request\?\.status\)/);
  });
});

describe('Flow 11 messages, media and location', () => {
  it('persists TEXT IMAGE VIDEO QUOTATION LOCATION and rejects empty media', () => {
    assert.deepEqual(Object.values(MESSAGE_TYPE).sort(), [
      'IMAGE',
      'LOCATION',
      'QUOTATION',
      'TEXT',
      'VIDEO',
    ]);
    assert.equal(sendMessageSchema.safeParse({ type: 'TEXT', content: 'Xin chào' }).success, true);
    assert.equal(sendMessageSchema.safeParse({ type: 'TEXT', content: '' }).success, true);
    assert.equal(sendMessageSchema.safeParse({ type: 'IMAGE', content: '/uploads/chat/a.jpg' }).success, true);
    assert.equal(sendMessageSchema.safeParse({ type: 'IMAGE', content: '   ' }).success, false);
    assert.equal(sendMessageSchema.safeParse({ type: 'VIDEO' }).success, false);
    const chat = readBe('services/chatService.js');
    const controller = readBe('controllers/chatController.js');
    assert.match(controller, /Message cannot be empty/);
    assert.match(chat, /Media cannot be empty/);
    assert.match(chat, /Chat media must be uploaded through BuildMate/);
    assert.match(chat, /\/uploads\/chat\//);
  });

  it('rejects dangerous chat uploads and sizes video like repair media', () => {
    assert.equal(isChatMedia({ originalname: 'site.jpg', mimetype: 'image/jpeg' }), true);
    assert.equal(isChatMedia({ originalname: 'clip.mp4', mimetype: 'video/mp4' }), true);
    assert.equal(isChatMedia({ originalname: 'secret.pdf', mimetype: 'application/pdf' }), false);
    assert.equal(isChatMedia({ originalname: 'payload.exe', mimetype: 'application/octet-stream' }), false);
    assert.equal(isAllowedFile({ originalname: 'secret.pdf', mimetype: 'application/pdf' }), true);
    const upload = readBe('middleware/uploadMiddleware.js');
    const routes = readBe('routes/chatRoutes.js');
    assert.match(upload, /folderName === UPLOAD_SCOPES\.chat/);
    assert.match(upload, /isChatMedia\(file\)/);
    assert.match(upload, /isRepairMedia\(file\)/);
    assert.match(upload, /scope === 'repair' \|\| scope === 'chat' \? '\.mp4'/);
    assert.match(routes, /assertMember\(req\.params\.roomId, req\.user\.id\)/);
    assert.match(routes, /chatUpload\.single\('file'\)/);
  });

  it('dedupes HTTP plus socket messages and restores text after a send failure', () => {
    const page = readFe('pages/chat/ChatPage.tsx');
    const socket = readFe('providers/SocketProvider.tsx');
    const media = readFe('lib/partner-api.ts');
    assert.match(page, /sendingText\.current/);
    assert.match(page, /sendingFile\.current/);
    assert.match(page, /prev\.some\(\(p\) => p\.id === msg\.id\)/);
    assert.match(page, /prev\.some\(\(item\) => item\.id === data\.data\.id\)/);
    assert.match(page, /setText\(content\)/);
    assert.match(page, /msg\.content/);
    assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
    assert.match(socket, /socket\.off\('receive_message', onReceive\)/);
    assert.match(media, /if \(value\.startsWith\('private:'\)\) return ''/);
  });
});

describe('Flow 11 realtime and notifications', () => {
  it('authenticates sockets, joins only member rooms, and ignores stray typing', () => {
    const sock = readBe('sockets/chatSocket.js');
    const provider = readFe('providers/SocketProvider.tsx');
    assert.match(sock, /verifyToken\(token\)/);
    assert.match(sock, /assertMember\(roomId, userId\)/);
    assert.match(sock, /socket\.join\(`room:\$\{String\(room\._id\)\}`\)/);
    assert.match(sock, /senderId: userId/);
    assert.match(sock, /socket\.rooms\.has\(`room:\$\{roomId\}`\)/);
    assert.match(provider, /instance\.disconnect\(\)/);
    assert.match(provider, /setItems\(\[\]\)/);
    assert.match(provider, /n\?\.id && prev\.some\(\(item\) => item\.id === n\.id\)/);
  });

  it('scopes notification list and read to the signed-in user', () => {
    const routes = readBe('routes/notificationRoutes.js');
    const service = readBe('services/notificationService.js');
    const bell = readFe('features/notification/components/NotificationBell.tsx');
    const inbox = readFe('pages/notifications/NotificationsPage.tsx');
    const adminCss = readAdmin('styles/index.css');
    assert.match(routes, /router\.use\(authenticate\)/);
    assert.match(service, /filter = \{ userId \}/);
    assert.match(service, /findOneAndUpdate\(\s*\{\s*_id: id, userId/);
    assert.match(bell, /\[setNotifications, userId\]/);
    assert.match(bell, /break-words/);
    assert.match(bell, /wasUnread \? Math\.max\(0, unread - 1\)/);
    assert.match(inbox, /break-words/);
    assert.match(adminCss, /overflow-wrap: anywhere/);
    assert.match(adminCss, /color: #17324d/);
  });

  it('creates repair, quote, deposit and progress notices for the other party', () => {
    const repair = readBe('services/repairService.js');
    const quote = readBe('services/quotationService.js');
    const payment = readBe('services/paymentService.js');
    const progress = readBe('services/progressService.js');
    const order = readBe('services/orderService.js');
    const complaint = readBe('services/complaintService.js');
    assert.match(repair, /NOTIFICATION_TYPE\.REQUEST/);
    assert.match(repair, /Request accepted/);
    assert.match(repair, /Request declined/);
    assert.match(quote, /NOTIFICATION_TYPE\.QUOTATION/);
    assert.match(quote, /QUOTATION_ACCEPTED/);
    assert.match(quote, /QUOTATION_REJECTED/);
    assert.match(payment, /Deposit held in escrow/);
    assert.match(progress, /contractorJobNotice/);
    assert.match(order, /Customer accepted the job/);
    assert.match(order, /Order cancelled/);
    assert.match(order, /\/customer\/orders\/\$\{order\._id\}/);
    assert.match(order, /\/contractor\/orders\/\$\{order\._id\}/);
    assert.match(complaint, /NEW_COMPLAINT/);
    assert.equal(NOTIFICATION_TYPE.MESSAGE, 'MESSAGE');
    assert.equal(NOTIFICATION_TYPE.CONTRACTOR_COMPLETED_JOB, 'CONTRACTOR_COMPLETED_JOB');
  });

  it('notifies material COD for new orders and the four live statuses, not prepare or cancel', () => {
    const material = readBe('services/material-order.service.js');
    assert.match(material, /New material order/);
    assert.match(material, /\/store\/orders\/\$\{order\._id\}/);
    assert.match(material, /material_order_updated/);
    assert.equal(materialStatusNotice('CONFIRMED', 'VL-1').audience, 'customer');
    assert.equal(materialStatusNotice('DELIVERING', 'VL-1').audience, 'customer');
    assert.equal(materialStatusNotice('DELIVERED', 'VL-1').audience, 'customer');
    assert.equal(materialStatusNotice('CUSTOMER_RECEIVED', 'VL-1').audience, 'store');
    assert.equal(materialStatusNotice('PREPARING', 'VL-1'), null);
    assert.equal(materialStatusNotice('READY_FOR_DELIVERY', 'VL-1'), null);
    assert.equal(materialStatusNotice('COMPLETED', 'VL-1'), null);
    assert.equal(materialStatusNotice('CANCELLED', 'VL-1'), null);
  });
});

describe('Flow 11 HTTP auth when API is up', () => {
  it('rejects unauthenticated chat and notification reads', async (t) => {
    const origin = process.env.BUILDMATE_API_ORIGIN || 'http://127.0.0.1:5000';
    try {
      const health = await fetch(`${origin}/api/health`);
      if (!health.ok) {
        t.skip('API is not reachable');
        return;
      }
    } catch {
      t.skip('API is not reachable');
      return;
    }
    const id = '000000000000000000000000';
    const rooms = await fetch(`${origin}/api/chat/rooms`);
    const messages = await fetch(`${origin}/api/chat/rooms/${id}/messages`);
    const send = await fetch(`${origin}/api/chat/rooms/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'TEXT', content: 'hello' }),
    });
    const notices = await fetch(`${origin}/api/notifications`);
    assert.equal(rooms.status, 401);
    assert.equal(messages.status, 401);
    assert.equal(send.status, 401);
    assert.equal(notices.status, 401);
  });
});

describe('Flow 11 isolated Postgres journeys', () => {
  it('skips live chat HTTP when the isolated test database is down', async (t) => {
    if (testDatabaseReady()) {
      t.skip('Covered by chat HTTP when isolated Postgres is up');
      return;
    }
    t.skip('PostgreSQL test database is not available');
  });
});
