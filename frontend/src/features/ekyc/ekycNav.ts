type EkycNavRecord = {
  status?: string | null;
  frontDocumentId?: string | null;
  backDocumentId?: string | null;
  hasFront?: boolean | null;
  hasBack?: boolean | null;
};

function hasFrontCard(record: EkycNavRecord | null) {
  return Boolean(record?.frontDocumentId || record?.hasFront);
}

function hasBackCard(record: EkycNavRecord | null) {
  return Boolean(record?.backDocumentId || record?.hasBack);
}

const RESULT_STATUSES = new Set(['AI_PASSED', 'AI_REVIEW_REQUIRED', 'AI_FAILED', 'SUBMITTED']);

export type PartnerNav = {
  onboardingStep: number;
  wizardOpen: boolean;
  ekycStep: number;
};

export function partnerNavKey(userId: string) {
  return `buildmate-partner-nav:${userId}`;
}

export function readPartnerNav(userId: string): PartnerNav | null {
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(partnerNavKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PartnerNav>;
    const onboardingStep = Number(parsed.onboardingStep);
    const ekycStep = Number(parsed.ekycStep);
    return {
      onboardingStep: Number.isInteger(onboardingStep) && onboardingStep >= 0 && onboardingStep <= 5 ? onboardingStep : 0,
      wizardOpen: parsed.wizardOpen === true,
      ekycStep: Number.isInteger(ekycStep) && ekycStep >= 1 && ekycStep <= 6 ? ekycStep : 1,
    };
  } catch {
    return null;
  }
}

export function writePartnerNav(userId: string, nav: PartnerNav) {
  if (!userId) return;
  sessionStorage.setItem(
    partnerNavKey(userId),
    JSON.stringify({
      onboardingStep: nav.onboardingStep,
      wizardOpen: nav.wizardOpen === true,
      ekycStep: nav.ekycStep,
    })
  );
}

export function clearPartnerNav(userId: string) {
  if (!userId) return;
  sessionStorage.removeItem(partnerNavKey(userId));
}

export function clampEkycStep(value: unknown) {
  const step = Number(value);
  if (!Number.isInteger(step) || step < 1 || step > 6) return 1;
  if (step === 5) return 4;
  return step;
}

export function ekycFloorStep(record: EkycNavRecord | null) {
  if (!record) return 1;
  if (record.status && RESULT_STATUSES.has(record.status)) return 6;
  const front = hasFrontCard(record);
  const back = hasBackCard(record);
  if (front && back) return 4;
  if (front) return 3;
  if (record.status === 'IN_PROGRESS' || record.status === 'AI_CHECKING') return 2;
  return 1;
}

export function restoreEkycStep(record: EkycNavRecord | null, stored: number | null | undefined) {
  const floor = ekycFloorStep(record);
  if (!record || floor === 6) return floor;
  const step = stored == null ? floor : clampEkycStep(stored);
  const front = hasFrontCard(record);
  const back = hasBackCard(record);
  if (!front) return Math.min(step, 2);
  if (!back) return 3;
  if (step >= 6) return 4;
  return Math.max(step, 4);
}
