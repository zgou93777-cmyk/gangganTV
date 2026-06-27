const assert = require('node:assert/strict');
const test = require('node:test');

const {
  APP_TABS,
  DEFAULT_TAB_ID,
  buildWatchingSummary,
  getTabById,
} = require('../src/ui-model');

test('defines the three MiraPlay-inspired tabs in display order', () => {
  assert.deepEqual(
    APP_TABS.map((tab) => [tab.id, tab.label]),
    [
      ['discover', '发现'],
      ['watching', '追剧'],
      ['settings', '设置'],
    ]
  );
  assert.equal(DEFAULT_TAB_ID, 'discover');
});

test('returns the requested tab or falls back to discover', () => {
  assert.equal(getTabById('watching').label, '追剧');
  assert.equal(getTabById('missing').id, DEFAULT_TAB_ID);
});

test('builds compact watching summary counts for the home UI', () => {
  const summary = buildWatchingSummary({
    liveChannels: [{ id: 'one' }, { id: 'two' }],
    configSources: [{ id: 'source' }],
    sites: [{ id: 'site-a' }, { id: 'site-b' }, { id: 'site-c' }],
    currentUrl: 'https://example.com/live.m3u8',
  });

  assert.deepEqual(summary, {
    hasCurrentUrl: true,
    liveChannelCount: 2,
    configSourceCount: 1,
    siteCount: 3,
  });
});
