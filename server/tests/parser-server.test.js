const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createParserServer,
} = require('../src/server');

test('GET /health reports service status', async () => {
  const server = createParserServer({
    runner: fixedRunner(),
  });

  const response = await server.inject({
    method: 'GET',
    path: '/health',
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    service: 'ganggan-plugin-parser',
  });
});

test('server rejects parser requests when token is configured and missing', async () => {
  const server = createParserServer({
    runner: fixedRunner(),
    token: 'secret-token',
  });

  const response = await server.inject({
    body: {
      keyword: 'test',
      scriptUrl: 'https://cat.example.com/index.js',
    },
    method: 'POST',
    path: '/catvod/search',
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), {
    error: 'unauthorized',
    message: 'Plugin parser token is missing or invalid.',
  });
});

test('server accepts bearer token and forwards CatVod search requests to runner', async () => {
  const calls = [];
  const server = createParserServer({
    runner: {
      async search(payload) {
        calls.push(payload);
        return {
          list: [{ vod_id: 'movie-1', vod_name: payload.keyword }],
        };
      },
    },
    token: 'secret-token',
  });

  const response = await server.inject({
    body: {
      keyword: 'Sintel',
      scriptUrl: 'https://cat.example.com/index.js',
    },
    headers: {
      authorization: 'Bearer secret-token',
    },
    method: 'POST',
    path: '/catvod/search',
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    list: [{ vod_id: 'movie-1', vod_name: 'Sintel' }],
  });
  assert.deepEqual(calls, [
    {
      keyword: 'Sintel',
      scriptUrl: 'https://cat.example.com/index.js',
    },
  ]);
});

test('server forwards CatVod detail and play requests to runner', async () => {
  const calls = [];
  const server = createParserServer({
    runner: {
      async detail(payload) {
        calls.push(['detail', payload]);
        return {
          list: [
            {
              vod_id: payload.id,
              vod_name: 'Sintel',
              vod_play_from: 'HLS',
              vod_play_url: 'Episode 1$token-1',
            },
          ],
        };
      },
      async play(payload) {
        calls.push(['play', payload]);
        return {
          parse: 0,
          url: 'https://media.example.com/final.m3u8',
        };
      },
    },
  });

  const detail = await server.inject({
    body: {
      id: 'movie-1',
      scriptUrl: 'https://cat.example.com/index.js',
    },
    method: 'POST',
    path: '/catvod/detail',
  });
  const play = await server.inject({
    body: {
      flag: 'HLS',
      id: 'token-1',
      scriptUrl: 'https://cat.example.com/index.js',
    },
    method: 'POST',
    path: '/catvod/play',
  });

  assert.equal(detail.statusCode, 200);
  assert.equal(play.statusCode, 200);
  assert.equal(play.json().url, 'https://media.example.com/final.m3u8');
  assert.deepEqual(calls, [
    [
      'detail',
      {
        id: 'movie-1',
        scriptUrl: 'https://cat.example.com/index.js',
      },
    ],
    [
      'play',
      {
        flag: 'HLS',
        id: 'token-1',
        scriptUrl: 'https://cat.example.com/index.js',
      },
    ],
  ]);
});

test('server returns clear runner errors without crashing', async () => {
  const server = createParserServer({
    runner: {
      async search() {
        throw Object.assign(new Error('catServerFactory is not defined'), {
          code: 'PLUGIN_HOST_MISSING',
          statusCode: 422,
        });
      },
    },
  });

  const response = await server.inject({
    body: {
      keyword: 'test',
      scriptUrl: 'https://cat.example.com/index.js',
    },
    method: 'POST',
    path: '/catvod/search',
  });

  assert.equal(response.statusCode, 422);
  assert.deepEqual(response.json(), {
    error: 'PLUGIN_HOST_MISSING',
    message: 'catServerFactory is not defined',
  });
});

test('server exposes tvbox runtime unavailable errors through facade routes', async () => {
  const server = createParserServer({
    runner: fixedRunner(),
    tvBoxRunner: {
      async search() {
        throw Object.assign(new Error('TVBox runtime is not connected.'), {
          code: 'TVBOX_RUNTIME_UNAVAILABLE',
          statusCode: 503,
        });
      },
    },
  });

  const response = await server.inject({
    body: {
      configUrl: 'https://example.com/wex.json',
      siteKey: 'Wexwencai',
      keyword: '疯迷',
    },
    method: 'POST',
    path: '/tvbox/search',
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    error: 'TVBOX_RUNTIME_UNAVAILABLE',
    message: 'TVBox runtime is not connected.',
  });
});

function fixedRunner() {
  return {
    async detail() {
      return { list: [] };
    },
    async play() {
      return { url: '' };
    },
    async search() {
      return { list: [] };
    },
  };
}
