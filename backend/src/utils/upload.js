const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { ApiError } = require('./ApiError');

const MIME_BY_EXT = Object.freeze({
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});

const ALLOWED_MIME = new Set(Object.values(MIME_BY_EXT));
const CHAT_MEDIA_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.mov']);
const REPAIR_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const REPAIR_VIDEO_EXT = new Set(['.mp4', '.mov']);

const UPLOAD_SCOPES = Object.freeze({
  users: 'users',
  contractors: 'contractors',
  stores: 'stores',
  repair: 'repair',
  chat: 'chat',
  progress: 'progress',
});

function extensionOf(filename = '') {
  return path.extname(String(filename)).toLowerCase();
}

function isAllowedFile(file) {
  const ext = extensionOf(file.originalname);
  if (!MIME_BY_EXT[ext]) return false;
  if (file.mimetype && !ALLOWED_MIME.has(file.mimetype) && !file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/')) {
    return false;
  }
  return true;
}

function isChatMedia(file) {
  const ext = extensionOf(file.originalname);
  if (!CHAT_MEDIA_EXT.has(ext)) return false;
  if (file.mimetype && !file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/')) {
    return false;
  }
  return true;
}

function isRepairMedia(file) {
  const ext = extensionOf(file.originalname);
  if (file.fieldname === 'videos') {
    if (!REPAIR_VIDEO_EXT.has(ext)) return false;
    if (file.mimetype && !file.mimetype.startsWith('video/')) return false;
    return true;
  }
  if (!REPAIR_IMAGE_EXT.has(ext)) return false;
  if (file.mimetype && !file.mimetype.startsWith('image/')) return false;
  return true;
}

function sniffImage(buffer) {
  if (!buffer || buffer.length < 3) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  return null;
}

function sniffImageFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(12);
    const n = fs.readSync(fd, buf, 0, 12, 0);
    return sniffImage(n < 12 ? buf.subarray(0, n) : buf);
  } finally {
    fs.closeSync(fd);
  }
}

function requireRepairSiteImages(files = {}) {
  const images = files.images || [];
  const videos = files.videos || [];
  const valid = [];
  let spoofed = false;
  for (const file of images) {
    if (sniffImageFile(file.path)) valid.push(file);
    else spoofed = true;
  }
  if (!valid.length) {
    throw new ApiError(400, 'Upload at least one site photo before sending the request');
  }
  if (spoofed) {
    throw new ApiError(400, 'Use a JPG, PNG, WEBP, or GIF image');
  }
  return { images: valid, videos };
}

function secureFilename(originalName) {
  const ext = MIME_BY_EXT[extensionOf(originalName)] ? extensionOf(originalName) : '';
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
}

function maxBytesFor(file, fallbackMb) {
  const ext = extensionOf(file?.originalname);
  if (['.mp4', '.mov'].includes(ext)) return Math.max(fallbackMb, 25) * 1024 * 1024;
  if (['.pdf', '.doc', '.docx'].includes(ext)) return Math.max(fallbackMb, 10) * 1024 * 1024;
  return fallbackMb * 1024 * 1024;
}

module.exports = {
  MIME_BY_EXT,
  ALLOWED_MIME,
  CHAT_MEDIA_EXT,
  REPAIR_IMAGE_EXT,
  REPAIR_VIDEO_EXT,
  UPLOAD_SCOPES,
  extensionOf,
  isAllowedFile,
  isChatMedia,
  isRepairMedia,
  sniffImage,
  sniffImageFile,
  requireRepairSiteImages,
  secureFilename,
  maxBytesFor,
};
