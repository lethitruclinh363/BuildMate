const { userRepository } = require('../repositories/user.repository');
const { syncUserProfileStatus } = require('./profileStatus.service');
const { ApiError } = require('../utils/ApiError');
const { writeAudit, AUDIT_ACTION } = require('./audit.service');

async function getProfile(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  await syncUserProfileStatus(user);
  return user.toPublic();
}

async function updateProfile(userId, payload, actor) {
  const allowed = ['name', 'fullName', 'phone', 'preferredLanguage'];
  const updates = {};
  for (const key of allowed) {
    if (payload[key] !== undefined) updates[key] = payload[key];
  }

  const user = await userRepository.updateById(userId, updates);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  await writeAudit({
    actorId: userId,
    actorRole: actor?.role || user.role,
    action: AUDIT_ACTION.PROFILE_UPDATE,
    entityType: 'User',
    entityId: userId,
    meta: { fields: Object.keys(updates) },
  });

  return user.toPublic();
}

async function changePassword(userId, { currentPassword, newPassword }, actor) {
  const user = await userRepository.findByIdWithPassword(userId);
  if (!user) throw new ApiError(404, 'User not found');

  const match = await user.comparePassword(currentPassword);
  if (!match) throw new ApiError(401, 'Current password is incorrect');

  user.password = newPassword;
  await userRepository.save(user);
  await userRepository.incrementTokenVersion(user._id);

  await writeAudit({
    actorId: userId,
    actorRole: actor?.role || user.role,
    action: AUDIT_ACTION.PASSWORD_CHANGE,
    entityType: 'User',
    entityId: userId,
  });

  return { ok: true };
}

async function updateAvatar(userId, avatarUrl, actor) {
  const user = await userRepository.updateById(userId, { avatar: avatarUrl });
  if (!user) throw new ApiError(404, 'User not found');

  await writeAudit({
    actorId: userId,
    actorRole: actor?.role || user.role,
    action: AUDIT_ACTION.AVATAR_UPDATE,
    entityType: 'User',
    entityId: userId,
  });

  return user.toPublic();
}

module.exports = { getProfile, updateProfile, changePassword, updateAvatar };
