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
  assert.equal(appSource.includes('fetchPluginServerSources'), true);
  assert.equal(appSource.includes('siteBasePath: site?.siteBasePath ||'), true);
});

test('CatVod plugin sources are expanded for incremental search targets', () => {
  assert.equal(appSource.includes('name: childName || fallbackName'), true);
  assert.equal(appSource.includes('setSelectedSearchSourceIds(serverSites.map'), true);
  assert.equal(appSource.includes('await expandPluginServerSources(catVodSource, scriptUrl)'), true);
});

test('restored plugin sources can be expanded after parser health checks', () => {
  assert.equal(appSource.includes('const restoredPluginSource = nextSources.find'), true);
  assert.equal(appSource.includes('setCatVodSource({'), true);
  assert.equal(appSource.includes('capabilities.catvodSources === true'), true);
  assert.equal(appSource.includes('capabilities.catvodHome === true'), true);
  assert.equal(appSource.includes('本地解析器版本偏旧'), true);
});

test('main shell uses compact top padding instead of the full safe area spacer', () => {
  const stylesStart = appSource.indexOf('scrollContent: {');
  const stylesEnd = appSource.indexOf('header: {', stylesStart);
  const scrollContentStyle = appSource.slice(stylesStart, stylesEnd);

  assert.equal(scrollContentStyle.includes('paddingTop: TOP_SAFE_PADDING'), false);
  assert.equal(scrollContentStyle.includes('paddingTop: COMPACT_TOP_PADDING'), true);
});
