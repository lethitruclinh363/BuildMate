const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  parseWeeklyHours,
  normalizeWeeklyHours,
  summarizeWeeklyHours,
  hoursStatus,
  persistableWeeklyHours,
  toOperatingHours,
  resolveWeeklyHoursUpdate,
  applyAccountContact,
} = require('../utils/weeklyHours');
const { withoutLocationFields, assertLocationNotDirectlyModifiable } = require('../utils/locationGuard');

const ROOT = path.resolve(__dirname, '../../..');

function sampleHours() {
  return {
    configured: true,
    days: [
      { weekday: 1, closed: false, open: '07:00', close: '18:00' },
      { weekday: 2, closed: false, open: '07:00', close: '18:00' },
      { weekday: 3, closed: false, open: '07:00', close: '18:00' },
      { weekday: 4, closed: false, open: '07:00', close: '18:00' },
      { weekday: 5, closed: false, open: '07:00', close: '18:00' },
      { weekday: 6, closed: false, open: '07:00', close: '17:00' },
      { weekday: 7, closed: true, open: null, close: null },
    ],
  };
}

describe('weekly operating hours', () => {
  it('treats missing data as unset and never invents a fake schedule', () => {
    const empty = parseWeeklyHours(null);
    assert.equal(empty.configured, false);
    assert.equal(persistableWeeklyHours(empty), null);
    assert.equal(summarizeWeeklyHours(null), '');
    assert.equal(hoursStatus(null).state, 'UNSET');
  });

  it('rejects closing time that is not after opening time', () => {
    const hours = sampleHours();
    hours.days[0].close = '07:00';
    assert.throws(() => parseWeeklyHours(hours), /Closing time must be after opening time/);
  });

  it('rejects times outside 15-minute slots', () => {
    const hours = sampleHours();
    hours.days[0].open = '07:10';
    assert.throws(() => parseWeeklyHours(hours), /15-minute/);
  });

  it('keeps two partners independent and summarizes a valid week', () => {
    const first = parseWeeklyHours(sampleHours());
    const second = parseWeeklyHours({
      configured: true,
      days: sampleHours().days.map((day) => (day.weekday === 1 ? { ...day, open: '09:00', close: '12:00' } : day)),
    });
    assert.equal(first.days[0].open, '07:00');
    assert.equal(second.days[0].open, '09:00');
    assert.match(summarizeWeeklyHours(first), /T2–T6 07:00–18:00/);
    assert.match(summarizeWeeklyHours(first), /CN nghỉ/);
  });

  it('computes open/closed/rest in Asia/Ho_Chi_Minh', () => {
    const hours = parseWeeklyHours(sampleHours());
    const wednesdayOpen = new Date('2026-11-04T03:00:00.000Z');
    const wednesdayClosed = new Date('2026-11-04T12:00:00.000Z');
    const sunday = new Date('2026-11-08T03:00:00.000Z');
    assert.equal(hoursStatus(hours, wednesdayOpen).state, 'OPEN');
    assert.equal(hoursStatus(hours, wednesdayClosed).state, 'CLOSED');
    assert.equal(hoursStatus(hours, sunday).state, 'REST');
  });

  it('locks contact fields from the registered account', () => {
    const profile = { contactPhone: '0900000000', contactEmail: 'spoof@example.com' };
    applyAccountContact(profile, { phoneNumber: '0795931043', email: 'owner@example.com' });
    assert.equal(profile.contactPhone, '0795931043');
    assert.equal(profile.contactEmail, 'owner@example.com');
  });

  it('accepts operatingHours aliases and does not wipe an existing schedule with an empty payload', () => {
    const parsed = parseWeeklyHours([
      { dayOfWeek: 1, isOpen: true, openTime: '07:00', closeTime: '18:00' },
      { dayOfWeek: 2, isOpen: true, openTime: '07:00', closeTime: '18:00' },
      { dayOfWeek: 3, isOpen: false, openTime: null, closeTime: null },
      { dayOfWeek: 4, isOpen: true, openTime: '07:00', closeTime: '18:00' },
      { dayOfWeek: 5, isOpen: true, openTime: '07:00', closeTime: '18:00' },
      { dayOfWeek: 6, isOpen: true, openTime: '07:00', closeTime: '17:00' },
      { dayOfWeek: 7, isOpen: true, openTime: '07:00', closeTime: '18:00' },
    ]);
    assert.equal(parsed.days[2].closed, true);
    assert.equal(toOperatingHours(parsed)[0].dayOfWeek, 1);
    const kept = resolveWeeklyHoursUpdate(parsed, { configured: false, days: parsed.days.map((day) => ({ ...day, closed: true, open: null, close: null })) });
    assert.equal(kept.persist, false);
    assert.equal(kept.hours.days[0].open, '07:00');
    const saved = resolveWeeklyHoursUpdate(null, parsed);
    assert.equal(saved.persist, true);
    assert.equal(saved.hours.days[5].close, '17:00');
  });

  it('ignores city/address on public-profile save so approved partners can persist hours', () => {
    const stripped = withoutLocationFields({
      displayName: 'Đội thợ',
      city: 'Cần Thơ',
      address: '123 Nguyễn Văn Cừ',
      weeklyHours: sampleHours(),
    });
    assert.equal(stripped.city, undefined);
    assert.equal(stripped.address, undefined);
    assert.equal(stripped.weeklyHours.days[0].open, '07:00');
    assert.doesNotThrow(() => assertLocationNotDirectlyModifiable(true, stripped));
  });
});

describe('partner hours wiring', () => {
  it('stores weekly hours on contractor_profiles and ignores client phone/email on updates', () => {
    const schema = fs.readFileSync(path.join(ROOT, 'backend/prisma/schema.prisma'), 'utf8');
    const contractor = fs.readFileSync(path.join(ROOT, 'backend/src/services/contractorService.js'), 'utf8');
    const publicProfile = fs.readFileSync(path.join(ROOT, 'backend/src/services/publicProfileService.js'), 'utf8');
    assert.match(schema, /weekly_hours\s+Json\?/);
    assert.match(contractor, /delete rest\.contactPhone/);
    assert.match(contractor, /delete rest\.contactEmail/);
    assert.match(contractor, /hoursOnlyPayload/);
    assert.match(publicProfile, /weeklyHours/);
    assert.match(publicProfile, /operatingHours/);
    assert.match(publicProfile, /withoutLocationFields/);
    assert.match(publicProfile, /applyLockedContact/);
    assert.equal(/address: 'address'/.test(publicProfile), false);
    assert.equal(/city: 'city'/.test(publicProfile), false);
    assert.equal(/store\[key\] = body\[incoming\][\s\S]*phone: 'phone'/.test(publicProfile), false);
  });

  it('does not use localStorage as the source of truth for hours', () => {
    const onboard = fs.readFileSync(path.join(ROOT, 'frontend/src/pages/partner/PartnerOnboardingPage.tsx'), 'utf8');
    const contractorSave = fs.readFileSync(path.join(ROOT, 'frontend/src/pages/contractor/ContractorPublicProfilePage.tsx'), 'utf8');
    const storeSave = fs.readFileSync(path.join(ROOT, 'frontend/src/pages/store/StorePublicProfilePage.tsx'), 'utf8');
    const showcase = fs.readFileSync(path.join(ROOT, 'frontend/src/pages/public/ContractorProfileShowcase.tsx'), 'utf8');
    const storeShowcase = fs.readFileSync(path.join(ROOT, 'frontend/src/pages/public/StoreProfileShowcase.tsx'), 'utf8');
    assert.match(onboard, /body\.weeklyHours/);
    assert.match(onboard, /LockedAccountFields/);
    assert.match(onboard, /OperatingHoursEditor/);
    assert.match(contractorSave, /weeklyHours: normalizeWeeklyHours\(profile\.weeklyHours\)/);
    assert.equal(/savePublicProfile\([\s\S]*city: profile\.city/.test(contractorSave), false);
    assert.equal(/savePublicProfile\([\s\S]*address: profile\.address/.test(storeSave), false);
    assert.match(showcase, /OperatingHoursDisplay/);
    assert.match(storeShowcase, /OperatingHoursDisplay/);
    assert.match(contractorSave, /getApiErrorMessage/);
    assert.match(storeSave, /getApiErrorMessage/);
  });
});
