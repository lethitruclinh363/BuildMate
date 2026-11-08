export const ONBOARDING_STEP_COUNT = 6;

export type OnboardingStepStatus = 'INCOMPLETE' | 'CURRENT' | 'COMPLETED';

export function emptyCompleted(): boolean[] {
  return Array.from({ length: ONBOARDING_STEP_COUNT }, () => false);
}

export function normalizeCompleted(value: unknown): boolean[] {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: ONBOARDING_STEP_COUNT }, (_, index) => source[index] === true);
}

/** Keep a check only after Continue succeeded and the step data is still valid. Later steps fall if an earlier one does. Step 6 completes when both confirmations are valid and steps 1–5 are complete. */
export function pruneCompleted(completed: boolean[], dataValid: boolean[]): boolean[] {
  const next = emptyCompleted();
  for (let index = 0; index < ONBOARDING_STEP_COUNT - 1; index += 1) {
    const previousOk = index === 0 || next[index - 1];
    next[index] = Boolean(completed[index] && dataValid[index] && previousOk);
  }
  next[ONBOARDING_STEP_COUNT - 1] = Boolean(
    dataValid[ONBOARDING_STEP_COUNT - 1] && next.slice(0, ONBOARDING_STEP_COUNT - 1).every(Boolean)
  );
  return next;
}

export function maxReachableStep(completed: boolean[]): number {
  const firstIncomplete = completed.findIndex((done, index) => index < ONBOARDING_STEP_COUNT - 1 && !done);
  return firstIncomplete === -1 ? ONBOARDING_STEP_COUNT - 1 : firstIncomplete;
}

export function mergeCompleted(left: boolean[], right: boolean[]) {
  const a = normalizeCompleted(left);
  const b = normalizeCompleted(right);
  return a.map((flag, index) => flag || b[index]);
}

/** Restore a saved UI step without inventing later onboarding progress. */
export function restoreOnboardingStep(storedStep: unknown, localStep: unknown, completed: boolean[]) {
  const stored = Number(storedStep);
  if (Number.isInteger(stored) && stored >= 0 && stored <= ONBOARDING_STEP_COUNT - 1) return stored;
  const local = Number(localStep);
  if (Number.isInteger(local) && local >= 0 && local <= ONBOARDING_STEP_COUNT - 1) return local;
  return maxReachableStep(completed);
}

/**
 * If the user already reached a later onboarding step this session and the earlier
 * step data is still valid, restore those completed flags instead of clamping back
 * to Images after a refresh.
 */
export function recoverCompleted(completed: boolean[], dataValid: boolean[], reachedStep: number) {
  const next = normalizeCompleted(completed);
  const limit = Math.max(0, Math.min(reachedStep, ONBOARDING_STEP_COUNT - 1));
  for (let index = 0; index < limit; index += 1) {
    if (dataValid[index] && (index === 0 || next[index - 1])) next[index] = true;
  }
  return pruneCompleted(next, dataValid);
}

export function stepStatus(index: number, current: number, completed: boolean[]): OnboardingStepStatus {
  if (index === current && !(index === ONBOARDING_STEP_COUNT - 1 && completed[index])) return 'CURRENT';
  if (completed[index]) return 'COMPLETED';
  return 'INCOMPLETE';
}

export function sameCompleted(left: boolean[], right: boolean[]) {
  return left.length === right.length && left.every((flag, index) => flag === right[index]);
}
