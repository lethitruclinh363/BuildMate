const STORE_TYPE = Object.freeze({
  SERVICES: 'SERVICES',
  MATERIALS: 'MATERIALS',
  BOTH: 'BOTH',
});

const STORE_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  INACTIVE: 'INACTIVE',
  LIVE: 'LIVE',
  PAUSED: 'PAUSED',
});

module.exports = {
  STORE_TYPE,
  STORE_STATUS,
};
