#!/usr/bin/env node
/**
 * Harmless 1x1 PNG used only as public demo avatar/cover/product image.
 * Lives at backend/uploads/e2e-placeholder.png — NOT under /uploads/contractors.
 */
const fs = require('fs');
const path = require('path');

const FILE_NAME = 'e2e-placeholder.png';
const RELATIVE_URL = `/uploads/${FILE_NAME}`;
const TARGET = path.resolve(__dirname, '../../uploads', FILE_NAME);
// PNG signature 89 50 4E 47 plus a 1x1 gray pixel. Not a document scan.
const PNG_1X1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0c000000301010018dd8d180000000049454e44ae426082',
  'hex'
);

function ensureE2ePlaceholderFile() {
  const folder = path.dirname(TARGET);
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  if (!fs.existsSync(TARGET) || fs.statSync(TARGET).size < 32) {
    fs.writeFileSync(TARGET, PNG_1X1);
  }
  return { url: RELATIVE_URL, path: TARGET, bytes: fs.statSync(TARGET).size };
}

if (require.main === module) {
  const result = ensureE2ePlaceholderFile();
  console.log(JSON.stringify({ url: result.url, bytes: result.bytes, wrote: true }));
}

module.exports = { ensureE2ePlaceholderFile, RELATIVE_URL, TARGET };
