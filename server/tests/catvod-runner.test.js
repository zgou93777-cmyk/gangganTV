const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CatVodRunner,
  resolveExecutableScriptUrl,
} = require('../src/catvod-runner');

test('resolveExecutableScriptUrl converts md5 manifest urls to nearby js scripts', async () => {
  const calls = [];
  const url = await resolveExecutableScriptUrl('https://cat.example.com/index.js.md5', {
    fetchText: async (candidate) => {
      calls.push(candidate);
      return candidate.endsWith('.md5')
        ? '742b32fc4443dad721ae85639c5e4c60'
        : 'module.exports = {};';
    },
  });

  assert.equal(url, 'https://cat.example.com/index.js');
  assert.deepEqual(calls, [
    'https://cat.example.com/index.js.md5',
    'https://cat.example.com/index.js',
  ]);
});

test('resolveExecutableScriptUrl rejects TVBox JSON configs instead of executing them as JS', async () => {
  await assert.rejects(
    () =>
      resolveExecutableScriptUrl('https://config.example.com/wex.json', {
        fetchText: async () =>
          JSON.stringify({
            spider: 'https://example.com/spider.jar;md5;abc',
            sites: [
              {
                key: 'Wex',
                name: 'Wex',
                type: 3,
                api: 'csp_Wex',
                searchable: 1,
              },
            ],
          }),
      }),
    (error) => {
      assert.equal(error.code, 'PLUGIN_CONFIG_UNSUPPORTED');
      assert.equal(error.statusCode, 422);
      assert.match(error.message, /TVBox\/OK/);
      return true;
    }
  );
});

test('CatVodRunner calls plain function-style CatVod scripts in a worker', async () => {
  const runner = new CatVodRunner({
    fetchText: async () => `
      async function search(wd) {
        return { list: [{ vod_id: 'search-' + wd, vod_name: wd }] };
      }
      async function detail(id) {
        return { list: [{ vod_id: id, vod_play_from: 'HLS', vod_play_url: 'Ep 1$token-1' }] };
      }
      async function play(flag, id) {
        return { parse: 0, url: 'https://media.example.com/' + id + '.m3u8' };
      }
    `,
    timeoutMs: 3000,
  });

  const search = await runner.search({
    keyword: 'Sintel',
    scriptUrl: 'https://cat.example.com/index.js',
  });
  const detail = await runner.detail({
    id: 'search-Sintel',
    scriptUrl: 'https://cat.example.com/index.js',
  });
  const play = await runner.play({
    flag: 'HLS',
    id: 'token-1',
    scriptUrl: 'https://cat.example.com/index.js',
  });

  assert.deepEqual(search, {
    list: [{ vod_id: 'search-Sintel', vod_name: 'Sintel' }],
  });
  assert.equal(detail.list[0].vod_play_url, 'Ep 1$token-1');
  assert.equal(play.url, 'https://media.example.com/token-1.m3u8');
});

test('CatVodRunner caches resolved script text across calls', async () => {
  const calls = [];
  const runner = new CatVodRunner({
    fetchText: async (url) => {
      calls.push(url);
      return `
        async function search(wd) {
          return { list: [{ vod_id: wd, vod_name: wd }] };
        }
      `;
    },
    timeoutMs: 3000,
  });

  await runner.search({
    keyword: 'One',
    scriptUrl: 'https://cat.example.com/index.js',
  });
  await runner.search({
    keyword: 'Two',
    scriptUrl: 'https://cat.example.com/index.js',
  });

  assert.deepEqual(calls, ['https://cat.example.com/index.js']);
});

test('CatVodRunner downloads credentialed plugin urls with basic auth headers', async () => {
  const calls = [];
  const runner = new CatVodRunner({
    fetchText: async (url, options) => {
      calls.push({
        authorization: options.headers.Authorization,
        url,
      });
      return `
        async function search(wd) {
          return { list: [{ vod_id: wd, vod_name: wd }] };
        }
      `;
    },
    timeoutMs: 3000,
  });

  await runner.search({
    keyword: 'Auth',
    scriptUrl: 'http://user:pass@cat.example.com/index.js',
  });

  assert.deepEqual(calls, [
    {
      authorization: 'Basic dXNlcjpwYXNz',
      url: 'http://cat.example.com/index.js',
    },
  ]);
});

test('resolveExecutableScriptUrl handles credentialed md5 plugin mirrors', async () => {
  const calls = [];
  const url = await resolveExecutableScriptUrl(
    'http://wexfnw:wexfnw@cat.999888987.xyz/index.js.md5',
    {
      fetchText: async (candidate, options = {}) => {
        calls.push({
          authorization: options.headers?.Authorization || '',
          url: candidate,
        });
        return candidate.endsWith('.md5')
          ? '742b32fc4443dad721ae85639c5e4c60'
          : 'module.exports = {};';
      },
    }
  );

  assert.equal(url, 'http://cat.999888987.xyz/index.js');
  assert.deepEqual(calls, [
    {
      authorization: 'Basic d2V4Zm53OndleGZudw==',
      url: 'http://cat.999888987.xyz/index.js.md5',
    },
    {
      authorization: 'Basic d2V4Zm53OndleGZudw==',
      url: 'http://cat.999888987.xyz/index.js',
    },
  ]);
});

test('CatVodRunner calls Fastify-style route plugins through injected routes', async () => {
  const runner = new CatVodRunner({
    fetchText: async () => `
      module.exports = {
        api: async (app) => {
          app.post('/search', async (request) => ({
            list: [{ vod_id: request.body.wd, vod_name: request.body.wd }]
          }));
          app.post('/detail', async (request) => ({
            list: [{ vod_id: request.body.id, vod_play_from: 'Route', vod_play_url: 'One$play-token' }]
          }));
          app.post('/play', async (request) => ({
            parse: 0,
            url: 'https://media.example.com/' + request.body.id + '.mp4'
          }));
        }
      };
    `,
    timeoutMs: 3000,
  });

  const search = await runner.search({
    keyword: '三体',
    scriptUrl: 'https://cat.example.com/index.js',
  });
  const detail = await runner.detail({
    id: '三体',
    scriptUrl: 'https://cat.example.com/index.js',
  });
  const play = await runner.play({
    flag: 'Route',
    id: 'play-token',
    scriptUrl: 'https://cat.example.com/index.js',
  });

  assert.equal(search.list[0].vod_name, '三体');
  assert.equal(detail.list[0].vod_play_from, 'Route');
  assert.equal(play.url, 'https://media.example.com/play-token.mp4');
});

test('CatVodRunner calls bundle-style start plugins through host routes', async () => {
  const runner = new CatVodRunner({
    fetchText: async () => `
      module.exports = {
        async start(config) {
          const app = createCatApp({ config });
          app.register(async (server) => {
            server.register(async (spider) => {
              spider.post('/search', async (request) => ({
                list: [{ vod_id: 'bundle-' + request.body.wd, vod_name: request.body.wd }]
              }));
              spider.post('/detail', async (request) => ({
                list: [{
                  vod_id: request.body.id,
                  vod_name: 'Bundle Detail',
                  vod_play_from: 'Bundle',
                  vod_play_url: 'One$bundle-token'
                }]
              }));
              spider.post('/play', async (request) => ({
                parse: 0,
                url: 'https://media.example.com/' + request.body.id + '.m3u8'
              }));
            }, { prefix: '/spider/demo/3' });
            server.get('/config', async () => ({
              video: {
                sites: [{ key: 'nodejs_demo', name: 'Demo', api: '/spider/demo/3' }]
              }
            }));
          });
          await app.ready();
          globalThis.__catvodApp = app;
        }
      };
    `,
    timeoutMs: 3000,
  });

  const search = await runner.search({
    keyword: 'Bundle',
    scriptUrl: 'https://cat.example.com/index.js',
  });
  const detail = await runner.detail({
    id: search.list[0].vod_id,
    scriptUrl: 'https://cat.example.com/index.js',
  });
  const play = await runner.play({
    flag: 'Bundle',
    id: detail.list[0].vod_play_url.split('$')[1],
    scriptUrl: 'https://cat.example.com/index.js',
  });

  assert.match(search.list[0].vod_id, /^catvod:/);
  assert.equal(detail.list[0].vod_play_from, 'Bundle');
  assert.equal(play.url, 'https://media.example.com/bundle-token.m3u8');
});

test('CatVodRunner exposes createCatApp bundle sources and searches one selected source', async () => {
  const runner = new CatVodRunner({
    fetchText: async () => `
      module.exports = {
        async start(config) {
          const app = createCatApp({ config });
          app.register(async (server) => {
            server.register(async (spider) => {
              spider.post('/search', async (request) => ({
                list: [{ vod_id: 'one-' + request.body.wd, vod_name: request.body.wd + ' A' }]
              }));
              spider.post('/home', async () => ({
                list: [{ vod_id: 'home-one', vod_name: 'Home One' }]
              }));
            }, { prefix: '/spider/one/3' });
            server.register(async (spider) => {
              spider.post('/search', async (request) => ({
                list: [{ vod_id: 'two-' + request.body.wd, vod_name: request.body.wd + ' B' }]
              }));
              spider.post('/home', async () => ({
                list: [{ vod_id: 'home-two', vod_name: 'Home Two' }]
              }));
            }, { prefix: '/spider/two/3' });
            server.get('/config', async () => ({
              video: {
                sites: [
                  { key: 'nodejs_one', name: 'One Source', api: '/spider/one/3' },
                  { key: 'nodejs_two', name: 'Two Source', api: '/spider/two/3' }
                ]
              }
            }));
          });
          await app.ready();
          globalThis.__catvodApp = app;
        }
      };
    `,
    timeoutMs: 3000,
  });

  const sources = await runner.sources({
    scriptUrl: 'https://cat.example.com/index.js',
  });
  const search = await runner.search({
    keyword: 'movie',
    scriptUrl: 'https://cat.example.com/index.js',
    siteBasePath: '/spider/two/3',
  });
  const home = await runner.home({
    scriptUrl: 'https://cat.example.com/index.js',
    siteBasePath: '/spider/two/3',
  });

  assert.deepEqual(sources.sites, [
    { key: 'nodejs_one', name: 'One Source', api: '/spider/one/3' },
    { key: 'nodejs_two', name: 'Two Source', api: '/spider/two/3' },
  ]);
  assert.equal(search.list.length, 1);
  assert.equal(search.list[0].source_name, 'Two Source');
  assert.equal(search.list[0].vod_name, 'movie B');
  assert.equal(home.list[0].source_name, 'Two Source');
  assert.equal(home.list[0].vod_name, 'Home Two');
});

test('CatVodRunner falls back to the first category when bundle home has no list', async () => {
  const runner = new CatVodRunner({
    fetchText: async () => `
      module.exports = {
        async start(config) {
          const app = createCatApp({ config });
          app.register(async (server) => {
            server.register(async (spider) => {
              spider.post('/home', async () => ({
                class: [{ type_id: 'hot_gaia', type_name: '热门内容' }],
                list: []
              }));
              spider.post('/category', async (request) => ({
                list: [{
                  vod_id: 'category-' + request.body.tid,
                  vod_name: 'Category Home',
                  vod_pic: 'https://img.example.com/home.jpg'
                }]
              }));
            }, { prefix: '/spider/douban/3' });
            server.get('/config', async () => ({
              video: {
                sites: [{ key: 'nodejs_douban', name: '豆瓣首页', api: '/spider/douban/3' }]
              }
            }));
          });
          await app.ready();
          globalThis.__catvodApp = app;
        }
      };
    `,
    timeoutMs: 3000,
  });

  const home = await runner.home({
    scriptUrl: 'https://cat.example.com/index.js',
    siteBasePath: '/spider/douban/3',
  });

  assert.equal(home.list.length, 1);
  assert.equal(home.list[0].source_name, '豆瓣首页');
  assert.equal(home.list[0].vod_name, 'Category Home');
  assert.match(home.list[0].vod_id, /^catvod:/);
});

test('CatVodRunner aggregates multiple categories when bundle home has no list', async () => {
  const runner = new CatVodRunner({
    fetchText: async () => `
      module.exports = {
        async start(config) {
          const app = createCatApp({ config });
          app.register(async (server) => {
            server.register(async (spider) => {
              spider.post('/home', async () => ({
                class: [
                  { type_id: 'hot', type_name: 'Hot' },
                  { type_id: 'movie', type_name: 'Movie' },
                  { type_id: 'tv', type_name: 'TV' }
                ],
                list: []
              }));
              spider.post('/category', async (request) => ({
                list: [
                  {
                    vod_id: request.body.tid + '-1',
                    vod_name: request.body.tid + ' One',
                    vod_pic: 'https://img.example.com/' + request.body.tid + '-1.jpg'
                  },
                  {
                    vod_id: request.body.tid === 'movie' ? 'hot-1' : request.body.tid + '-2',
                    vod_name: request.body.tid + ' Two',
                    vod_pic: 'https://img.example.com/' + request.body.tid + '-2.jpg'
                  }
                ]
              }));
            }, { prefix: '/spider/home/3' });
            server.get('/config', async () => ({
              video: {
                sites: [{ key: 'nodejs_home', name: 'Home Source', api: '/spider/home/3' }]
              }
            }));
          });
          await app.ready();
          globalThis.__catvodApp = app;
        }
      };
    `,
    timeoutMs: 3000,
  });

  const home = await runner.home({
    scriptUrl: 'https://cat.example.com/index.js',
    siteBasePath: '/spider/home/3',
  });

  assert.equal(home.list.length, 5);
  assert.deepEqual(
    home.list.map((item) => item.vod_name),
    ['hot One', 'hot Two', 'movie One', 'tv One', 'tv Two']
  );
  assert.equal(home.list[0].source_name, 'Home Source');
  assert.match(home.list[0].vod_id, /^catvod:/);
});

test('CatVodRunner fills sparse bundle home lists from categories', async () => {
  const runner = new CatVodRunner({
    fetchText: async () => `
      module.exports = {
        async start(config) {
          const app = createCatApp({ config });
          app.register(async (server) => {
            server.register(async (spider) => {
              spider.post('/home', async () => ({
                class: [
                  { type_id: 'hot', type_name: 'Hot' },
                  { type_id: 'movie', type_name: 'Movie' }
                ],
                list: [{ vod_id: 'home-1', vod_name: 'Home One' }]
              }));
              spider.post('/category', async (request) => ({
                list: request.body.page === 1
                  ? [{ vod_id: 'home-1', vod_name: 'Duplicate Home' }]
                  : [
                    { vod_id: request.body.tid + '-page' + request.body.page + '-1', vod_name: request.body.tid + ' Page ' + request.body.page + ' One' },
                    { vod_id: request.body.tid + '-page' + request.body.page + '-2', vod_name: request.body.tid + ' Page ' + request.body.page + ' Two' }
                  ]
              }));
            }, { prefix: '/spider/sparse/3' });
            server.get('/config', async () => ({
              video: {
                sites: [{ key: 'nodejs_sparse', name: 'Sparse Source', api: '/spider/sparse/3' }]
              }
            }));
          });
          await app.ready();
          globalThis.__catvodApp = app;
        }
      };
    `,
    timeoutMs: 3000,
  });

  const home = await runner.home({
    scriptUrl: 'https://cat.example.com/index.js',
    siteBasePath: '/spider/sparse/3',
  });

  assert.deepEqual(
    home.list.map((item) => item.vod_name),
    [
      'Home One',
      'hot Page 2 One',
      'hot Page 2 Two',
      'hot Page 3 One',
      'hot Page 3 Two',
      'movie Page 2 One',
      'movie Page 2 Two',
      'movie Page 3 One',
      'movie Page 3 Two'
    ]
  );
  assert.equal(home.list[0].source_name, 'Sparse Source');
  assert.match(home.list[0].vod_id, /^catvod:/);
});

test('CatVodRunner gives start plugins an in-memory host instead of opening a port', async () => {
  const runner = new CatVodRunner({
    fetchText: async () => `
      module.exports = {
        async start() {
          const server = catServerFactory(() => {});
          if (typeof server.on !== 'function') throw new Error('server.on missing');
          if (typeof server.listen !== 'function') throw new Error('server.listen missing');
          if (typeof server.address !== 'function') throw new Error('server.address missing');
          const app = createCatApp({ server });
          app.register(async (server) => {
            server.get('/config', async () => ({
              video: { sites: [{ key: 'nodejs_demo', api: '/spider/demo/3' }] }
            }));
            server.post('/spider/demo/3/search', async (request) => ({
              list: [{ vod_id: request.body.wd, vod_name: request.body.wd }]
            }));
          });
          await app.ready();
          app.listen({ port: 9988 }, (_error, address) => {
            if (address !== 'http://127.0.0.1:0') throw new Error('unexpected listen address');
          });
          globalThis.__catvodApp = app;
        }
      };
    `,
    timeoutMs: 3000,
  });

  const result = await runner.search({
    keyword: 'Memory',
    scriptUrl: 'https://cat.example.com/index.js',
  });

  assert.match(result.list[0].vod_id, /^catvod:/);
});

test('CatVodRunner host reply supports chainable Fastify helpers and raw events', async () => {
  const runner = new CatVodRunner({
    fetchText: async () => `
      module.exports = {
        async start() {
          const app = createCatApp({ server: catServerFactory(() => {}) });
          app.register(async (server) => {
            server.get('/config', async () => ({
              video: { sites: [{ key: 'nodejs_demo', api: '/spider/demo/3' }] }
            }));
            server.post('/spider/demo/3/search', async (_request, reply) => {
              reply.raw.on('close', () => {});
              return reply
                .header('x-parser', 'ok')
                .type('application/json')
                .code(200)
                .send({ list: [{ vod_id: 'chainable', vod_name: 'Chainable' }] });
            });
          });
          await app.ready();
          app.listen({ port: 9988 }, () => {});
          globalThis.__catvodApp = app;
        }
      };
    `,
    timeoutMs: 3000,
  });

  const result = await runner.search({
    keyword: 'Chainable',
    scriptUrl: 'https://cat.example.com/index.js',
  });

  assert.match(result.list[0].vod_id, /^catvod:/);
});

test('CatVodRunner can call routes through a catServerFactory request handler fallback', async () => {
  const runner = new CatVodRunner({
    fetchText: async () => `
      module.exports = {
        async start() {
          const server = catServerFactory(async (request, response) => {
            if (request.raw !== request) throw new Error('request.raw missing');
            request.setEncoding('utf8');
            request.removeListener('end', () => {});
            request.resume();
            const chunks = [];
            request.on('data', (chunk) => chunks.push(chunk));
            request.on('end', () => {
              const body = chunks.length ? JSON.parse(chunks.join('')) : {};
              response.on('finish', () => {});
              response.removeListener('finish', () => {});
            response.setHeader('content-type', 'application/json');
              if (!response.hasHeader('content-type')) throw new Error('response.hasHeader missing');
              if (request.url === '/config') {
                response.end(JSON.stringify({
                  video: { sites: [{ key: 'nodejs_demo', api: '/spider/demo/3' }] }
                }));
                return;
              }
              if (request.url === '/spider/demo/3/search') {
                response.end(JSON.stringify({
                  list: [{ vod_id: body.wd, vod_name: body.wd }]
                }));
                return;
              }
              response.statusCode = 404;
              response.end(JSON.stringify({ error: 'not found' }));
            });
          });
          server.listen({ port: 9988 }, () => {});
        }
      };
    `,
    timeoutMs: 3000,
  });

  const result = await runner.search({
    keyword: 'Handler',
    scriptUrl: 'https://cat.example.com/index.js',
  });

  assert.match(result.list[0].vod_id, /^catvod:/);
});

test('CatVodRunner tries bundle video sites until search returns results', async () => {
  const runner = new CatVodRunner({
    fetchText: async () => `
      module.exports = {
        async start() {
          const server = catServerFactory(async (request, response) => {
            const chunks = [];
            request.on('data', (chunk) => chunks.push(chunk));
            request.on('end', () => {
              const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
              response.setHeader('content-type', 'application/json');
              if (request.url === '/config') {
                response.end(JSON.stringify({
                  video: {
                    sites: [
                      { key: 'nodejs_empty', api: '/spider/empty/3' },
                      { key: 'nodejs_hit', api: '/spider/hit/3' }
                    ]
                  }
                }));
                return;
              }
              if (request.url === '/spider/empty/3/search') {
                response.end(JSON.stringify({ list: [] }));
                return;
              }
              if (request.url === '/spider/hit/3/search') {
                response.end(JSON.stringify({ list: [{ vod_id: body.wd, vod_name: body.wd }] }));
                return;
              }
              if (request.url === '/spider/hit/3/detail') {
                response.end(JSON.stringify({
                  list: [{ vod_id: body.id, vod_play_from: 'Hit', vod_play_url: 'One$play-token' }]
                }));
                return;
              }
              response.statusCode = 404;
              response.end(JSON.stringify({ error: 'not found' }));
            });
          });
          server.listen({ port: 9988 }, () => {});
        }
      };
    `,
    timeoutMs: 3000,
  });

  const search = await runner.search({
    keyword: 'Hit',
    scriptUrl: 'https://cat.example.com/index.js',
  });
  const detail = await runner.detail({
    id: search.list[0].vod_id,
    scriptUrl: 'https://cat.example.com/index.js',
  });

  assert.match(search.list[0].vod_id, /^catvod:/);
  assert.equal(detail.list[0].vod_play_from, 'Hit');
});

test('CatVodRunner aggregates bundle search results from all matching video sites', async () => {
  const runner = new CatVodRunner({
    fetchText: async () => `
      module.exports = {
        async start() {
          const server = catServerFactory(async (request, response) => {
            const chunks = [];
            request.on('data', (chunk) => chunks.push(chunk));
            request.on('end', () => {
              const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
              response.setHeader('content-type', 'application/json');
              if (request.url === '/config') {
                response.end(JSON.stringify({
                  video: {
                    sites: [
                      { key: 'nodejs_one', name: '一号源', api: '/spider/one/3' },
                      { key: 'nodejs_two', name: '二号源', api: '/spider/two/3' }
                    ]
                  }
                }));
                return;
              }
              if (request.url === '/spider/one/3/search') {
                response.end(JSON.stringify({
                  list: [{ vod_id: 'one-' + body.wd, vod_name: body.wd + ' A' }]
                }));
                return;
              }
              if (request.url === '/spider/two/3/search') {
                response.end(JSON.stringify({
                  list: [{ vod_id: 'two-' + body.wd, vod_name: body.wd + ' B' }]
                }));
                return;
              }
              response.statusCode = 404;
              response.end(JSON.stringify({ error: 'not found' }));
            });
          });
          server.listen({ port: 9988 }, () => {});
        }
      };
    `,
    timeoutMs: 3000,
  });

  const search = await runner.search({
    keyword: '痴迷',
    scriptUrl: 'https://cat.example.com/index.js',
  });

  assert.equal(search.list.length, 2);
  assert.deepEqual(
    search.list.map((item) => item.vod_name),
    ['痴迷 A', '痴迷 B']
  );
  assert.deepEqual(
    search.list.map((item) => item.source_name),
    ['一号源', '二号源']
  );
  assert.match(search.list[0].vod_id, /^catvod:/);
  assert.match(search.list[1].vod_id, /^catvod:/);
});

test('CatVodRunner exposes bundle video sources and searches one selected source', async () => {
  const runner = new CatVodRunner({
    fetchText: async () => `
      module.exports = {
        async start() {
          const server = catServerFactory(async (request, response) => {
            const chunks = [];
            request.on('data', (chunk) => chunks.push(chunk));
            request.on('end', () => {
              const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
              response.setHeader('content-type', 'application/json');
              if (request.url === '/config') {
                response.end(JSON.stringify({
                  video: {
                    sites: [
                      { key: 'nodejs_one', name: '一号源', api: '/spider/one/3' },
                      { key: 'nodejs_two', name: '二号源', api: '/spider/two/3' }
                    ]
                  }
                }));
                return;
              }
              if (request.url === '/spider/one/3/search') {
                response.end(JSON.stringify({
                  list: [{ vod_id: 'one-' + body.wd, vod_name: body.wd + ' A' }]
                }));
                return;
              }
              if (request.url === '/spider/two/3/search') {
                response.end(JSON.stringify({
                  list: [{ vod_id: 'two-' + body.wd, vod_name: body.wd + ' B' }]
                }));
                return;
              }
              response.statusCode = 404;
              response.end(JSON.stringify({ error: 'not found' }));
            });
          });
          server.listen({ port: 9988 }, () => {});
        }
      };
    `,
    timeoutMs: 3000,
  });

  const sources = await runner.sources({
    scriptUrl: 'https://cat.example.com/index.js',
  });
  const search = await runner.search({
    keyword: '痴迷',
    scriptUrl: 'https://cat.example.com/index.js',
    siteBasePath: '/spider/two/3',
  });

  assert.deepEqual(sources.sites, [
    { key: 'nodejs_one', name: '一号源', api: '/spider/one/3' },
    { key: 'nodejs_two', name: '二号源', api: '/spider/two/3' },
  ]);
  assert.equal(search.list.length, 1);
  assert.equal(search.list[0].source_name, '二号源');
  assert.equal(search.list[0].vod_name, '痴迷 B');
});

test('CatVodRunner batch searches selected bundle sources in one worker', async () => {
  const runner = new CatVodRunner({
    fetchText: async () => `
      module.exports = {
        async start() {
          const server = catServerFactory(async (request, response) => {
            const chunks = [];
            request.on('data', (chunk) => chunks.push(chunk));
            request.on('end', () => {
              const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
              response.setHeader('content-type', 'application/json');
              if (request.url === '/config') {
                response.end(JSON.stringify({
                  video: {
                    sites: [
                      { key: 'nodejs_one', name: '一号源', api: '/spider/one/3' },
                      { key: 'nodejs_two', name: '二号源', api: '/spider/two/3' }
                    ]
                  }
                }));
                return;
              }
              if (request.url === '/spider/one/3/search') {
                response.end(JSON.stringify({
                  list: [{ vod_id: 'one-' + body.wd, vod_name: body.wd + ' A' }]
                }));
                return;
              }
              if (request.url === '/spider/two/3/search') {
                response.end(JSON.stringify({
                  list: [{ vod_id: 'two-' + body.wd, vod_name: body.wd + ' B' }]
                }));
                return;
              }
              response.statusCode = 404;
              response.end(JSON.stringify({ error: 'not found' }));
            });
          });
          server.listen({ port: 9988 }, () => {});
        }
      };
    `,
    timeoutMs: 3000,
  });

  const search = await runner.searchBatch({
    keyword: '痴迷',
    scriptUrl: 'https://cat.example.com/index.js',
    siteBasePaths: ['/spider/one/3', '/spider/two/3'],
  });

  assert.equal(search.failures.length, 0);
  assert.deepEqual(
    search.results.map((entry) => ({
      count: entry.list.length,
      siteBasePath: entry.siteBasePath,
      sourceName: entry.sourceName,
      title: entry.list[0].vod_name,
    })),
    [
      {
        count: 1,
        siteBasePath: '/spider/one/3',
        sourceName: '一号源',
        title: '痴迷 A',
      },
      {
        count: 1,
        siteBasePath: '/spider/two/3',
        sourceName: '二号源',
        title: '痴迷 B',
      },
    ]
  );
});

test('CatVodRunner loads bundle home lists from the selected source', async () => {
  const runner = new CatVodRunner({
    fetchText: async () => `
      module.exports = {
        async start() {
          const server = catServerFactory(async (request, response) => {
            response.setHeader('content-type', 'application/json');
            if (request.url === '/config') {
              response.end(JSON.stringify({
                video: {
                  sites: [{ key: 'nodejs_home', name: '首页源', api: '/spider/home/3' }]
                }
              }));
              return;
            }
            if (request.url === '/spider/home/3/home') {
              response.end(JSON.stringify({
                list: [{ vod_id: 'home-1', vod_name: '首页影片' }]
              }));
              return;
            }
            response.statusCode = 404;
            response.end(JSON.stringify({ error: 'not found' }));
          });
          server.listen({ port: 9988 }, () => {});
        }
      };
    `,
    timeoutMs: 3000,
  });

  const home = await runner.home({
    scriptUrl: 'https://cat.example.com/index.js',
    siteBasePath: '/spider/home/3',
  });

  assert.equal(home.list[0].vod_name, '首页影片');
  assert.equal(home.list[0].source_name, '首页源');
  assert.match(home.list[0].vod_id, /^catvod:/);
});

test('CatVodRunner loads bundle category lists from the selected source', async () => {
  const runner = new CatVodRunner({
    fetchText: async () => `
      module.exports = {
        async start() {
          const server = catServerFactory(async (request, response) => {
            const chunks = [];
            request.on('data', (chunk) => chunks.push(chunk));
            request.on('end', () => {
              const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
              response.setHeader('content-type', 'application/json');
              if (request.url === '/config') {
                response.end(JSON.stringify({
                  video: {
                    sites: [{ key: 'nodejs_home', name: '首页源', api: '/spider/home/3' }]
                  }
                }));
                return;
              }
              if (request.url === '/spider/home/3/category') {
                response.end(JSON.stringify({
                  list: body.page === 1
                    ? [{
                      vod_id: body.tid + '-' + body.extend.sort,
                      vod_name: body.tid + ' ' + body.extend.area,
                    }]
                    : [
                      {
                        vod_id: body.tid + '-page' + body.page + '-1',
                        vod_name: body.tid + ' page ' + body.page + ' one',
                      },
                      {
                        vod_id: body.tid + '-page' + body.page + '-2',
                        vod_name: body.tid + ' page ' + body.page + ' two',
                      }
                    ]
                }));
                return;
              }
              response.statusCode = 404;
              response.end(JSON.stringify({ error: 'not found' }));
            });
          });
          server.listen({ port: 9988 }, () => {});
        }
      };
    `,
    timeoutMs: 3000,
  });

  const category = await runner.category({
    extend: {
      area: '华语',
      sort: 'T',
    },
    page: 1,
    scriptUrl: 'https://cat.example.com/index.js',
    siteBasePath: '/spider/home/3',
    tid: 'movie',
  });

  assert.equal(category.list[0].vod_name, 'movie 华语');
  assert.deepEqual(
    category.list.map((item) => item.vod_name),
    [
      'movie 华语',
      'movie page 2 one',
      'movie page 2 two',
      'movie page 3 one',
      'movie page 3 two',
    ]
  );
  assert.equal(category.list[0].source_name, '首页源');
  assert.match(category.list[0].vod_id, /^catvod:/);
});

test('CatVodRunner reports bundle route parser failures as incompatible source errors', async () => {
  const runner = new CatVodRunner({
    fetchText: async () => `
      module.exports = {
        async start() {
          const server = catServerFactory(async (request, response) => {
            response.setHeader('content-type', 'application/json');
            if (request.url === '/config') {
              response.end(JSON.stringify({
                video: { sites: [{ key: 'nodejs_demo', api: '/spider/demo/3' }] }
              }));
              return;
            }
            response.statusCode = 500;
            response.end(JSON.stringify({
              statusCode: 500,
              error: 'Internal Server Error',
              message: "Cannot read properties of undefined (reading 'cookie')"
            }));
          });
          server.listen({ port: 9988 }, () => {});
        }
      };
    `,
    timeoutMs: 3000,
  });

  await assert.rejects(
    () =>
      runner.play({
        flag: 'Pan',
        id: 'catvod:eyJpZCI6InBhbi10b2tlbiIsInNpdGVCYXNlUGF0aCI6Ii9zcGlkZXIvZGVtby8zIn0',
        scriptUrl: 'https://cat.example.com/index.js',
      }),
    (error) => {
      assert.equal(error.code, 'PLUGIN_SITE_INCOMPATIBLE');
      assert.equal(error.statusCode, 422);
      assert.match(error.message, /cookie/);
      return true;
    }
  );
});

test('CatVodRunner applies configurable script startup timeout inside the worker', async () => {
  const runner = new CatVodRunner({
    fetchText: async () => 'while (true) {}',
    scriptTimeoutMs: 50,
    timeoutMs: 3000,
  });

  await assert.rejects(
    () =>
      runner.search({
        keyword: 'Slow',
        scriptUrl: 'https://cat.example.com/index.js',
      }),
    (error) => {
      assert.equal(error.code, 'ERR_SCRIPT_EXECUTION_TIMEOUT');
      assert.match(error.message, /50ms/);
      return true;
    }
  );
});
