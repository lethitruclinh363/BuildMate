const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const notificationService = require('../services/notification.service');

const list = asyncHandler(async (req, res) => {
  const data = await notificationService.listForUser(req.user.id, {
    unreadOnly: req.query.unread === 'true',
    page: req.query.page,
    limit: req.query.limit,
  });
  return success(res, data, 'Notifications retrieved');
});

const readOne = asyncHandler(async (req, res) => {
  const data = await notificationService.markRead(req.user.id, req.params.id);
  return success(res, data, 'Notification read');
});

const readAll = asyncHandler(async (req, res) => {
  const data = await notificationService.markAllRead(req.user.id);
  return success(res, data, 'Notifications marked read');
});

module.exports = { list, readOne, readAll };
