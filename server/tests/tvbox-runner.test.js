const assert = require('node:assert/strict');
const test = require('node:test');

const {
  TvBoxRunner,
} = require('../src/tvbox-runner');

test('TvBoxRunner resolves csp site metadata before runtime execution', async () => {
  const runner = new TvBoxRunner({
    fetchImpl: async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          spider: 'https://example.com/spider.jar;md5;abc',
          sites: [
            {
              key: 'Wexwencai',
              name: '🌺文才┃秒播🌺',
              type: 3,
              api: 'csp_WexwencaiGuard',
              searchable: 1,
            },
          ],
        }),
    }),
  });

  await assert.rejects(
    () =>
      runner.search({
        configUrl: 'https://example.com/wex.json',
        siteKey: 'Wexwencai',
        keyword: '疯迷',
      }),
    (error) => {
      assert.equal(error.code, 'TVBOX_RUNTIME_UNAVAILABLE');
      assert.equal(error.statusCode, 503);
      assert.match(error.message, /Wexwencai/);
      return true;
    }
  );
});

test('TvBoxRunner rejects missing sites with a clear error', async () => {
  const runner = new TvBoxRunner({
    fetchImpl: async () => ({
      ok: true,
      text: async () => JSON.stringify({ sites: [] }),
    }),
  });

  await assert.rejects(
    () =>
      runner.detail({
        configUrl: 'https://example.com/wex.json',
        siteKey: 'Missing',
        id: '1',
      }),
    /没有找到站点 Missing/
  );
});
