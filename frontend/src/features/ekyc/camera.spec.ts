import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isStreamLive, stopStream } from './camera.ts';

function fakeStream(states: Array<'live' | 'ended'>): MediaStream {
  const tracks = states.map((readyState) => ({
    readyState,
    stop() {
      this.readyState = 'ended';
    },
  }));
  return {
    getTracks: () => tracks,
  } as unknown as MediaStream;
}

describe('camera stream helpers', () => {
  it('treats a stream as live only while a track is live', () => {
    assert.equal(isStreamLive(fakeStream(['live'])), true);
    assert.equal(isStreamLive(fakeStream(['ended'])), false);
    assert.equal(isStreamLive(null), false);
  });

  it('stops every track without throwing on a missing stream', () => {
    const stream = fakeStream(['live', 'live']);
    stopStream(stream);
    assert.equal(isStreamLive(stream), false);
    assert.doesNotThrow(() => stopStream(null));
  });
});
