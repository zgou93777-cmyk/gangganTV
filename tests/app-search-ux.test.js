const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');

test('search overlay exposes history and clear actions', () => {
  const start = appSource.indexOf('function renderSearchOverlay()');
  const end = appSource.indexOf('function renderSearchResultsPage()', start);
  const source = appSource.slice(start, end);

  assert.equal(source.includes('搜索历史'), true);
  assert.equal(source.includes('清空'), true);
  assert.equal(source.includes('searchHistory'), true);
});

test('search results page exposes failed source details', () => {
  const start = appSource.indexOf('function renderSearchResultsPage()');
  const end = appSource.indexOf('function renderSourceFilterSheet()', start);
  const source = appSource.slice(start, end);

  assert.equal(source.includes('失败来源'), true);
  assert.equal(source.includes('searchFailurePanel'), true);
});

test('search entry points guard against repeated submissions while loading', () => {
  assert.equal(appSource.includes('if (loadingSearch) {'), true);
  assert.equal(appSource.includes('editable={!loadingSearch}'), true);
  assert.equal(appSource.includes('disabled={loadingSearch}'), true);
});
