const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildCatVodExecutorHtml,
  normalizeCatVodDetailResult,
  normalizeCatVodPlayResult,
  normalizeCatVodSearchResult,
} = require('../src/catvod-adapter');

test('normalizes CatVod search lists into app search results', () => {
  const results = normalizeCatVodSearchResult({
    list: [
      {
        vod_id: 'movie-1',
        vod_name: '三体',
        vod_pic: 'https://img.example.com/1.jpg',
        vod_remarks: '更新至 8',
        source_name: '文才秒播',
      },
    ],
  });

  assert.deepEqual(results, [
    {
      id: 'movie-1',
      name: '三体',
      poster: 'https://img.example.com/1.jpg',
      remarks: '更新至 8',
      sourceId: '文才秒播',
      sourceName: '文才秒播',
    },
  ]);
});

test('normalizes CatVod image proxy poster urls to their remote image url', () => {
  const results = normalizeCatVodSearchResult({
    list: [
      {
        vod_id: 'movie-1',
        vod_name: '豆瓣电影',
        vod_pic:
          'http://127.0.0.1:0/imageProxy?url=https%3A%2F%2Fimg.example.com%2Fposter.jpg&cache=86400',
      },
    ],
  });

  assert.equal(results[0].poster, 'https://img.example.com/poster.jpg');
});

test('normalizes CatVod detail payloads into play groups', () => {
  const detail = normalizeCatVodDetailResult({
    list: [
      {
        vod_id: 'movie-1',
        vod_name: '三体',
        vod_play_from: '线路一$$$线路二',
        vod_play_url: '第 1 集$token-1#第 2 集$token-2$$$备用$https://media.example.com/backup.m3u8',
      },
    ],
  });

  assert.equal(detail.id, 'movie-1');
  assert.equal(detail.name, '三体');
  assert.deepEqual(detail.playGroups, [
    {
      name: '线路一',
      episodes: [
        { name: '第 1 集', url: 'token-1' },
        { name: '第 2 集', url: 'token-2' },
      ],
    },
    {
      name: '线路二',
      episodes: [
        { name: '备用', url: 'https://media.example.com/backup.m3u8' },
      ],
    },
  ]);
});

test('normalizes CatVod play payloads into final playable urls', () => {
  assert.equal(
    normalizeCatVodPlayResult({ parse: 0, url: 'https://media.example.com/final.m3u8' }),
    'https://media.example.com/final.m3u8'
  );

  assert.equal(
    normalizeCatVodPlayResult('https://media.example.com/final.mp4'),
    'https://media.example.com/final.mp4'
  );
});

test('builds an executor html document with bridge hooks and the plugin script', () => {
  const html = buildCatVodExecutorHtml('async function search(wd) { return { list: [] }; }');

  assert.match(html, /window\.ReactNativeWebView\.postMessage/);
  assert.match(html, /__CATVOD_BRIDGE__/);
  assert.match(html, /async function search/);
  assert.doesNotMatch(html, /<script src=/i);
});
