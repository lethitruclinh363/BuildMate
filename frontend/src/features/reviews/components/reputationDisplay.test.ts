import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatScore, gaugeRatio, measuredBar, shortfall, trustLineKind, weightPercent } from './reputationDisplay.ts';

describe('reputation display', () => {
  it('hides the gauge until a score is published', () => {
    assert.equal(gaugeRatio(0, false), null);
    assert.equal(gaugeRatio(null, true), null);
    assert.equal(gaugeRatio(9.2, false), null);
  });

  it('keeps a published zero distinct from missing data', () => {
    assert.equal(gaugeRatio(0, true), 0);
    assert.equal(measuredBar(0, true), 0);
    assert.equal(measuredBar(null, false), null);
    assert.equal(measuredBar(5, false), null);
  });

  it('clamps the gauge and bars to 0–10', () => {
    assert.equal(gaugeRatio(12, true), 1);
    assert.equal(gaugeRatio(-2, true), 0);
    assert.equal(measuredBar(10, true), 10);
    assert.equal(formatScore(9.2), '9.2');
    assert.equal(formatScore(10), '10');
    assert.equal(formatScore(0), '0');
    assert.equal(formatScore(8.35), '8.35');
  });

  it('keeps a real star rating when the reputation score is still hidden', () => {
    assert.equal(trustLineKind(42, 9.2), 'full');
    assert.equal(trustLineKind(2, null), 'partial');
    assert.equal(trustLineKind(0, null), 'none');
    assert.equal(trustLineKind(0, 0), 'none');
  });

  it('reads weights from the API and counts only what is still missing', () => {
    assert.equal(weightPercent(0.5), 50);
    assert.equal(weightPercent(0.1), 10);
    assert.equal(weightPercent(undefined), null);
    assert.deepEqual(shortfall(2, 1, 5, 3), { orders: 3, reviews: 2 });
    assert.deepEqual(shortfall(8, 4, 5, 3), { orders: 0, reviews: 0 });
  });
});
