const assert = require('node:assert/strict');
const test = require('node:test');

const {
  fetchPluginServerDetail,
  fetchPluginServerPlay,
  fetchPluginServerSearch,
} = require('../src/plugin-server-client');

test('fetchPluginServerSearch posts script and keyword then normalizes results', async () => {
  const calls = [];
  const results = await fetchPluginServerSearch(
    {
      baseUrl: 'https://parser.example.com',
      token: 'secret-token',
      scriptUrl: 'https://cat.example.com/index.js',
    },
    '三体',
    async (url, options) => {
      calls.push({
        headers: options.headers,
        url,
        options: JSON.parse(options.body),
      });
      return jsonResponse({
        list: [{ vod_id: 'movie-1', vod_name: '三体' }],
      });
    }
  );

  assert.deepEqual(calls, [
    {
      headers: {
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        Authorization: 'Bearer secret-token',
        'Content-Type': 'application/json',
      },
      url: 'https://parser.example.com/catvod/search',
      options: {
        scriptUrl: 'https://cat.example.com/index.js',
        keyword: '三体',
      },
    },
  ]);
  assert.deepEqual(results, [
    { id: 'movie-1', name: '三体', poster: '', remarks: '' },
  ]);
});

test('fetchPluginServerDetail and play normalize server results', async () => {
  const detail = await fetchPluginServerDetail(
    {
      baseUrl: 'https://parser.example.com/',
      scriptUrl: 'https://cat.example.com/index.js',
    },
    'movie-1',
    async () =>
      jsonResponse({
        list: [
          {
            vod_id: 'movie-1',
            vod_name: '三体',
            vod_play_from: '线路',
            vod_play_url: '第 1 集$token-1',
          },
        ],
      })
  );

  assert.equal(detail.playGroups[0].episodes[0].url, 'token-1');

  const playable = await fetchPluginServerPlay(
    {
      baseUrl: 'https://parser.example.com/',
      scriptUrl: 'https://cat.example.com/index.js',
    },
    { flag: '线路', id: 'token-1' },
    async () => jsonResponse({ url: 'https://media.example.com/final.m3u8' })
  );

  assert.equal(playable, 'https://media.example.com/final.m3u8');
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}
