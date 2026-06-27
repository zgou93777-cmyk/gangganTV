const assert = require('node:assert/strict');
const test = require('node:test');

const {
  APP_TABS,
  DEFAULT_TAB_ID,
  buildLiveChannelGroups,
  buildWatchingSummary,
  filterLiveChannels,
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
    playHistory: [{ id: 'recent' }],
    currentUrl: 'https://example.com/live.m3u8',
  });

  assert.deepEqual(summary, {
    hasCurrentUrl: true,
    liveChannelCount: 2,
    configSourceCount: 1,
    playHistoryCount: 1,
    siteCount: 3,
  });
});

test('builds live channel groups with counts and an all option', () => {
  const groups = buildLiveChannelGroups([
    { id: 'cctv-1', group: '央视' },
    { id: 'cctv-2', group: '央视' },
    { id: 'hunan', group: '卫视' },
    { id: 'unknown', group: '' },
  ]);

  assert.deepEqual(groups, [
    { id: 'all', label: '全部', count: 4 },
    { id: '央视', label: '央视', count: 2 },
    { id: '卫视', label: '卫视', count: 1 },
    { id: '未分组', label: '未分组', count: 1 },
  ]);
});

test('filters live channels by keyword and group', () => {
  const channels = [
    {
      id: 'cctv-1',
      name: 'CCTV-1 综合',
      group: '央视',
      url: 'https://media.example.com/cctv1.m3u8',
    },
    {
      id: 'hunan',
      name: '湖南卫视',
      group: '卫视',
      url: 'https://media.example.com/hunan.m3u8',
    },
    {
      id: 'movie',
      name: '电影频道',
      group: '',
      url: 'https://media.example.com/movie.m3u8',
    },
  ];

  assert.deepEqual(
    filterLiveChannels(channels, { keyword: 'cctv', group: 'all' }).map(
      (channel) => channel.id
    ),
    ['cctv-1']
  );
  assert.deepEqual(
    filterLiveChannels(channels, { keyword: '卫视', group: '卫视' }).map(
      (channel) => channel.id
    ),
    ['hunan']
  );
  assert.deepEqual(
    filterLiveChannels(channels, { keyword: '电影', group: '未分组' }).map(
      (channel) => channel.id
    ),
    ['movie']
  );
});
