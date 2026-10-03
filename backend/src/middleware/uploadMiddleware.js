const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { env } = require('../config/env');
const { ApiError } = require('../utils/ApiError');
const { UPLOAD_SCOPES, isAllowedFile, secureFilename } = require('../utils/upload');

const uploadRoot = path.resolve(__dirname, '../../', env.uploadDir);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDir(uploadRoot);
Object.values(UPLOAD_SCOPES).forEach((scope) => ensureDir(path.join(uploadRoot, scope)));

function publicFileUrl(filePath) {
  const rel = path.relative(uploadRoot, filePath).replace(/\\/g, '/');
  return `/uploads/${rel}`;
}

function createUploader(scope) {
  const folderName = UPLOAD_SCOPES[scope] || scope || UPLOAD_SCOPES.users;

  const storage = multer.diskStorage({
    destination(req, _file, cb) {
      const owner = req.user?.id || 'anon';
      const folder = path.join(uploadRoot, folderName, String(owner));
      ensureDir(folder);
      cb(null, folder);
    },
    filename(_req, file, cb) {
      cb(null, secureFilename(file.originalname));
    },
  });

  function fileFilter(_req, file, cb) {
    if (!isAllowedFile(file)) {
      return cb(new ApiError(400, 'Unsupported file type'));
    }
    return cb(null, true);
  }

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: env.maxFileSizeMb * 1024 * 1024, files: 6 },
  });
}

const upload = createUploader('users');
const userUpload = createUploader('users');
const contractorUpload = createUploader('contractors');
const verificationUpload = contractorUpload;
const storeUpload = createUploader('stores');
const chatUpload = createUploader('chat');
const repairUpload = createUploader('repair');
const progressUpload = createUploader('progress');

function uploaderFor(scope) {
  if (scope === 'contractors') return contractorUpload;
  if (scope === 'stores') return storeUpload;
  if (scope === 'repair') return repairUpload;
  if (scope === 'chat') return chatUpload;
  if (scope === 'progress') return progressUpload;
  return userUpload;
}

module.exports = {
  upload,
  userUpload,
  contractorUpload,
  verificationUpload,
  storeUpload,
  chatUpload,
  repairUpload,
  progressUpload,
  uploaderFor,
  uploadRoot,
  publicFileUrl,
  UPLOAD_SCOPES,
};
