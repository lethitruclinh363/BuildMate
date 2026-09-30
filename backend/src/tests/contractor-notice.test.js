const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ORDER_STATUS, PROGRESS_STATUS } = require('../utils/order.rules');
const { contractorJobNotice } = require('../utils/contractor-notice');

describe('contractor job notifications', () => {
  it('maps the first start onto contractor acceptance', () => {
    const notice = contractorJobNotice(ORDER_STATUS.QUOTATION_ACCEPTED, PROGRESS_STATUS.STARTED);
    assert.equal(notice.type, 'CONTRACTOR_ACCEPTED_JOB');
    assert.equal(notice.event, 'contractor_accepted_job');
  });

  it('maps a later start onto contractor started', () => {
    const notice = contractorJobNotice(ORDER_STATUS.STARTED, PROGRESS_STATUS.STARTED);
    assert.equal(notice.type, 'CONTRACTOR_STARTED_JOB');
    assert.equal(notice.event, 'contractor_started_job');
  });

  it('maps in-progress updates and completion', () => {
    assert.equal(
      contractorJobNotice(ORDER_STATUS.STARTED, PROGRESS_STATUS.IN_PROGRESS).type,
      'CONTRACTOR_UPDATED_PROGRESS'
    );
    assert.equal(
      contractorJobNotice(ORDER_STATUS.IN_PROGRESS, PROGRESS_STATUS.COMPLETED).type,
      'CONTRACTOR_COMPLETED_JOB'
    );
  });

  it('does not use worker notification names', () => {
    const notices = [
      contractorJobNotice(ORDER_STATUS.DEPOSIT_PAID, PROGRESS_STATUS.STARTED),
      contractorJobNotice(ORDER_STATUS.STARTED, PROGRESS_STATUS.STARTED),
      contractorJobNotice(ORDER_STATUS.IN_PROGRESS, PROGRESS_STATUS.IN_PROGRESS),
      contractorJobNotice(ORDER_STATUS.IN_PROGRESS, PROGRESS_STATUS.COMPLETED),
    ];
    for (const notice of notices) {
      assert.equal(notice.type.includes('WORKER'), false);
      assert.equal(notice.title.includes('Worker'), false);
    }
  });
});
