const assert = require('node:assert/strict');
const test = require('node:test');

const {
  fetchPluginServerHealth,
  fetchPluginServerDetail,
  fetchPluginServerPlay,
  fetchPluginServerSearch,
} = require('../src/plugin-server-client');

test('fetchPluginServerHealth loads parser service health', async () => {
  const result = await fetchPluginServerHealth(
    {
      baseUrl: 'https://parser.example.com/',
      token: 'secret-token',
    },
    async (url, options) => {
      assert.equal(url, 'https://parser.example.com/health');
      assert.equal(options.headers.Authorization, 'Bearer secret-token');
      return jsonResponse({
        ok: true,
        service: 'ganggan-plugin-parser',
      });
    }
  );

  assert.deepEqual(result, {
    ok: true,
    service: 'ganggan-plugin-parser',
  });
});

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

test('plugin server errors use clear Chinese messages', async () => {
  await assert.rejects(
    () =>
      fetchPluginServerSearch(
        {
          baseUrl: 'https://parser.example.com',
          scriptUrl: 'https://cat.example.com/index.js',
        },
        '仙逆',
        async () =>
          jsonResponse(
            {
              error: 'unauthorized',
              message: 'Plugin parser token is missing or invalid.',
            },
            401
          )
      ),
    /Token/
  );

  await assert.rejects(
    () =>
      fetchPluginServerSearch(
        {
          baseUrl: 'https://parser.example.com',
          scriptUrl: 'https://cat.example.com/index.js',
        },
        '仙逆',
        async () =>
          jsonResponse(
            {
              error: 'PLUGIN_SITE_INCOMPATIBLE',
              message: "Cannot read properties of undefined (reading 'cookie')",
            },
            422
          )
      ),
    /插件环境|适配器|cookie/
  );

  await assert.rejects(
    () =>
      fetchPluginServerSearch(
        {
          baseUrl: 'https://parser.example.com',
          scriptUrl: 'https://cat.example.com/index.js',
        },
        '仙逆',
        async () =>
          jsonResponse(
            {
              error: 'PLUGIN_SITE_INCOMPATIBLE',
              message: 'This source requires cookie login.',
            },
            422
          )
      ),
    /Cookie|扫码/
  );

  await assert.rejects(
    () =>
      fetchPluginServerSearch(
        {
          baseUrl: 'https://parser.example.com',
          scriptUrl: 'https://config.example.com/wex.json',
        },
        '仙逆',
        async () =>
          jsonResponse(
            {
              error: 'PLUGIN_CONFIG_UNSUPPORTED',
              message:
                'TVBox/OK JSON configs that depend on JAR/CSP plugins are not supported by the JS parser yet.',
            },
            422
          )
      ),
    /TVBox|OK|CSP/
  );

  await assert.rejects(
    () =>
      fetchPluginServerSearch(
        {
          baseUrl: 'https://parser.example.com',
          scriptUrl: 'https://cat.example.com/index.js',
        },
        '仙逆',
        async () =>
          jsonResponse(
            {
              error: 'PLUGIN_TIMEOUT',
              message: 'Plugin execution timed out.',
            },
            504
          )
      ),
    /超时/
  );
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}
