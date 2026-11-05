import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  STABLE_FRAMES,
  assessCardBuffer,
  isAcceptedImageFile,
  nextStableCount,
} from './cardGeometry.ts';

function frame(width: number, height: number, bg = 28) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = bg;
    data[i + 3] = 255;
  }
  return { data, width, height };
}

function paintCard(
  buf: { data: Uint8ClampedArray; width: number; height: number },
  {
    cx,
    cy,
    cw,
    ch,
    deg = 0,
    fill = 210,
    texture = true,
  }: {
    cx: number;
    cy: number;
    cw: number;
    ch: number;
    deg?: number;
    fill?: number;
    texture?: boolean;
  }
) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  for (let y = 0; y < buf.height; y += 1) {
    for (let x = 0; x < buf.width; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;
      if (Math.abs(lx) <= cw / 2 && Math.abs(ly) <= ch / 2) {
        const i = (y * buf.width + x) * 4;
        const tex = texture ? ((x * 17 + y * 11) % 23) - 11 : 0;
        const v = Math.max(0, Math.min(255, fill + tex));
        buf.data[i] = buf.data[i + 1] = buf.data[i + 2] = v;
      }
    }
  }
}

describe('card capture quality', () => {
  it('CARD-01 accepts a sharp upright card', () => {
    const buf = frame(320, 200);
    paintCard(buf, { cx: 160, cy: 100, cw: 230, ch: 145, deg: 0 });
    assert.equal(assessCardBuffer(buf), null);
  });

  it('CARD-02 accepts a card tilted slightly left when it is still readable', () => {
    const buf = frame(320, 200);
    paintCard(buf, { cx: 160, cy: 100, cw: 230, ch: 145, deg: 12 });
    assert.equal(assessCardBuffer(buf), null);
  });

  it('CARD-03 accepts a card tilted slightly right when it is still readable', () => {
    const buf = frame(320, 200);
    paintCard(buf, { cx: 160, cy: 100, cw: 230, ch: 145, deg: -12 });
    assert.equal(assessCardBuffer(buf), null);
  });

  it('CARD-04 accepts a card that is slightly off-center', () => {
    const buf = frame(320, 200);
    paintCard(buf, { cx: 190, cy: 112, cw: 200, ch: 126, deg: 4 });
    assert.equal(assessCardBuffer(buf), null);
  });

  it('CARD-05 does not reject a readable card only because corners are imperfect', () => {
    const buf = frame(320, 200);
    paintCard(buf, { cx: 250, cy: 100, cw: 230, ch: 145, deg: 8 });
    assert.equal(assessCardBuffer(buf), null);
  });

  it('CARD-06 rejects a severely blurry image', () => {
    const buf = frame(320, 200, 160);
    paintCard(buf, { cx: 160, cy: 100, cw: 230, ch: 145, deg: 0, fill: 168, texture: false });
    assert.equal(assessCardBuffer(buf), 'blur');
  });

  it('CARD-07 rejects a dark image', () => {
    const buf = frame(320, 200, 12);
    paintCard(buf, { cx: 160, cy: 100, cw: 230, ch: 145, deg: 0, fill: 22 });
    assert.equal(assessCardBuffer(buf), 'dark');
  });

  it('CARD-08 accepts a full-bleed uploaded card photo', () => {
    const buf = frame(320, 200, 210);
    paintCard(buf, { cx: 160, cy: 100, cw: 318, ch: 198, deg: 0, fill: 210 });
    assert.equal(assessCardBuffer(buf, { mode: 'upload' }), null);
  });

  it('CARD-09 accepts jpeg and png files so the same file can be chosen again', () => {
    assert.equal(isAcceptedImageFile({ type: 'image/jpeg', name: 'front.jpg', size: 1200 }), true);
    assert.equal(isAcceptedImageFile({ type: '', name: 'cccd.JPG', size: 1200 }), true);
    assert.equal(isAcceptedImageFile({ type: 'image/png', name: 'front.png', size: 1200 }), true);
    assert.equal(isAcceptedImageFile({ type: 'application/pdf', name: 'cccd.pdf', size: 1200 }), false);
  });

  it('enables capture after a single readable frame', () => {
    assert.equal(STABLE_FRAMES, 1);
    assert.equal(nextStableCount(0, true), 1);
    assert.equal(nextStableCount(1, false), 0);
  });
});
