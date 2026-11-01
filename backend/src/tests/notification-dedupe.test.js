const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
const BACKEND_ROOT = path.resolve(__dirname, '..');

function readFe(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

function readBe(rel) {
  return fs.readFileSync(path.join(BACKEND_ROOT, rel), 'utf8');
}

describe('notification duplication — one successful action, one toast', () => {
  it('does not emit order_created to the chat room after already emitting to both users', () => {
    const order = readBe('services/orderService.js');
    assert.match(order, /function isActor/);
    assert.match(order, /function emitOrder/);
    assert.match(order, /actorId/);
    assert.match(order, /if \(!isActor\(order\.customerId, actorId\)\)/);
    assert.match(order, /if \(!isActor\(order\.contractorId, actorId\)\)/);
    assert.doesNotMatch(order, /emitToRoom\(room\._id,\s*'order_created'/);
    assert.match(order, /emitCreated\(created\.order, room, actorId\)/);
    assert.match(order, /emitOrder\('order_completed', order, \{ actorId: customerId \}\)/);
  });

  it('emits contractor job socket events only to the customer, with actorId', () => {
    const progress = readBe('services/progressService.js');
    assert.match(progress, /actorId: String\(user\.id\)/);
    assert.match(progress, /emitToUser\(order\.customerId, notice\.event, payloadOut\)/);
    assert.doesNotMatch(progress, /emitToUser\(order\.contractorId, notice\.event/);
    assert.match(progress, /dedupeKey: `progress:\$\{progress\._id\}`/);
  });

  it('skips creating a second notification when the same dedupeKey already exists', () => {
    const notify = readBe('services/notificationService.js');
    assert.match(notify, /meta\.dedupeKey/);
    assert.match(notify, /Notification\.findOne/);
    assert.match(notify, /'meta\.dedupeKey'/);

    const order = readBe('services/orderService.js');
    assert.match(order, /dedupeKey: `order-created:\$\{quotation\._id\}`/);
    assert.match(order, /dedupeKey: `order-completed:\$\{order\._id\}`/);

    const payment = readBe('services/paymentService.js');
    assert.match(payment, /dedupeKey: `payment-success:\$\{payment\._id\}`/);

    const quote = readBe('services/quotationService.js');
    assert.match(quote, /dedupeKey: `quotation-accepted:\$\{quotation\._id\}`/);
  });

  it('skips realtime toasts when the current user is the actor and keys toasts by event id', () => {
    const listener = readFe('features/orders/components/OrderRealtimeListener.tsx');
    assert.match(listener, /useAuthStore/);
    assert.match(listener, /actorId/);
    assert.match(listener, /String\(payload\.actorId\) === String\(user\.id\)/);
    assert.match(listener, /id: `\$\{event\}:\$\{/);
    assert.match(listener, /socket\.off\(event, handler\)/);

    const finance = readFe('features/payments/components/FinanceRealtimeListener.tsx');
    assert.match(finance, /id: n\.id \? `notification:\$\{n\.id\}`/);
    assert.match(finance, /socket\.off\('notification:new', handler\)/);

    const toasts = readFe('store/toast.store.ts');
    assert.match(toasts, /seenToastIds/);
    assert.match(toasts, /seenToastIds\.has\(provided\)/);
  });

  it('keeps a single local success toast on accept, deposit, progress, and acceptance', () => {
    const contractor = readFe('pages/contractor/ContractorOrderDetailPage.tsx');
    assert.match(contractor, /id: `orders\.progress\.accepted:\$\{order\.id\}`/);
    assert.match(contractor, /id: `orders\.progress\.saved:\$\{order\.id\}/);

    const pay = readFe('features/payments/pages/PaymentPage.tsx');
    assert.match(pay, /id: `pay\.success:\$\{id\}`/);

    const customer = readFe('pages/customer/CustomerOrderDetailPage.tsx');
    assert.match(customer, /push\(\{ id: toastId/);
    assert.match(customer, /orders\.complete\.done:\$\{order\.id\}/);
  });

  it('does not nest two realtime listeners for the same customer layout', () => {
    const app = readFe('App.tsx');
    const customer = readFe('components/layout/CustomerLayout.tsx');
    const shell = readFe('components/layout/DashboardShell.tsx');
    assert.match(customer, /<OrderRealtimeListener \/>/);
    assert.match(shell, /<OrderRealtimeListener \/>/);
    assert.doesNotMatch(customer, /DashboardShell/);
    assert.equal((app.match(/<CustomerLayout \/>/g) || []).length, 2);
  });
});
