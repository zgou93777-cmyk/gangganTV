const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CatVodRuntimeController,
} = require('../src/catvod-runtime');

test('runtime controller sends run commands and resolves matching WebView results', async () => {
  const injected = [];
  const runtime = new CatVodRuntimeController({
    injectJavaScript: (script) => injected.push(script),
  });

  const pending = runtime.call('search', ['三体', false, 1]);

  assert.equal(injected.length, 1);
  assert.match(injected[0], /__CATVOD_BRIDGE__\.run/);
  assert.match(injected[0], /search/);

  runtime.handleMessage(
    JSON.stringify({
      type: 'result',
      id: 'catvod-call-1',
      ok: true,
      value: { list: [{ vod_id: 'movie-1', vod_name: '三体' }] },
    })
  );

  assert.deepEqual(await pending, {
    list: [{ vod_id: 'movie-1', vod_name: '三体' }],
  });
});

test('runtime controller proxies plugin fetch requests through the host', async () => {
  const injected = [];
  const fetchCalls = [];
  const runtime = new CatVodRuntimeController({
    fetchText: async (url, options) => {
      fetchCalls.push({ url, options });
      return 'hello';
    },
    injectJavaScript: (script) => injected.push(script),
  });

  await runtime.handleMessage(
    JSON.stringify({
      type: 'fetch-text',
      id: 'fetch-1',
      url: 'https://api.example.com/data',
      options: { headers: { Accept: 'text/plain' } },
    })
  );

  assert.deepEqual(fetchCalls, [
    {
      url: 'https://api.example.com/data',
      options: { headers: { Accept: 'text/plain' } },
    },
  ]);
  assert.equal(injected.length, 1);
  assert.match(injected[0], /resolveFetch/);
  assert.match(injected[0], /hello/);
});
