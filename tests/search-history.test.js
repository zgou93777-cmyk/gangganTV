const assert = require('node:assert/strict');
const test = require('node:test');

const {
  addSearchHistoryKeyword,
  normalizeSearchHistory,
} = require('../src/search-history');

test('addSearchHistoryKeyword puts new keyword first and trims whitespace', () => {
  assert.deepEqual(
    addSearchHistoryKeyword(['三体'], '  庆余年  ', 5),
    ['庆余年', '三体']
  );
});

test('addSearchHistoryKeyword moves duplicate keyword to the front', () => {
  assert.deepEqual(
    addSearchHistoryKeyword(['三体', '庆余年', '繁花'], '庆余年', 5),
    ['庆余年', '三体', '繁花']
  );
});

test('addSearchHistoryKeyword ignores empty keywords and enforces limit', () => {
  assert.deepEqual(
    addSearchHistoryKeyword(['一', '二', '三'], '   ', 2),
    ['一', '二']
  );
  assert.deepEqual(
    addSearchHistoryKeyword(['一', '二', '三'], '四', 3),
    ['四', '一', '二']
  );
});

test('normalizeSearchHistory drops invalid items and duplicate values', () => {
  assert.deepEqual(
    normalizeSearchHistory([' 三体 ', '', null, '三体', '庆余年'], 4),
    ['三体', '庆余年']
  );
});
