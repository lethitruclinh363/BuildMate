const { ServiceSuggestion, SUGGESTION_STATUS } = require('../models/ServiceSuggestion');
const { User, ROLES } = require('../models/User');
const catalogService = require('./catalogService');
const notificationService = require('./notificationService');
const { NOTIFICATION_TYPE } = require('../models/Notification');
const { ApiError } = require('../utils/ApiError');

function cleanDescription(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

async function notifyUser(userId, title, message, link) {
  if (!userId) return;
  try {
    await notificationService.notify({
      userId,
      title,
      message,
      type: NOTIFICATION_TYPE.STATUS_UPDATE,
      link,
    });
  } catch {
    // A missed alert must not undo the suggestion itself.
  }
}

async function notifyAdmins(title, message) {
  const admins = await User.find({ role: ROLES.ADMIN }).select('_id');
  await Promise.all(admins.map((admin) => notifyUser(admin._id, title, message, '/services')));
}

async function createSuggestion({ description, user, profile }) {
  const text = cleanDescription(description);
  if (text.length < 8) throw new ApiError(400, 'Please describe the service you would like to suggest.');
  const doc = await ServiceSuggestion.create({
    requesterId: user.id,
    requesterRole: 'CONTRACTOR',
    providerId: profile?._id || null,
    teamName: profile?.businessName || '',
    description: text,
    status: SUGGESTION_STATUS.PENDING,
  });
  await notifyAdmins('Có đề xuất dịch vụ mới.', text);
  return doc.toPublic();
}

async function listForAdmin() {
  const rows = await ServiceSuggestion.find()
    .sort({ createdAt: -1 })
    .limit(200)
    .populate('requesterId', 'name email');
  return rows.map((row) => row.toPublic());
}

async function rejectSuggestion(id, { adminNote, adminId }) {
  const doc = await ServiceSuggestion.findById(id);
  if (!doc) throw new ApiError(404, 'Suggestion not found');
  if (doc.status !== SUGGESTION_STATUS.PENDING) throw new ApiError(400, 'This suggestion has already been reviewed');
  doc.status = SUGGESTION_STATUS.REJECTED;
  doc.adminNote = cleanDescription(adminNote);
  doc.reviewedBy = adminId;
  doc.reviewedAt = new Date();
  await doc.save();
  await notifyUser(
    doc.requesterId,
    'Đề xuất dịch vụ của bạn chưa được chấp thuận.',
    doc.adminNote || 'BuildMate đã xem đề xuất và chưa bổ sung dịch vụ này.',
    '/partner/onboarding'
  );
  return doc.toPublic();
}

async function convertSuggestion(id, body, adminId) {
  const doc = await ServiceSuggestion.findById(id);
  if (!doc) throw new ApiError(404, 'Suggestion not found');
  if (doc.status !== SUGGESTION_STATUS.PENDING) throw new ApiError(400, 'This suggestion has already been reviewed');
  const service = await catalogService.createCatalogService({ ...body, adminId });
  doc.status = SUGGESTION_STATUS.CONVERTED;
  doc.convertedServiceId = service.id;
  doc.reviewedBy = adminId;
  doc.reviewedAt = new Date();
  await doc.save();
  await notifyUser(
    doc.requesterId,
    'BuildMate đã bổ sung dịch vụ bạn đề xuất.',
    service.name,
    '/contractor/services'
  );
  return { suggestion: doc.toPublic(), service };
}

module.exports = {
  createSuggestion,
  listForAdmin,
  rejectSuggestion,
  convertSuggestion,
  SUGGESTION_STATUS,
};
