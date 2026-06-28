# TVBox Source UI Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MiraPlay-style source/search UI foundation and correct TVBox Spider runtime boundaries so `🌺文才┃秒播🌺` is treated as a TVBox JAR Spider source, not a netdisk-login source.

**Architecture:** Keep the Expo app as UI plus playback boundary. Put pure data normalization in `src/`, route remote parser calls through small client modules, and expose TVBox parser facade routes from the existing Node server. The first code pass makes source classification, search grouping, and server API shape correct before the Android/Dex runtime proof.

**Tech Stack:** Expo SDK 54 app with `expo-video`, AsyncStorage, React Native, Node `node:test`, and the existing Node parser server.

---

## File Structure

- Modify `src/iptv-core.js`: normalize TVBox config-level `spider`, site-level `jar/ext/changeable`, and classify `csp_` sites as `tvbox-jar-spider`.
- Modify `tests/iptv-core.test.js`: cover TVBox Spider source classification and preserved source metadata.
- Create `src/search-buckets.js`: group multi-source search results into left-rail buckets.
- Create `tests/search-buckets.test.js`: verify counts, failure buckets, and filtering.
- Create `src/tvbox-server-client.js`: app-side client for `/tvbox/search`, `/tvbox/detail`, and `/tvbox/play`.
- Create `tests/tvbox-server-client.test.js`: verify request payloads, auth headers, and Chinese error messages.
- Modify `src/plugin-server-client.js`: share server URL/header/error helpers or keep behavior aligned with the new TVBox client.
- Modify `App.js`: add source selector state, source rail search state, and route TVBox Spider sites through the parser service.
- Modify `server/src/server.js`: register `/tvbox/search`, `/tvbox/detail`, `/tvbox/play`.
- Create `server/src/tvbox-runner.js`: facade that resolves configs/sites and returns a runtime-unavailable response until the Android/Dex worker is connected.
- Create `server/tests/tvbox-runner.test.js`: verify config/site resolution and runtime error shape.
- Modify `server/tests/parser-server.test.js`: verify new routes and auth behavior.
- Modify `server/README.md`: document CatVod and TVBox parser capabilities separately.

---

### Task 1: Correct TVBox Spider Source Model

**Files:**
- Modify: `src/iptv-core.js`
- Modify: `tests/iptv-core.test.js`

- [ ] **Step 1: Write the failing tests**

Add tests that assert `csp_` sites are searchable TVBox Spider sources and keep their config runtime metadata:

```js
test('parses TVBox csp sites as tvbox jar spider sources', () => {
  const parsed = parseTvBoxConfig(
    {
      name: 'Wex',
      spider: 'https://example.com/spider.jar;md5;abc',
      sites: [
        {
          key: 'Wexwencai',
          name: '🌺文才┃秒播🌺',
          type: 3,
          api: 'csp_WexwencaiGuard',
          searchable: 1,
          changeable: 1,
          ext: 'token',
        },
      ],
    },
    'https://example.com/wex.json',
    '2026-06-28T00:00:00.000Z'
  );

  assert.equal(parsed.source.spider, 'https://example.com/spider.jar;md5;abc');
  assert.equal(parsed.sites[0].runtime, 'tvbox-jar-spider');
  assert.equal(parsed.sites[0].searchable, true);
  assert.equal(parsed.sites[0].unsupportedReason, '');
  assert.equal(parsed.sites[0].api, 'csp_WexwencaiGuard');
  assert.equal(parsed.sites[0].configSpider, 'https://example.com/spider.jar;md5;abc');
  assert.equal(parsed.sites[0].ext, 'token');
  assert.equal(parsed.sites[0].changeable, true);
});

test('config diagnostics count tvbox jar spider sources as runtime sources', () => {
  const diagnostics = buildConfigDiagnostics({
    sources: [{ id: 'https://example.com/wex.json', kind: 'config' }],
    sites: [
      {
        id: 'Wexwencai',
        runtime: 'tvbox-jar-spider',
        type: 3,
        searchable: true,
        unsupportedReason: '',
      },
    ],
  });

  assert.equal(diagnostics.searchableSites, 1);
  assert.equal(diagnostics.runtimeSites, 1);
  assert.equal(diagnostics.unsupportedSites, 0);
  assert.match(diagnostics.summary, /TVBox Spider 1/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
npm test -- tests/iptv-core.test.js
```

Expected: FAIL because `runtimeSites` is missing and `csp_` sites are still marked unsupported.

- [ ] **Step 3: Implement the source model**

In `parseTvBoxConfig`, pass the config `spider` into `normalizeSite`. In `normalizeSite`, return:

```js
const configSpider = readableText(config?.spider);
const jar = readableText(site.jar);
const ext = readableText(site.ext);
const changeable = isTruthyFlag(site.changeable);

if (isCatVodScript) {
  normalizedSite.runtime = 'catvod-server';
  normalizedSite.scriptUrl = api;
} else if (isTvBoxCsp) {
  normalizedSite.runtime = 'tvbox-jar-spider';
  normalizedSite.scriptUrl = api;
  normalizedSite.configSpider = configSpider;
  normalizedSite.jar = jar;
  normalizedSite.ext = ext;
  normalizedSite.changeable = changeable;
  normalizedSite.searchable = isTruthyFlag(site.searchable);
  normalizedSite.unsupportedReason = '';
}
```

Also update diagnostics:

```js
const runtimeSites = sites.filter((site) => site.runtime === 'tvbox-jar-spider').length;
const pluginSites = sites.filter((site) => site.runtime === 'catvod-server').length;
const unsupportedSites = sites.filter((site) => site.unsupportedReason).length;
```

Return `runtimeSites` in diagnostics and make the summary mention `TVBox Spider ${runtimeSites}` when non-zero.

- [ ] **Step 4: Run tests to verify the model passes**

Run:

```powershell
npm test -- tests/iptv-core.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit and push**

Run:

```powershell
git add src/iptv-core.js tests/iptv-core.test.js
git commit -m "fix: classify TVBox Spider sources" -m "中文：把 csp_ 站点识别为 TVBox Spider 运行时源，不再误判为 Cookie/网盘源。" -m "English: Classify csp_ sites as TVBox Spider runtime sources instead of Cookie or netdisk sources."
git push origin codex/iptv-roadmap
```

Expected: branch pushes successfully.

---

### Task 2: Add Search Bucket Utilities For The Left Rail

**Files:**
- Create: `src/search-buckets.js`
- Create: `tests/search-buckets.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/search-buckets.test.js`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildSearchBuckets,
  filterResultsByBucket,
} = require('../src/search-buckets');

test('buildSearchBuckets creates all bucket and source buckets with counts', () => {
  const sites = [
    { id: 'Wexwencai', name: '🌺文才┃秒播🌺' },
    { id: 'Huban', name: '💗虎斑|4K💗' },
  ];
  const results = [
    { id: '1', name: '疯迷', sourceId: 'Wexwencai' },
    { id: '2', name: '疯迷 2', sourceId: 'Huban' },
    { id: '3', name: '疯迷 3', sourceId: 'Huban' },
  ];
  const failures = [{ sourceId: 'Broken', sourceName: '坏源', message: '解析失败' }];

  const buckets = buildSearchBuckets({ sites, results, failures });

  assert.deepEqual(buckets.map((bucket) => bucket.id), [
    'all',
    'Wexwencai',
    'Huban',
    'Broken',
  ]);
  assert.equal(buckets[0].label, '全部');
  assert.equal(buckets[0].count, 3);
  assert.equal(buckets[0].total, 4);
  assert.equal(buckets[1].count, 1);
  assert.equal(buckets[2].count, 2);
  assert.equal(buckets[3].status, 'failed');
});

test('filterResultsByBucket returns all results or one source only', () => {
  const results = [
    { id: '1', sourceId: 'A' },
    { id: '2', sourceId: 'B' },
  ];

  assert.equal(filterResultsByBucket(results, 'all').length, 2);
  assert.deepEqual(filterResultsByBucket(results, 'B'), [{ id: '2', sourceId: 'B' }]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
npm test -- tests/search-buckets.test.js
```

Expected: FAIL because `src/search-buckets.js` does not exist.

- [ ] **Step 3: Implement the utility**

Create `src/search-buckets.js`:

```js
function buildSearchBuckets({ sites = [], results = [], failures = [] } = {}) {
  const resultCounts = new Map();
  results.forEach((result) => {
    const sourceId = result?.sourceId || '';
    if (!sourceId) return;
    resultCounts.set(sourceId, (resultCounts.get(sourceId) || 0) + 1);
  });

  const buckets = [
    {
      id: 'all',
      label: '全部',
      count: results.length,
      total: sites.length + failures.length,
      status: failures.length ? 'partial' : 'ready',
    },
  ];

  sites.forEach((site) => {
    const count = resultCounts.get(site.id) || 0;
    if (count <= 0) return;
    buckets.push({
      id: site.id,
      label: site.name || site.id,
      count,
      total: count,
      status: 'ready',
    });
  });

  failures.forEach((failure) => {
    buckets.push({
      id: failure.sourceId,
      label: failure.sourceName || failure.sourceId,
      count: 0,
      total: 0,
      status: 'failed',
      message: failure.message || '解析失败',
    });
  });

  return buckets;
}

function filterResultsByBucket(results = [], bucketId = 'all') {
  if (!bucketId || bucketId === 'all') {
    return results;
  }

  return results.filter((result) => result?.sourceId === bucketId);
}

module.exports = {
  buildSearchBuckets,
  filterResultsByBucket,
};
```

- [ ] **Step 4: Run the tests**

Run:

```powershell
npm test -- tests/search-buckets.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit and push**

Run:

```powershell
git add src/search-buckets.js tests/search-buckets.test.js
git commit -m "feat: add source search buckets" -m "中文：新增搜索源分组工具，支持左侧源列表和结果数量。" -m "English: Add source search bucket utilities for the left rail counts."
git push origin codex/iptv-roadmap
```

Expected: branch pushes successfully.

---

### Task 3: Add App-Side TVBox Parser Client

**Files:**
- Create: `src/tvbox-server-client.js`
- Create: `tests/tvbox-server-client.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/tvbox-server-client.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
npm test -- tests/tvbox-server-client.test.js
```

Expected: FAIL because the client file does not exist.

- [ ] **Step 3: Implement the client**

Create `src/tvbox-server-client.js` with:

```js
const {
  extractPlayableUrl,
  normalizeDetailResponse,
  normalizeSearchResponse,
} = require('./iptv-core');

async function fetchTvBoxServerSearch(config, keyword, fetchImpl = fetch) {
  const payload = await postTvBoxServer(config, '/tvbox/search', {
    configUrl: config?.configUrl,
    siteKey: config?.siteKey,
    keyword,
  }, fetchImpl);

  return normalizeSearchResponse(payload).map((result) => ({
    ...result,
    sourceId: config?.siteKey || '',
  }));
}

async function fetchTvBoxServerDetail(config, id, fetchImpl = fetch) {
  const payload = await postTvBoxServer(config, '/tvbox/detail', {
    configUrl: config?.configUrl,
    siteKey: config?.siteKey,
    id,
  }, fetchImpl);

  return normalizeDetailResponse(payload);
}

async function fetchTvBoxServerPlay(config, episode, fetchImpl = fetch) {
  const payload = await postTvBoxServer(config, '/tvbox/play', {
    configUrl: config?.configUrl,
    siteKey: config?.siteKey,
    flag: episode?.flag || episode?.group || '',
    id: episode?.id || episode?.url || '',
  }, fetchImpl);

  if (payload?.kind === 'netdisk') {
    throw new Error(payload.message || '该线路需要添加网盘账号或扫码登录');
  }

  const playableUrl = payload?.url || extractPlayableUrl(payload);
  if (!playableUrl) {
    throw new Error(payload?.message || '没有解析到可播放地址');
  }

  return playableUrl;
}

async function postTvBoxServer(config, path, body, fetchImpl) {
  const response = await fetchImpl(buildTvBoxServerUrl(config?.baseUrl, path), {
    body: JSON.stringify(body),
    headers: buildTvBoxServerHeaders(config?.token),
    method: 'POST',
  });

  const payload = await parseTvBoxServerJson(response);

  if (!response.ok) {
    throw new Error(formatTvBoxServerError(response.status, payload));
  }

  return payload;
}

function buildTvBoxServerUrl(baseUrl, path) {
  const cleanBaseUrl = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  if (!/^https?:\/\//i.test(cleanBaseUrl)) {
    throw new Error('解析服务地址需要以 http:// 或 https:// 开头');
  }

  return `${cleanBaseUrl.replace(/\/+$/, '')}${path}`;
}

function buildTvBoxServerHeaders(token) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const cleanToken = typeof token === 'string' ? token.trim() : '';
  if (cleanToken) {
    headers.Authorization = `Bearer ${cleanToken}`;
  }
  return headers;
}

async function parseTvBoxServerJson(response) {
  try {
    return JSON.parse(await response.text());
  } catch {
    throw new Error('TVBox 解析服务没有返回有效 JSON');
  }
}

function formatTvBoxServerError(status, payload) {
  const code = payload?.error || '';
  const message = payload?.message || '';

  if (status === 401 || code === 'unauthorized') {
    return '解析服务 Token 不正确或未填写，请检查设置里的 Token';
  }

  if (code === 'TVBOX_RUNTIME_UNAVAILABLE') {
    return 'TVBox Spider 运行时还没有连接成功，当前源正在适配';
  }

  if (code === 'TVBOX_NETDISK_REQUIRED') {
    return '该线路需要添加网盘账号或扫码登录';
  }

  if (status === 504 || code === 'TVBOX_TIMEOUT') {
    return 'TVBox 解析服务超时，请稍后重试或换一个源';
  }

  return `TVBox 解析服务请求失败：HTTP ${status}${message ? ` ${message}` : ''}`;
}

module.exports = {
  fetchTvBoxServerDetail,
  fetchTvBoxServerPlay,
  fetchTvBoxServerSearch,
  buildTvBoxServerUrl,
  buildTvBoxServerHeaders,
  formatTvBoxServerError,
};
```

- [ ] **Step 4: Run the tests**

Run:

```powershell
npm test -- tests/tvbox-server-client.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit and push**

Run:

```powershell
git add src/tvbox-server-client.js tests/tvbox-server-client.test.js
git commit -m "feat: add TVBox parser client" -m "中文：新增 App 侧 TVBox 解析服务客户端。" -m "English: Add the app-side TVBox parser service client."
git push origin codex/iptv-roadmap
```

Expected: branch pushes successfully.

---

### Task 4: Add Server TVBox Facade Routes

**Files:**
- Create: `server/src/tvbox-runner.js`
- Modify: `server/src/server.js`
- Create: `server/tests/tvbox-runner.test.js`
- Modify: `server/tests/parser-server.test.js`

- [ ] **Step 1: Write runner tests**

Create `server/tests/tvbox-runner.test.js`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');

const { TvBoxRunner } = require('../src/tvbox-runner');

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
```

- [ ] **Step 2: Write route tests**

Add to `server/tests/parser-server.test.js`:

```js
test('server exposes tvbox runtime unavailable errors through facade routes', async () => {
  const server = createParserServer({
    token: '',
    tvBoxRunner: {
      search: async () => {
        throw Object.assign(new Error('TVBox runtime is not connected.'), {
          code: 'TVBOX_RUNTIME_UNAVAILABLE',
          statusCode: 503,
        });
      },
    },
  });

  const response = await inject(server, {
    method: 'POST',
    path: '/tvbox/search',
    body: {
      configUrl: 'https://example.com/wex.json',
      siteKey: 'Wexwencai',
      keyword: '疯迷',
    },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.payload.error, 'TVBOX_RUNTIME_UNAVAILABLE');
});
```

- [ ] **Step 3: Run the server tests to verify they fail**

Run:

```powershell
npm --prefix server test
```

Expected: FAIL because the TVBox runner and routes do not exist.

- [ ] **Step 4: Implement `server/src/tvbox-runner.js`**

Create:

```js
class TvBoxRunner {
  constructor({ fetchImpl = fetch, runtime = null } = {}) {
    this.fetchImpl = fetchImpl;
    this.runtime = runtime;
    this.configCache = new Map();
  }

  async search(payload) {
    const { site } = await this.resolveSite(payload);
    return this.callRuntime('search', site, payload);
  }

  async detail(payload) {
    const { site } = await this.resolveSite(payload);
    return this.callRuntime('detail', site, payload);
  }

  async play(payload) {
    const { site } = await this.resolveSite(payload);
    return this.callRuntime('play', site, payload);
  }

  async resolveSite({ configUrl, siteKey }) {
    if (!configUrl || !/^https?:\/\//i.test(configUrl)) {
      throw withStatus(new Error('配置地址需要以 http:// 或 https:// 开头'), 'TVBOX_BAD_REQUEST', 400);
    }

    if (!siteKey) {
      throw withStatus(new Error('缺少站点 key'), 'TVBOX_BAD_REQUEST', 400);
    }

    const config = await this.fetchConfig(configUrl);
    const sites = Array.isArray(config.sites) ? config.sites : [];
    const site = sites.find((item) => item?.key === siteKey);

    if (!site) {
      throw withStatus(new Error(`没有找到站点 ${siteKey}`), 'TVBOX_SITE_NOT_FOUND', 404);
    }

    return {
      config,
      site: {
        ...site,
        configUrl,
        configSpider: config.spider || '',
      },
    };
  }

  async fetchConfig(configUrl) {
    if (this.configCache.has(configUrl)) {
      return this.configCache.get(configUrl);
    }

    const response = await this.fetchImpl(configUrl, {
      headers: {
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        'User-Agent': 'okhttp/4.10.0',
      },
    });

    if (!response.ok) {
      throw withStatus(new Error(`配置请求失败：HTTP ${response.status}`), 'TVBOX_CONFIG_FETCH_FAILED', 502);
    }

    const config = JSON.parse(await response.text());
    this.configCache.set(configUrl, config);
    return config;
  }

  async callRuntime(action, site, payload) {
    if (!this.runtime || typeof this.runtime[action] !== 'function') {
      throw withStatus(
        new Error(`TVBox Spider 运行时未连接：${site.key || payload.siteKey}`),
        'TVBOX_RUNTIME_UNAVAILABLE',
        503
      );
    }

    return this.runtime[action](site, payload);
  }
}

function withStatus(error, code, statusCode) {
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  TvBoxRunner,
};
```

- [ ] **Step 5: Register routes in `server/src/server.js`**

Create a `tvBoxRunner` option in `createParserServer`, defaulting to `new TvBoxRunner()`, then add:

```js
routes.set('POST /tvbox/search', withAuth(token, async (request) =>
  tvBoxRunner.search(request.body || {})
));
routes.set('POST /tvbox/detail', withAuth(token, async (request) =>
  tvBoxRunner.detail(request.body || {})
));
routes.set('POST /tvbox/play', withAuth(token, async (request) =>
  tvBoxRunner.play(request.body || {})
));
```

Use the existing error response path so `error.code` and `error.statusCode` propagate.

- [ ] **Step 6: Run server tests**

Run:

```powershell
npm --prefix server test
```

Expected: PASS.

- [ ] **Step 7: Commit and push**

Run:

```powershell
git add server/src/tvbox-runner.js server/src/server.js server/tests/tvbox-runner.test.js server/tests/parser-server.test.js
git commit -m "feat: add TVBox parser facade" -m "中文：新增服务端 TVBox 解析门面路由，为 Spider 运行时接入预留稳定 API。" -m "English: Add server-side TVBox facade routes for the Spider runtime."
git push origin codex/iptv-roadmap
```

Expected: branch pushes successfully.

---

### Task 5: Wire TVBox Spider Sources Into App Search Flow

**Files:**
- Modify: `App.js`
- Modify: `tests/iptv-api.test.js`
- Modify: `tests/site-tester.test.js`

- [ ] **Step 1: Add tests for route selection**

In `tests/iptv-api.test.js`, add:

```js
test('tvbox jar spider sites are not rejected by ensureSearchableSite', async () => {
  const site = {
    id: 'Wexwencai',
    runtime: 'tvbox-jar-spider',
    type: 3,
    api: 'csp_WexwencaiGuard',
    searchable: true,
    unsupportedReason: '',
  };

  await assert.rejects(
    () => fetchTvBoxSearch(site, '疯迷', async () => ({ ok: false, status: 500 })),
    /Invalid URL|URL/
  );
});
```

This confirms the old unsupported gate is gone; App routing will stop direct HTTP calls for this runtime.

- [ ] **Step 2: Run the focused tests**

Run:

```powershell
npm test -- tests/iptv-api.test.js tests/site-tester.test.js
```

Expected: existing assertions that expect plugin rejection fail and need updates.

- [ ] **Step 3: Update App imports and helpers**

Import:

```js
const {
  fetchTvBoxServerDetail,
  fetchTvBoxServerPlay,
  fetchTvBoxServerSearch,
} = require('./src/tvbox-server-client');
const {
  buildSearchBuckets,
  filterResultsByBucket,
} = require('./src/search-buckets');
```

Add helpers:

```js
function isTvBoxSpiderSite(site) {
  return site?.runtime === 'tvbox-jar-spider';
}

function buildTvBoxServerConfig(site) {
  if (!pluginServerUrl.trim()) {
    throw new Error('请先在设置里填写解析服务地址');
  }

  return {
    baseUrl: pluginServerUrl.trim(),
    token: pluginServerToken.trim(),
    configUrl: site?.sourceId || site?.configUrl,
    siteKey: site?.siteKey || site?.id,
  };
}
```

- [ ] **Step 4: Update search/detail/play branch order**

In `searchVod`, route TVBox Spider sites before normal JSON:

```js
const results = isTvBoxSpiderSite(selectedSite)
  ? await fetchTvBoxServerSearch(buildTvBoxServerConfig(selectedSite), cleanKeyword)
  : isPluginServerSite(selectedSite)
  ? await fetchPluginServerSearch(buildPluginServerConfig(selectedSite), cleanKeyword)
  : isCatVodRuntimeActive(selectedSite)
  ? normalizeCatVodSearchResult(
      await catVodRuntimeRef.current.call('search', [cleanKeyword, false, 1])
    )
  : await fetchTvBoxSearch(selectedSite, cleanKeyword);
```

Use equivalent branches in `loadDetail` and `playEpisode`.

- [ ] **Step 5: Update stored site normalization**

In `normalizeStoredSites`, change TVBox CSP normalization to:

```js
runtime: 'tvbox-jar-spider',
searchable: site.searchable !== false,
unsupportedReason: '',
```

Keep CatVod script behavior unchanged.

- [ ] **Step 6: Run tests**

Run:

```powershell
npm test
node --check App.js
```

Expected: PASS.

- [ ] **Step 7: Commit and push**

Run:

```powershell
git add App.js src/tvbox-server-client.js src/search-buckets.js tests/iptv-api.test.js tests/site-tester.test.js
git commit -m "feat: route TVBox Spider sites to parser" -m "中文：App 侧把 TVBox Spider 源接入解析服务搜索、详情和播放链路。" -m "English: Route TVBox Spider sources through the parser service for search, detail, and playback."
git push origin codex/iptv-roadmap
```

Expected: branch pushes successfully.

---

### Task 6: Reshape Search UI Into Source Rail And Result Grid

**Files:**
- Modify: `App.js`

- [ ] **Step 1: Add state and memoized buckets**

Add state:

```js
const [activeSearchBucketId, setActiveSearchBucketId] = useState('all');
const [searchFailures, setSearchFailures] = useState([]);
```

Add memo values:

```js
const searchBuckets = useMemo(
  () =>
    buildSearchBuckets({
      sites,
      results: searchResults,
      failures: searchFailures,
    }),
  [searchFailures, searchResults, sites]
);

const visibleSearchResults = useMemo(
  () => filterResultsByBucket(searchResults, activeSearchBucketId),
  [activeSearchBucketId, searchResults]
);
```

- [ ] **Step 2: Add source rail renderer**

Create:

```jsx
function renderSearchSourceRail() {
  if (!searchBuckets.length) {
    return null;
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={styles.searchRail}
      contentContainerStyle={styles.searchRailContent}
    >
      {searchBuckets.map((bucket) => {
        const isActive = activeSearchBucketId === bucket.id;
        return (
          <Pressable
            accessibilityRole="button"
            key={bucket.id}
            onPress={() => setActiveSearchBucketId(bucket.id)}
            style={({ pressed }) => [
              styles.searchRailItem,
              isActive && styles.searchRailItemActive,
              bucket.status === 'failed' && styles.searchRailItemFailed,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text numberOfLines={1} style={[
              styles.searchRailLabel,
              isActive && styles.searchRailLabelActive,
            ]}>
              {bucket.label}
            </Text>
            <Text style={styles.searchRailCount}>
              {bucket.id === 'all' ? `${bucket.count}/${bucket.total}` : bucket.count}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
```

- [ ] **Step 3: Change result grid source**

In `renderResultGrid`, render `visibleSearchResults` instead of `vodResultCards` when the search screen is active:

```js
const cards = buildVodResultCards(visibleSearchResults);
```

Keep detail loading behavior unchanged.

- [ ] **Step 4: Compose search layout**

In `renderSearchPanel`, replace the vertical result list area with:

```jsx
<View style={styles.searchSplit}>
  {renderSearchSourceRail()}
  <View style={styles.searchResultPane}>
    {renderResultGrid()}
  </View>
</View>
```

- [ ] **Step 5: Add styles**

Add compact iPhone-first styles:

```js
searchSplit: {
  flexDirection: 'row',
  gap: 12,
  alignItems: 'flex-start',
},
searchRail: {
  width: 118,
  maxHeight: 560,
},
searchRailContent: {
  gap: 8,
  paddingBottom: 12,
},
searchRailItem: {
  minHeight: 42,
  borderRadius: 8,
  paddingHorizontal: 8,
  paddingVertical: 8,
  backgroundColor: '#f6f7f9',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
},
searchRailItemActive: {
  backgroundColor: '#2f80ed',
},
searchRailItemFailed: {
  opacity: 0.58,
},
searchRailLabel: {
  flex: 1,
  color: '#111827',
  fontSize: 15,
  fontWeight: '600',
},
searchRailLabelActive: {
  color: '#ffffff',
},
searchRailCount: {
  minWidth: 28,
  overflow: 'hidden',
  borderRadius: 8,
  paddingHorizontal: 6,
  paddingVertical: 2,
  color: '#111827',
  backgroundColor: '#f6a953',
  fontSize: 13,
  fontVariant: ['tabular-nums'],
  textAlign: 'center',
},
searchResultPane: {
  flex: 1,
  minWidth: 0,
},
```

- [ ] **Step 6: Run syntax and tests**

Run:

```powershell
npm test
node --check App.js
```

Expected: PASS.

- [ ] **Step 7: Commit and push**

Run:

```powershell
git add App.js
git commit -m "feat: add source rail search UI" -m "中文：搜索页改为左侧源列表、右侧海报结果的布局。" -m "English: Add the left source rail and right poster grid search layout."
git push origin codex/iptv-roadmap
```

Expected: branch pushes successfully.

---

### Task 7: Add Source Selector Menu On Discover

**Files:**
- Modify: `App.js`

- [ ] **Step 1: Add selector state**

Add:

```js
const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
```

- [ ] **Step 2: Add selector component**

Create:

```jsx
function renderSourceSelector() {
  const label = selectedSite?.name || '导入配置';

  return (
    <View style={styles.sourceSelectorWrap}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setSourceMenuOpen((value) => !value)}
        style={({ pressed }) => [
          styles.sourceSelectorButton,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.sourceSelectorChevron}>{sourceMenuOpen ? '⌃' : '⌄'}</Text>
        <Text numberOfLines={1} style={styles.sourceSelectorText}>
          {label}
        </Text>
      </Pressable>
      {sourceMenuOpen ? (
        <View style={styles.sourceMenu}>
          <ScrollView showsVerticalScrollIndicator style={styles.sourceMenuScroll}>
            {sites.map((site) => (
              <Pressable
                accessibilityRole="button"
                key={site.id}
                onPress={() => {
                  selectSite(site);
                  setSourceMenuOpen(false);
                }}
                style={({ pressed }) => [
                  styles.sourceMenuItem,
                  selectedSiteId === site.id && styles.sourceMenuItemActive,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.sourceMenuCheck}>
                  {selectedSiteId === site.id ? '✓' : ''}
                </Text>
                <Text numberOfLines={1} style={styles.sourceMenuText}>
                  {site.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 3: Place selector on discover screen**

Render it near the top of `renderDiscover()` above category chips:

```jsx
{renderSourceSelector()}
```

- [ ] **Step 4: Add styles**

Use:

```js
sourceSelectorWrap: {
  position: 'relative',
  zIndex: 20,
},
sourceSelectorButton: {
  alignSelf: 'flex-start',
  maxWidth: '74%',
  minHeight: 46,
  borderRadius: 23,
  paddingHorizontal: 14,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  backgroundColor: 'rgba(255,255,255,0.92)',
  borderWidth: 1,
  borderColor: '#e5e7eb',
},
sourceSelectorChevron: {
  fontSize: 24,
  color: '#111827',
  lineHeight: 26,
},
sourceSelectorText: {
  color: '#111827',
  fontSize: 22,
  fontWeight: '700',
},
sourceMenu: {
  position: 'absolute',
  top: 56,
  left: 0,
  width: 300,
  maxHeight: 520,
  borderRadius: 24,
  backgroundColor: 'rgba(255,255,255,0.86)',
  borderWidth: 1,
  borderColor: 'rgba(209,213,219,0.8)',
  overflow: 'hidden',
  boxShadow: '0 18px 48px rgba(15, 23, 42, 0.18)',
},
sourceMenuScroll: {
  maxHeight: 520,
},
sourceMenuItem: {
  minHeight: 58,
  paddingHorizontal: 18,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 12,
},
sourceMenuItemActive: {
  backgroundColor: 'rgba(47,128,237,0.12)',
},
sourceMenuCheck: {
  width: 22,
  fontSize: 22,
  color: '#111827',
},
sourceMenuText: {
  flex: 1,
  color: '#111827',
  fontSize: 22,
  fontWeight: '600',
},
```

- [ ] **Step 5: Run syntax and tests**

Run:

```powershell
npm test
node --check App.js
```

Expected: PASS.

- [ ] **Step 6: Commit and push**

Run:

```powershell
git add App.js
git commit -m "feat: add source selector menu" -m "中文：发现页新增左上角源选择菜单，贴近 MiraPlay 的源切换体验。" -m "English: Add the discover source selector menu inspired by the MiraPlay source switcher."
git push origin codex/iptv-roadmap
```

Expected: branch pushes successfully.

---

### Task 8: Verify Expo Export And Server Tests

**Files:**
- No source file changes expected unless verification reveals a failure.

- [ ] **Step 1: Run full app tests**

Run:

```powershell
npm test
```

Expected: all app tests PASS.

- [ ] **Step 2: Run server tests**

Run:

```powershell
npm --prefix server test
```

Expected: all server tests PASS.

- [ ] **Step 3: Run syntax check**

Run:

```powershell
node --check App.js
```

Expected: no syntax errors.

- [ ] **Step 4: Run iOS export check**

Run:

```powershell
npx expo export --platform ios --output-dir .expo-check-ios
```

Expected: export completes without JS bundling errors.

- [ ] **Step 5: Inspect git status**

Run:

```powershell
git status --short --branch
```

Expected: only `.research/` remains untracked, unless implementation files need a final commit.

---

## Self-Review

- Spec coverage: Tasks 1, 3, 4, and 5 cover the TVBox Spider runtime boundary. Tasks 2, 6, and 7 cover the MiraPlay-style source selector and left-rail search UI. Task 8 covers verification.
- Placeholder scan: The plan contains no `TBD`, `TODO`, or unspecified implementation steps.
- Type consistency: Runtime label is consistently `tvbox-jar-spider`; server routes are consistently `/tvbox/search`, `/tvbox/detail`, `/tvbox/play`; app client config uses `baseUrl`, `token`, `configUrl`, and `siteKey`.
