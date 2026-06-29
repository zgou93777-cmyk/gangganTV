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

test('search results page renders incremental progress without hiding returned posters', () => {
  assert.equal(appSource.includes('onProgress: (event) => {'), true);
  assert.equal(appSource.includes('buildSearchProgressMessage'), true);
  assert.equal(appSource.includes("searchResults.length ? renderVodResultGrid(vodResultCards) : null"), true);
});

test('search loading copy explains incremental remote source progress', () => {
  assert.equal(appSource.includes('已返回的海报会先显示，剩余来源继续搜索'), true);
  assert.equal(appSource.includes('正在搜索真实来源'), true);
});

test('search defaults to the current source instead of scanning every expanded source', () => {
  assert.equal(appSource.includes('setSelectedSearchSourceIds(serverSites.map'), false);
  assert.equal(appSource.includes('setSelectedSearchSourceIds([firstSite.id])'), true);
  assert.equal(appSource.includes('setSelectedSearchSourceIds([site.id])'), true);
  assert.equal(appSource.includes('setSelectedSearchSourceIds([nextSelectedSiteId])'), true);
  assert.equal(appSource.includes('默认只搜索当前来源'), true);
  assert.equal(appSource.includes('至少保留一个搜索来源'), true);
  assert.equal(appSource.includes('默认搜索全部可用来源'), false);
});

test('source filter is a search source picker with a compact footer action', () => {
  const start = appSource.indexOf('function renderSourceFilterSheet()');
  const end = appSource.indexOf('function renderPosterDetailPage()', start);
  const source = appSource.slice(start, end);

  assert.equal(source.includes('选择搜索来源'), true);
  assert.equal(source.includes('选择配置源'), false);
  assert.equal(source.includes('sourceFilterFooter'), true);
  assert.equal(source.includes('sourceFilterDoneButton'), true);
  assert.equal(source.includes('多选后会一起搜索'), true);
});

test('app wires CatVod batch search without removing multi-source selection', () => {
  assert.equal(appSource.includes('fetchPluginServerSearchBatch'), true);
  assert.equal(appSource.includes('searchSiteBatch,'), true);
  assert.equal(appSource.includes('getPluginServerSearchBatchKey'), true);
  assert.equal(appSource.includes('siteBasePaths: batchSites.map'), true);
});
