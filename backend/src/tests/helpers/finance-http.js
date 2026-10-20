const { DEPOSIT_TERMS_VERSION } = require('../../utils/contractor-finance');

function depositCheckoutBody() {
  return {
    method: 'MOCK',
    termsAccepted: true,
    termsVersion: DEPOSIT_TERMS_VERSION,
  };
}

function customerActor(user) {
  return { id: user._id || user.id, role: 'CUSTOMER' };
}

async function payMockDeposit(customer, paymentId) {
  const paymentService = require('../../services/paymentService');
  const actor = customerActor(customer);
  await paymentService.checkout(paymentId, actor, depositCheckoutBody());
  return paymentService.mockSuccess(paymentId, actor);
}

module.exports = { depositCheckoutBody, DEPOSIT_TERMS_VERSION, payMockDeposit, customerActor };
