const { asyncHandler } = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { publicFileUrl } = require('../middleware/uploadMiddleware');
const { ApiError } = require('../utils/ApiError');
const chatService = require('../services/chatService');
const { MESSAGE_TYPE } = require('../models/Message');
const { sanitizeChatLocation } = require('../utils/chat-location');

const rooms = asyncHandler(async (req, res) => {
  const data = await chatService.listRooms(req.user.id, req.user.role);
  return success(res, data, 'Chat rooms retrieved');
});

const getRoom = asyncHandler(async (req, res) => {
  const data = await chatService.getRoom(req.params.roomId, req.user.id);
  return success(res, data, 'Chat room retrieved');
});

const messages = asyncHandler(async (req, res) => {
  const data = await chatService.listMessages(req.params.roomId, req.user.id, req.query);
  return success(res, data, 'Messages retrieved');
});

const send = asyncHandler(async (req, res) => {
  const type = req.body.type || MESSAGE_TYPE.TEXT;
  const content = (req.body.content || '').trim();
  if (type === MESSAGE_TYPE.TEXT && !content) {
    throw new ApiError(422, 'Message cannot be empty');
  }
  const location = type === MESSAGE_TYPE.LOCATION ? sanitizeChatLocation(req.body.location) : null;
  if (type === MESSAGE_TYPE.LOCATION && !location) {
    throw new ApiError(422, 'Coordinates are invalid');
  }
  const data = await chatService.sendMessage({
    roomId: req.params.roomId,
    senderId: req.user.id,
    type,
    content,
    location,
  });
  return created(res, data, 'Message sent');
});

const upload = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Attach an image or video');
  const ext = (req.file.mimetype || '').startsWith('video') ? MESSAGE_TYPE.VIDEO : MESSAGE_TYPE.IMAGE;
  const url = publicFileUrl(req.file.path);
  const data = await chatService.sendMessage({
    roomId: req.params.roomId,
    senderId: req.user.id,
    type: ext,
    content: url,
  });
  return created(res, data, 'Media sent');
});

module.exports = { rooms, getRoom, messages, send, upload };
