const assert = require('node:assert/strict');
const test = require('node:test');

const {
  addPlayHistoryItem,
  normalizePlayHistory,
} = require('../src/play-history');

test('adds a playable item to the front of history with safe defaults', () => {
  const nextHistory = addPlayHistoryItem(
    [],
    {
      type: 'vod',
      title: '  ',
      url: ' https://example.com/movie.m3u8 ',
      sourceName: 'Public Test',
    },
    '2026-06-27T10:00:00.000Z'
  );

  assert.deepEqual(nextHistory, [
    {
      id: 'https://example.com/movie.m3u8',
      type: 'vod',
      title: '未命名播放',
      url: 'https://example.com/movie.m3u8',
      sourceName: 'Public Test',
      playedAt: '2026-06-27T10:00:00.000Z',
    },
  ]);
});

test('moves duplicate urls to the front and keeps the newest metadata', () => {
  const existing = [
    {
      id: 'https://example.com/old.m3u8',
      type: 'live',
      title: 'Old Channel',
      url: 'https://example.com/old.m3u8',
      sourceName: '旧列表',
      playedAt: '2026-06-26T10:00:00.000Z',
    },
    {
      id: 'https://example.com/movie.m3u8',
      type: 'vod',
      title: 'Old Movie',
      url: 'https://example.com/movie.m3u8',
      sourceName: '旧站点',
      playedAt: '2026-06-26T09:00:00.000Z',
    },
  ];

  const nextHistory = addPlayHistoryItem(
    existing,
    {
      type: 'vod',
      title: 'New Movie',
      url: 'https://example.com/movie.m3u8',
      sourceName: '新站点',
    },
    '2026-06-27T10:00:00.000Z'
  );

  assert.equal(nextHistory.length, 2);
  assert.equal(nextHistory[0].title, 'New Movie');
  assert.equal(nextHistory[0].sourceName, '新站点');
  assert.equal(nextHistory[1].title, 'Old Channel');
});

test('normalizes stored history and drops invalid entries', () => {
  const normalized = normalizePlayHistory([
    {
      type: 'live',
      title: 'Channel',
      url: 'https://example.com/live.m3u8',
      playedAt: '2026-06-27T10:00:00.000Z',
    },
    {
      type: 'vod',
      title: 'Broken',
      url: 'ftp://example.com/movie.mp4',
    },
    null,
  ]);

  assert.deepEqual(normalized, [
    {
      id: 'https://example.com/live.m3u8',
      type: 'live',
      title: 'Channel',
      url: 'https://example.com/live.m3u8',
      sourceName: '',
      playedAt: '2026-06-27T10:00:00.000Z',
    },
  ]);
});

test('limits history to the requested maximum count', () => {
  const existing = Array.from({ length: 4 }, (_, index) => ({
    type: 'live',
    title: `Channel ${index + 1}`,
    url: `https://example.com/${index + 1}.m3u8`,
  }));

  const nextHistory = addPlayHistoryItem(
    existing,
    {
      type: 'vod',
      title: 'Movie',
      url: 'https://example.com/movie.m3u8',
    },
    '2026-06-27T10:00:00.000Z',
    3
  );

  assert.deepEqual(
    nextHistory.map((item) => item.title),
    ['Movie', 'Channel 1', 'Channel 2']
  );
});
