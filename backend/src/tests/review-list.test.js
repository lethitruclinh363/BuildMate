const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pageReviews, reviewSummary } = require('../services/reviewService');

function row(rating, createdAt) {
  return { rating, createdAt };
}

describe('contractor review list', () => {
  it('does not invent a score when a crew has no reviews', () => {
    const summary = reviewSummary([]);
    assert.equal(summary.average, 0);
    assert.equal(summary.count, 0);
    assert.deepEqual(summary.distribution, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    assert.deepEqual(pageReviews([], { sort: 'newest' }).items, []);
  });

  it('summarizes 1 to 5 star reviews from the stored rows', () => {
    const summary = reviewSummary([
      row(5, '2026-01-01'),
      row(4, '2026-01-02'),
      row(4, '2026-01-03'),
      row(1, '2026-01-04'),
    ]);
    assert.equal(summary.count, 4);
    assert.equal(summary.average, 3.5);
    assert.equal(summary.distribution[5], 1);
    assert.equal(summary.distribution[4], 2);
    assert.equal(summary.distribution[1], 1);
    assert.equal(summary.distribution[3], 0);
  });

  it('filters by star and sorts newest or oldest without changing the source', () => {
    const rows = [
      row(5, '2026-03-01'),
      row(2, '2026-01-01'),
      row(5, '2026-02-01'),
    ];
    const newest = pageReviews(rows, { rating: 5, sort: 'newest' });
    assert.deepEqual(newest.items.map((item) => item.createdAt), ['2026-03-01', '2026-02-01']);
    const oldest = pageReviews(rows, { rating: 5, sort: 'oldest' });
    assert.deepEqual(oldest.items.map((item) => item.createdAt), ['2026-02-01', '2026-03-01']);
    assert.equal(rows[0].createdAt, '2026-03-01');
  });

  it('paginates the filtered list', () => {
    const rows = [1, 2, 3].map((day) => row(3, `2026-04-0${day}`));
    const page = pageReviews(rows, { sort: 'oldest', page: 2, pageSize: 2 });
    assert.equal(page.total, 3);
    assert.equal(page.page, 2);
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].createdAt, '2026-04-03');
  });
});
