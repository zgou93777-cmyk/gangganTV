const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');

test('discover page can render homepage posters from the selected source', () => {
  assert.equal(appSource.includes('sourceDiscoverPosters'), true);
  assert.equal(appSource.includes('loadSourceDiscoverFeed'), true);
});

test('discover page loads CatVod plugin home from the selected child source', () => {
  assert.equal(appSource.includes('fetchPluginServerHome'), true);
  assert.equal(appSource.includes('fetchPluginServerCategory'), true);
  assert.equal(appSource.includes('fetchPluginServerSources'), true);
  assert.equal(appSource.includes('siteBasePath: site?.siteBasePath ||'), true);
});

test('discover source feed reloads when category and filters change', () => {
  assert.equal(
    appSource.includes('[activeFeedTab, activePage, activeRegionFilter, activeSortFilter, activeTab, selectedSiteId, sites]'),
    true
  );
  assert.equal(appSource.includes('buildDiscoverCategoryRequest({'), true);
});

test('CatVod plugin sources are expanded but default search stays on the first source', () => {
  assert.equal(appSource.includes('name: childName || fallbackName'), true);
  assert.equal(appSource.includes('setSelectedSearchSourceIds(serverSites.map'), false);
  assert.equal(appSource.includes('setSelectedSearchSourceIds([firstSite.id])'), true);
  assert.equal(appSource.includes('默认只搜索当前来源'), true);
  assert.equal(appSource.includes('await expandPluginServerSources(catVodSource, scriptUrl)'), true);
});

test('restored plugin sources can be expanded after parser health checks', () => {
  assert.equal(appSource.includes('const restoredPluginSource = nextSources.find'), true);
  assert.equal(appSource.includes('setCatVodSource({'), true);
  assert.equal(appSource.includes('capabilities.catvodSources === true'), true);
  assert.equal(appSource.includes('capabilities.catvodHome === true'), true);
  assert.equal(appSource.includes('本地解析器版本偏旧'), true);
});

test('app startup warms up restored CatVod plugin sources automatically', () => {
  assert.equal(appSource.includes('await warmUpRestoredPluginServer({'), true);
  assert.equal(appSource.includes('function shouldWarmUpRestoredPluginServer'), true);
  assert.equal(appSource.includes('正在加载 JS 插件和首页内容'), true);
  assert.equal(appSource.includes('启动时未自动加载源'), false);
});

test('discover loading state explains the selected local parser source is loading', () => {
  assert.equal(appSource.includes('正在读取当前源首页'), false);
  assert.equal(appSource.includes('正在读取本地解析器首页'), true);
  assert.equal(appSource.includes('切换分类或筛选时会重新请求真实来源'), true);
});

test('discover poster cards search by title instead of opening placeholder details', () => {
  const start = appSource.indexOf('function renderDiscoverPosterGrid()');
  const end = appSource.indexOf('function renderDirectPanel()', start);
  const gridSource = appSource.slice(start, end);

  assert.equal(gridSource.includes('searchWithKeyword(poster.title)'), true);
  assert.equal(gridSource.includes("setActivePage('searchResults')"), true);
  assert.equal(gridSource.includes("setActivePage('detail')"), false);
});

test('main shell uses compact top padding instead of the full safe area spacer', () => {
  const stylesStart = appSource.indexOf('scrollContent: {');
  const stylesEnd = appSource.indexOf('header: {', stylesStart);
  const scrollContentStyle = appSource.slice(stylesStart, stylesEnd);

  assert.equal(scrollContentStyle.includes('paddingTop: TOP_SAFE_PADDING'), false);
  assert.equal(scrollContentStyle.includes('paddingTop: COMPACT_TOP_PADDING'), true);
});
