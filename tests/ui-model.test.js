const assert = require('node:assert/strict');
const test = require('node:test');

const {
  APP_TABS,
  DEFAULT_TAB_ID,
  DISCOVER_FEED_TABS,
  DISCOVER_MODES,
  DISCOVER_REGION_FILTERS,
  DISCOVER_SORT_FILTERS,
  buildDiscoverPosterFeed,
  buildPosterDetailModel,
  buildVodResultCards,
  buildWatchingSummary,
  getTabById,
} = require('../src/ui-model');
const uiModel = require('../src/ui-model');

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
  assert.deepEqual(
    APP_TABS.map((tab) => tab.icon),
    ['play', 'history', 'settings']
  );
  assert.equal(APP_TABS.some((tab) => 'symbol' in tab), false);
});

test('defines discover content modes for the home category rail', () => {
  assert.deepEqual(
    DISCOVER_MODES.map((mode) => [mode.id, mode.label]),
    [
      ['all', '热门内容'],
      ['vod', '点播搜索'],
    ]
  );
});

test('does not expose live-channel UI helpers while the app is VOD-only', () => {
  assert.equal('buildLiveChannelGroups' in uiModel, false);
  assert.equal('filterLiveChannels' in uiModel, false);
});

test('defines MiraPlay discover categories and filters', () => {
  assert.deepEqual(
    DISCOVER_FEED_TABS.map((tab) => tab.label),
    ['热门内容', '热门电视', '热门综艺', '电影', '电视']
  );
  assert.equal(DISCOVER_SORT_FILTERS[0].label, '排序');
  assert.equal(DISCOVER_REGION_FILTERS[1].label, '华语');
});

test('builds demo discover posters with stable card fields', () => {
  const posters = buildDiscoverPosterFeed();

  assert.equal(posters.length >= 9, true);
  assert.deepEqual(Object.keys(posters[0]).sort(), [
    'id',
    'poster',
    'rating',
    'subtitle',
    'title',
  ]);
});

test('normalizes a selected search result into detail view data', () => {
  const detail = buildPosterDetailModel({
    name: '痴迷',
    poster: 'https://img.example.com/obsession.jpg',
    remarks: 'HD中字',
    sourceName: '瓜子',
    year: '2026',
    type: '恐怖 / 惊悚',
    duration: '108分钟',
    description: '测试简介',
  });

  assert.equal(detail.title, '痴迷');
  assert.equal(detail.heroImage, 'https://img.example.com/obsession.jpg');
  assert.equal(detail.metaLine, '2026 · 恐怖 / 惊悚 · 108分钟');
  assert.equal(detail.sourceName, '瓜子');
});

test('returns the requested tab or falls back to discover', () => {
  assert.equal(getTabById('watching').label, '追剧');
  assert.equal(getTabById('missing').id, DEFAULT_TAB_ID);
});

test('builds compact watching summary counts for the home UI', () => {
  const summary = buildWatchingSummary({
    configSources: [{ id: 'source' }],
    sites: [{ id: 'site-a' }, { id: 'site-b' }, { id: 'site-c' }],
    playHistory: [{ id: 'recent' }],
    currentUrl: 'https://example.com/movie.m3u8',
  });

  assert.deepEqual(summary, {
    hasCurrentUrl: true,
    configSourceCount: 1,
    playHistoryCount: 1,
    siteCount: 3,
  });
});

test('builds safe VOD result cards for poster grid rendering', () => {
  const cards = buildVodResultCards([
    {
      id: 'movie-1',
      name: '三体',
      poster: 'https://img.example.com/three-body.jpg',
      remarks: '更新至 8',
    },
    {
      id: '',
      name: '',
      poster: '',
      remarks: '',
    },
  ]);

  assert.deepEqual(cards, [
    {
      id: 'movie-1',
      title: '三体',
      poster: 'https://img.example.com/three-body.jpg',
      badge: '更新至 8',
      raw: {
        id: 'movie-1',
        name: '三体',
        poster: 'https://img.example.com/three-body.jpg',
        remarks: '更新至 8',
      },
    },
    {
      id: 'vod-card-2',
      title: '未命名',
      poster: '',
      badge: '',
      raw: {
        id: '',
        name: '',
        poster: '',
        remarks: '',
      },
    },
  ]);
});
