const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ApiError } = require('../utils/ApiError');
const {
  secureFilename,
  isAllowedFile,
  isRepairMedia,
  sniffImage,
  requireRepairSiteImages,
} = require('../utils/upload');

function jpegBuf() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
}

function tmpFile(name, bytes) {
  const filePath = path.join(os.tmpdir(), `bm-repair-${Date.now()}-${Math.random().toString(16).slice(2)}-${name}`);
  fs.writeFileSync(filePath, bytes);
  return filePath;
}

describe('upload helpers', () => {
  it('builds a random filename with a safe extension', () => {
    const name = secureFilename('../../etc/passwd.png');
    assert.match(name, /^\d+-[a-f0-9]{16}\.png$/);
    assert.equal(name.includes('..'), false);
    assert.equal(name.includes('/'), false);
  });

  it('rejects unknown types', () => {
    assert.equal(isAllowedFile({ originalname: 'note.exe', mimetype: 'application/octet-stream' }), false);
    assert.equal(isAllowedFile({ originalname: 'site.jpg', mimetype: 'image/jpeg' }), true);
    assert.equal(isAllowedFile({ originalname: 'quote.pdf', mimetype: 'application/pdf' }), true);
  });
});

describe('repair site photo requirement', () => {
  it('sniffs jpeg png webp and gif from bytes, not the client mime', () => {
    assert.equal(sniffImage(jpegBuf()), 'image/jpeg');
    assert.equal(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), 'image/png');
    const webp = Buffer.alloc(12);
    webp.write('RIFF', 0, 'ascii');
    webp.write('WEBP', 8, 'ascii');
    assert.equal(sniffImage(webp), 'image/webp');
    assert.equal(sniffImage(Buffer.from('GIF89a......')), 'image/gif');
    assert.equal(sniffImage(Buffer.from('%PDF-1.4!!!!')), null);
    assert.equal(sniffImage(Buffer.alloc(0)), null);
  });

  it('accepts image fields and video fields, and rejects pdf on the repair image slot', () => {
    assert.equal(isRepairMedia({ fieldname: 'images', originalname: 'site.jpg', mimetype: 'image/jpeg' }), true);
    assert.equal(isRepairMedia({ fieldname: 'videos', originalname: 'clip.mp4', mimetype: 'video/mp4' }), true);
    assert.equal(isRepairMedia({ fieldname: 'images', originalname: 'notes.pdf', mimetype: 'application/pdf' }), false);
    assert.equal(isRepairMedia({ fieldname: 'images', originalname: 'clip.mp4', mimetype: 'video/mp4' }), false);
  });

  it('rejects create media with no photo, video-only, or a spoofed jpeg', () => {
    assert.throws(
      () => requireRepairSiteImages({}),
      (err) => err instanceof ApiError && err.statusCode === 400 && /at least one site photo/i.test(err.message)
    );
    assert.throws(
      () => requireRepairSiteImages({ videos: [{ path: 'clip.mp4', originalname: 'clip.mp4' }] }),
      (err) => err instanceof ApiError && err.statusCode === 400 && /at least one site photo/i.test(err.message)
    );

    const spoof = tmpFile('fake.jpg', Buffer.from('%PDF-1.4 disguised'));
    try {
      assert.throws(
        () => requireRepairSiteImages({ images: [{ path: spoof, originalname: 'fake.jpg', mimetype: 'image/jpeg' }] }),
        (err) => err instanceof ApiError && err.statusCode === 400
      );
    } finally {
      fs.rmSync(spoof, { force: true });
    }
  });

  it('accepts one or more sniffed jpeg photos and keeps optional video', () => {
    const one = tmpFile('one.jpg', jpegBuf());
    const two = tmpFile('two.jpg', jpegBuf());
    try {
      const single = requireRepairSiteImages({ images: [{ path: one, originalname: 'one.jpg' }] });
      assert.equal(single.images.length, 1);
      const many = requireRepairSiteImages({
        images: [
          { path: one, originalname: 'one.jpg' },
          { path: two, originalname: 'two.jpg' },
        ],
        videos: [{ path: 'clip.mp4', originalname: 'clip.mp4' }],
      });
      assert.equal(many.images.length, 2);
      assert.equal(many.videos.length, 1);
    } finally {
      fs.rmSync(one, { force: true });
      fs.rmSync(two, { force: true });
    }
  });
});
