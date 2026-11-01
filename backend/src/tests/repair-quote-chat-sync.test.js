const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
const BACKEND_ROOT = path.resolve(__dirname, '..');

function readFe(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

function readBe(rel) {
  return fs.readFileSync(path.join(BACKEND_ROOT, rel), 'utf8');
}

describe('repair request fields stay on the contractor brief', () => {
  it('persists the customer-selected service, media and site on create', () => {
    const service = readBe('services/repairService.js');
    const model = readBe('models/RepairRequest.js');
    const pg = readBe('repositories/conversation.postgres.js');
    assert.match(service, /serviceName,/);
    assert.match(service, /catalogServiceId,/);
    assert.match(service, /images: payload\.images/);
    assert.match(service, /videos: payload\.videos/);
    assert.match(service, /address: site\.address/);
    assert.match(model, /serviceName: this\.serviceName/);
    assert.match(model, /catalogServiceId: this\.catalogServiceId/);
    assert.match(pg, /service_name_snapshot: text\(doc\.serviceName/);
    assert.match(pg, /serviceName: row\.service_name_snapshot/);
    assert.match(pg, /media_type === 'IMAGE'/);
    assert.match(pg, /media_type === 'VIDEO'/);
  });

  it('shows the selected service on a contractor detail view, not the whole crew catalog', () => {
    const list = readFe('pages/contractor/ContractorRequestsPage.tsx');
    const detail = readFe('pages/contractor/ContractorRequestDetailPage.tsx');
    const brief = readFe('features/repair/components/RepairRequestBrief.tsx');
    const app = readFe('App.tsx');
    const types = readFe('types/sprint4.ts');
    assert.match(list, /contractorRequests\.viewDetail/);
    assert.match(list, /line-clamp-2/);
    assert.match(app, /path="\/contractor\/requests\/:id"/);
    assert.match(detail, /RepairRequestBrief/);
    assert.match(brief, /serviceName/);
    assert.match(brief, /SiteLocationCard/);
    assert.match(brief, /item\.images/);
    assert.match(brief, /item\.videos/);
    assert.match(types, /serviceName\?: string/);
    assert.doesNotMatch(brief, /payload\.services/);
  });
});

describe('quotation form keeps the original request context', () => {
  it('loads the same requestId and renders the customer brief above labor costs', () => {
    const page = readFe('pages/contractor/CreateQuotationPage.tsx');
    assert.match(page, /repairApi\.get\(requestId\)/);
    assert.match(page, /RepairRequestBrief/);
    assert.match(page, /quote\.requestContext/);
    assert.match(page, /quotationApi\.create/);
    assert.match(page, /requestId,/);
    assert.doesNotMatch(page, /repairApi\.create/);
  });
});

describe('quotation realtime reaches the open customer chat', () => {
  it('emits the saved quotation message to the room and to both user sockets', () => {
    const chat = readBe('services/chatService.js');
    const quote = readBe('services/quotationService.js');
    const sock = readBe('sockets/chatSocket.js');
    assert.match(chat, /emitToUser/);
    assert.match(chat, /receive_message/);
    assert.match(chat, /quotation:new/);
    assert.match(chat, /roomId: String\(room\._id\)/);
    assert.match(quote, /MESSAGE_TYPE\.QUOTATION/);
    assert.match(quote, /quotationId: quotation\._id/);
    assert.match(sock, /socket\.join\(`room:\$\{String\(room\._id\)\}`\)/);
  });

  it('rejoins the chat room after a socket reconnect and dedupes quotation cards', () => {
    const provider = readFe('providers/SocketProvider.tsx');
    const page = readFe('pages/chat/ChatPage.tsx');
    const card = readFe('features/quotation/components/QuotationCard.tsx');
    assert.match(provider, /socket\.on\('connect'/);
    assert.match(provider, /join_room/);
    assert.match(page, /quotationId/);
    assert.match(page, /quotation:new/);
    assert.match(page, /prev\.some\(\(p\) => p\.id === msg\.id\)/);
    assert.match(card, /materialList/);
    assert.match(card, /quote\.view/);
  });
});
