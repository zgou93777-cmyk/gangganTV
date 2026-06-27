const assert = require('node:assert/strict');
const test = require('node:test');

const {
  extractConfigSourceCandidates,
  scanConfigSourceText,
} = require('../src/config-source-scanner');

test('extractConfigSourceCandidates keeps valid urls and reports malformed pasted plugin urls', () => {
  const candidates = extractConfigSourceCandidates(`OK影视接口：
牛二 http://new.王二小放牛娃.top (http://new.王二小放牛娃.top/)
牛二 https://9280.kstore.vip/wex.json
魔力云播：http://wexfnw:wexfnwindex.js.md5
魔力云播：https://9280.kstore.vip/cat/index.js.md5`);

  assert.deepEqual(candidates, [
    {
      input: 'http://new.王二小放牛娃.top',
      url: 'http://new.xn--4kq62z5rby2qupq9ub.top/',
      valid: true,
    },
    {
      input: 'https://9280.kstore.vip/wex.json',
      url: 'https://9280.kstore.vip/wex.json',
      valid: true,
    },
    {
      input: 'https://9280.kstore.vip/cat/index.js.md5',
      url: 'https://9280.kstore.vip/cat/index.js.md5',
      valid: true,
    },
    {
      input: 'http://wexfnw:wexfnwindex.js.md5',
      url: '',
      valid: false,
      reason: '链接格式错误，可能是复制时缺少域名或 @ 符号。',
    },
  ]);
});

test('scanConfigSourceText classifies TVBox configs, plugin sources, invalid urls, and network failures', async () => {
  const results = await scanConfigSourceText(
    `牛二 https://config.example.com/wex.json
魔力云播 https://plugin.example.com/cat/index.js.md5
坏链接 http://wexfnw:wexfnwindex.js.md5
失效 https://down.example.com/wex.json`,
    {
      fetchImpl: async (url) => {
        if (url.includes('config.example.com')) {
          return jsonResponse({
            name: 'Config One',
            sites: [
              {
                key: 'api-one',
                name: 'API One',
                type: 1,
                api: 'https://api.example.com/tvbox',
                searchable: 1,
              },
              {
                key: 'cat-one',
                name: 'Cat One',
                type: 3,
                api: 'csp_Demo',
                searchable: 1,
              },
            ],
          });
        }

        return jsonResponse({ message: 'down' }, 503);
      },
      now: () => '2026-06-27T12:00:00.000Z',
    }
  );

  assert.deepEqual(
    results.map((result) => ({
      input: result.input,
      url: result.url,
      kind: result.kind,
      ok: result.ok,
      status: result.status,
      siteCount: result.siteCount,
      searchableCount: result.searchableCount,
      pluginCount: result.pluginCount,
    })),
    [
      {
        input: 'https://config.example.com/wex.json',
        url: 'https://config.example.com/wex.json',
        kind: 'config',
        ok: true,
        status: 'ready',
        siteCount: 2,
        searchableCount: 1,
        pluginCount: 1,
      },
      {
        input: 'https://plugin.example.com/cat/index.js.md5',
        url: 'https://plugin.example.com/cat/index.js.md5',
        kind: 'plugin',
        ok: false,
        status: 'plugin-source',
        siteCount: 0,
        searchableCount: 0,
        pluginCount: 0,
      },
      {
        input: 'https://down.example.com/wex.json',
        url: 'https://down.example.com/wex.json',
        kind: 'unknown',
        ok: false,
        status: 'network-error',
        siteCount: 0,
        searchableCount: 0,
        pluginCount: 0,
      },
      {
        input: 'http://wexfnw:wexfnwindex.js.md5',
        url: '',
        kind: 'invalid',
        ok: false,
        status: 'invalid-url',
        siteCount: 0,
        searchableCount: 0,
        pluginCount: 0,
      },
    ]
  );
  assert.equal(results[0].source.name, 'Config One');
  assert.equal(results[0].sites.length, 2);
  assert.match(results[1].message, /插件/);
  assert.match(results[2].message, /HTTP 503/);
  assert.match(results[3].message, /链接格式错误/);
});

test('scanConfigSourceText explains configs that only contain plugin sites', async () => {
  const results = await scanConfigSourceText('https://config.example.com/plugin-only.json', {
    fetchImpl: async () =>
      jsonResponse({
        sites: [
          {
            key: 'cat-one',
            name: 'Cat One',
            type: 3,
            api: 'csp_Demo',
          },
        ],
      }),
  });

  assert.equal(results[0].ok, true);
  assert.equal(results[0].siteCount, 1);
  assert.equal(results[0].searchableCount, 0);
  assert.equal(results[0].pluginCount, 1);
  assert.equal(
    results[0].message,
    '可导入配置，识别到 1 个站点；但都是插件源，当前版本只展示，不执行本地搜索。'
  );
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}
