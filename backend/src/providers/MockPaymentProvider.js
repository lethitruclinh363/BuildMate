const crypto = require('crypto');

class MockPaymentProvider {
  createCheckout(payment) {
    const sessionId = `mock_${crypto.randomBytes(8).toString('hex')}`;
    return {
      provider: 'mock',
      providerRef: sessionId,
      transactionCode: payment.transactionCode || `BM-PAY-${sessionId.slice(-8).toUpperCase()}`,
      redirectUrl: null,
    };
  }

  parseCallback(payload = {}) {
    return {
      success: payload.success !== false,
      providerRef: payload.providerRef || payload.sessionId || null,
    };
  }
}

module.exports = { MockPaymentProvider };
