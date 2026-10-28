const { ApiError } = require('./ApiError');

const LOCATION_LOCKED_MESSAGE =
  'Vị trí hoạt động đã được phê duyệt. Vui lòng gửi yêu cầu thay đổi vị trí để Quản trị viên xét duyệt.';

const FORBIDDEN_LOCATION_KEYS = [
  'address',
  'city',
  'lat',
  'lng',
  'latitude',
  'longitude',
  'location',
  'locationConfirmed',
  'locationSource',
  'providerRefId',
  'locationId',
  'location_id',
];

function isLocationPayloadPresent(payload) {
  if (!payload || typeof payload !== 'object') return false;
  for (const key of FORBIDDEN_LOCATION_KEYS) {
    if (payload[key] !== undefined) return true;
  }
  return false;
}

function assertLocationNotDirectlyModifiable(isApproved, payload) {
  if (!isApproved) return;
  if (isLocationPayloadPresent(payload)) {
    throw new ApiError(409, LOCATION_LOCKED_MESSAGE);
  }
}

module.exports = {
  LOCATION_LOCKED_MESSAGE,
  FORBIDDEN_LOCATION_KEYS,
  isLocationPayloadPresent,
  assertLocationNotDirectlyModifiable,
};
