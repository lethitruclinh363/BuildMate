const { ORDER_STATUS, PROGRESS_STATUS } = require('./order.rules');

const CONTRACTOR_JOB_EVENT = Object.freeze({
  CONTRACTOR_ACCEPTED_JOB: 'CONTRACTOR_ACCEPTED_JOB',
  CONTRACTOR_STARTED_JOB: 'CONTRACTOR_STARTED_JOB',
  CONTRACTOR_UPDATED_PROGRESS: 'CONTRACTOR_UPDATED_PROGRESS',
  CONTRACTOR_COMPLETED_JOB: 'CONTRACTOR_COMPLETED_JOB',
});

const SOCKET_EVENT = Object.freeze({
  CONTRACTOR_ACCEPTED_JOB: 'contractor_accepted_job',
  CONTRACTOR_STARTED_JOB: 'contractor_started_job',
  CONTRACTOR_UPDATED_PROGRESS: 'contractor_updated_progress',
  CONTRACTOR_COMPLETED_JOB: 'contractor_completed_job',
});

const TITLE = Object.freeze({
  CONTRACTOR_ACCEPTED_JOB: 'Contractor accepted the job',
  CONTRACTOR_STARTED_JOB: 'Contractor started the job',
  CONTRACTOR_UPDATED_PROGRESS: 'Contractor updated progress',
  CONTRACTOR_COMPLETED_JOB: 'Contractor completed the job',
});

const BEFORE_START = new Set([
  ORDER_STATUS.REQUEST_CREATED,
  ORDER_STATUS.QUOTATION_SENT,
  ORDER_STATUS.QUOTATION_ACCEPTED,
  ORDER_STATUS.DEPOSIT_PAID,
]);

function contractorJobNotice(previousStatus, progressStatus) {
  let type = CONTRACTOR_JOB_EVENT.CONTRACTOR_STARTED_JOB;
  if (progressStatus === PROGRESS_STATUS.COMPLETED) {
    type = CONTRACTOR_JOB_EVENT.CONTRACTOR_COMPLETED_JOB;
  } else if (progressStatus === PROGRESS_STATUS.IN_PROGRESS) {
    type = CONTRACTOR_JOB_EVENT.CONTRACTOR_UPDATED_PROGRESS;
  } else if (BEFORE_START.has(previousStatus)) {
    type = CONTRACTOR_JOB_EVENT.CONTRACTOR_ACCEPTED_JOB;
  }

  return {
    type,
    title: TITLE[type],
    event: SOCKET_EVENT[type],
  };
}

module.exports = {
  CONTRACTOR_JOB_EVENT,
  contractorJobNotice,
};
