const assert = require('node:assert/strict');
const test = require('node:test');

const {
  fetchTvBoxServerDetail,
  fetchTvBoxServerPlay,
  fetchTvBoxServerSearch,
} = require('../src/tvbox-server-client');

test('fetchTvBoxServerSearch posts configUrl siteKey and keyword', async () => {
  const calls = [];
  const result = await fetchTvBoxServerSearch(
    {
      baseUrl: 'https://parser.example.com/',
      token: 'secret',
      configUrl: 'https://example.com/wex.json',
      siteKey: 'Wexwencai',
    },
    '疯迷',
    async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        text: async () => JSON.stringify({ list: [{ vod_id: '1', vod_name: '疯迷' }] }),
      };
    }
  );

  assert.equal(calls[0].url, 'https://parser.example.com/tvbox/search');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    configUrl: 'https://example.com/wex.json',
    siteKey: 'Wexwencai',
    keyword: '疯迷',
  });
  assert.equal(result[0].name, '疯迷');
  assert.equal(result[0].sourceId, 'Wexwencai');
});

test('fetchTvBoxServerPlay returns direct playable url', async () => {
  const url = await fetchTvBoxServerPlay(
    {
      baseUrl: 'https://parser.example.com',
      token: 'secret',
      configUrl: 'https://example.com/wex.json',
      siteKey: 'Wexwencai',
    },
    { flag: '秒播', id: 'play-id' },
    async () => ({
      ok: true,
      text: async () => JSON.stringify({ kind: 'direct', url: 'https://example.com/a.m3u8' }),
    })
  );

  assert.equal(url, 'https://example.com/a.m3u8');
});

test('tvbox parser errors are shown as Chinese runtime messages', async () => {
  await assert.rejects(
    () =>
      fetchTvBoxServerDetail(
        {
          baseUrl: 'https://parser.example.com',
          token: 'secret',
          configUrl: 'https://example.com/wex.json',
          siteKey: 'Wexwencai',
        },
        '1',
        async () => ({
          ok: false,
          status: 503,
          text: async () =>
            JSON.stringify({
              error: 'TVBOX_RUNTIME_UNAVAILABLE',
              message: 'Android runtime is not connected.',
            }),
        })
      ),
    /TVBox Spider 运行时/
  );
});
