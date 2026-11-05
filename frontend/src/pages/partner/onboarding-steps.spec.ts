import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  maxReachableStep,
  mergeCompleted,
  normalizeCompleted,
  recoverCompleted,
  restoreOnboardingStep,
} from './onboarding-steps.ts';

describe('onboarding restore', () => {
  it('keeps verify after refresh even if local completed was pruned', () => {
    const pruned = normalizeCompleted([true, true, false, false, false, false]);
    assert.equal(restoreOnboardingStep(4, 2, pruned), 4);
    assert.equal(maxReachableStep(pruned), 2);
  });

  it('recovers earlier completed flags when the data is still valid', () => {
    const pruned = normalizeCompleted([true, true, false, false, false, false]);
    const valid = [true, true, true, true, false, false];
    assert.deepEqual(recoverCompleted(pruned, valid, 4), [true, true, true, true, false, false]);
  });

  it('does not mark verify complete without valid data', () => {
    const completed = normalizeCompleted([true, true, true, true, false, false]);
    const valid = [true, true, true, true, false, false];
    assert.deepEqual(recoverCompleted(completed, valid, 4), [true, true, true, true, false, false]);
  });

  it('does not recover a step whose data is no longer valid', () => {
    const completed = normalizeCompleted([true, true, true, true, false, false]);
    const valid = [true, true, false, true, false, false];
    assert.deepEqual(recoverCompleted(completed, valid, 4), [true, true, false, false, false, false]);
  });

  it('merges backend and local completed flags', () => {
    assert.deepEqual(
      mergeCompleted([true, true, false], [false, true, true, true]),
      [true, true, true, true, false, false]
    );
  });
});
