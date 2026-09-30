const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { BaseRepository } = require('../repositories/base.repository');

describe('BaseRepository', () => {
  it('forward findById / create / updateById to the Mongoose model', async () => {
    const calls = [];
    const fakeModel = {
      findById(id) {
        calls.push(['findById', id]);
        return Promise.resolve({ _id: id });
      },
      create(payload) {
        calls.push(['create', payload]);
        return Promise.resolve({ _id: 'new', ...payload });
      },
      findByIdAndUpdate(id, updates, options) {
        calls.push(['updateById', id, updates, options]);
        return Promise.resolve({ _id: id, ...updates });
      },
    };

    const repo = new BaseRepository(fakeModel);

    await repo.findById('u1');
    await repo.create({ name: 'An' });
    await repo.updateById('u1', { name: 'Binh' });

    assert.equal(calls[0][0], 'findById');
    assert.equal(calls[1][0], 'create');
    assert.deepEqual(calls[2][3], { new: true, runValidators: true });
  });
});
