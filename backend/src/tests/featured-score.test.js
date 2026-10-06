const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  ratingScore,
  contractorFeaturedScore,
  isEligibleProvider,
  selectFeatured,
} = require('../services/featuredScore');

function crew(extra = {}) {
  return {
    name: 'Crew',
    verificationStatus: 'APPROVED',
    storeStatus: 'LIVE',
    accountStatus: 'ACTIVE',
    profileCompleteness: 80,
    averageRating: 0,
    reviewCount: 0,
    globalAverageRating: 4,
    completedJobs: 0,
    acceptedJobs: 0,
    responseRate: 0,
    recentActivity: 0,
    cancelled: 0,
    complaints: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

describe('featured provider ranking', () => {
  it('does not let a single five-star review beat a deep 4.8 rating', () => {
    const thin = ratingScore(5, 1, 4);
    const deep = ratingScore(4.8, 100, 4);
    assert.ok(deep > thin);
    const thinCrew = contractorFeaturedScore(crew({ averageRating: 5, reviewCount: 1 }));
    const deepCrew = contractorFeaturedScore(crew({ averageRating: 4.8, reviewCount: 100 }));
    assert.ok(deepCrew > thinCrew);
  });

  it('penalises a busy provider when valid complaints pile up', () => {
    const busy = crew({ completedJobs: 40, acceptedJobs: 40, averageRating: 4.6, reviewCount: 30 });
    const clean = contractorFeaturedScore(busy);
    const complained = contractorFeaturedScore({ ...busy, complaints: 4, cancelled: 6 });
    assert.ok(clean > complained);
    assert.ok(complained >= 0);
  });

  it('hides an approved provider that is not live', () => {
    assert.equal(isEligibleProvider(crew({ storeStatus: 'INACTIVE' })), false);
    assert.equal(isEligibleProvider(crew({ verificationStatus: 'SUBMITTED' })), false);
    assert.equal(isEligibleProvider(crew({ accountStatus: 'BLOCKED' })), false);
    const picked = selectFeatured([crew({ storeStatus: 'INACTIVE' })], contractorFeaturedScore);
    assert.deepEqual(picked.items, []);
  });

  it('keeps a live provider with no reviews in cold start', () => {
    const picked = selectFeatured([crew({ reviewCount: 0, averageRating: 0 })], contractorFeaturedScore);
    assert.equal(picked.mode, 'cold-start');
    assert.equal(picked.items.length, 1);
  });

  it('uses cold start until five eligible providers exist', () => {
    const rows = [1, 2, 3, 4].map((index) =>
      crew({
        name: `Crew ${index}`,
        profileCompleteness: index * 10,
        createdAt: `2026-01-0${index}T00:00:00.000Z`,
      })
    );
    const picked = selectFeatured(rows, contractorFeaturedScore);
    assert.equal(picked.mode, 'cold-start');
    assert.equal(picked.items[0].name, 'Crew 4');
    assert.equal(picked.items.length, 4);
  });

  it('switches to featured ranking once five providers are eligible', () => {
    const quiet = Array.from({ length: 4 }, (_, index) =>
      crew({ name: `Quiet ${index}`, profileCompleteness: 100, completedJobs: 0 })
    );
    const proven = crew({
      name: 'Proven',
      profileCompleteness: 40,
      completedJobs: 50,
      acceptedJobs: 50,
      averageRating: 4.8,
      reviewCount: 40,
    });
    const picked = selectFeatured([...quiet, proven], contractorFeaturedScore);
    assert.equal(picked.mode, 'featured');
    assert.equal(picked.items[0].name, 'Proven');
  });
});
