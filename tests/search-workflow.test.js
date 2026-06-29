const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildSearchTargets,
  searchAcrossSites,
} = require('../src/search-workflow');

test('buildSearchTargets uses selected source ids and skips non-searchable sites', () => {
  const sites = [
    { id: 'cat', name: 'CatVod', searchable: true },
    { id: 'jar', name: 'Spider', searchable: true },
    { id: 'off', name: 'Off', searchable: false },
  ];

  assert.deepEqual(buildSearchTargets({ sites }).map((site) => site.id), [
    'cat',
    'jar',
  ]);
  assert.deepEqual(
    buildSearchTargets({
      selectedSourceIds: ['jar', 'missing', 'off'],
      sites,
    }).map((site) => site.id),
    ['jar']
  );
});

test('searchAcrossSites tags results with their source and keeps per-source failures', async () => {
  const sites = [
    { id: 'cat', name: 'CatVod', searchable: true },
    { id: 'jar', name: 'Spider', searchable: true },
    { id: 'off', name: 'Off', searchable: false },
  ];

  const result = await searchAcrossSites({
    keyword: '疯迷',
    searchSite: async (site) => {
      if (site.id === 'jar') {
        throw new Error('TVBox Spider 未连接');
      }

      return [
        {
          id: 'movie-1',
          name: '疯迷',
        },
      ];
    },
    sites,
  });

  assert.deepEqual(result.results, [
    {
      id: 'movie-1',
      name: '疯迷',
      runtimeSiteId: 'cat',
      runtimeSiteName: 'CatVod',
      sourceId: 'cat',
      sourceName: 'CatVod',
    },
  ]);
  assert.deepEqual(result.failures, [
    {
      sourceId: 'jar',
      sourceName: 'Spider',
      message: 'TVBox Spider 未连接',
    },
  ]);
});

test('searchAcrossSites preserves CatVod child source while tracking parent runtime site', async () => {
  const result = await searchAcrossSites({
    keyword: '痴迷',
    searchSite: async () => [
      {
        id: 'catvod-result-1',
        name: '痴迷TC',
        sourceId: 'nodejs_guazi',
        sourceName: '🌺瓜子|秒播🌺',
      },
    ],
    sites: [
      {
        id: 'catvod-server-runtime',
        name: 'cat.999888987.xyz',
        runtime: 'catvod-server',
        searchable: true,
      },
    ],
  });

  assert.deepEqual(result.results, [
    {
      id: 'catvod-result-1',
      name: '痴迷TC',
      runtimeSiteId: 'catvod-server-runtime',
      runtimeSiteName: 'cat.999888987.xyz',
      sourceId: 'nodejs_guazi',
      sourceName: '🌺瓜子|秒播🌺',
    },
  ]);
});

test('searchAcrossSites records skipped runtime sources without calling them', async () => {
  const calledSiteIds = [];
  const result = await searchAcrossSites({
    getSkipReason: (site) =>
      site.runtime === 'tvbox-jar-spider' ? 'TVBox Spider 未连接' : '',
    keyword: '疯迷',
    searchSite: async (site) => {
      calledSiteIds.push(site.id);
      return [{ id: 'movie-1', name: '疯迷' }];
    },
    sites: [
      { id: 'cat', name: 'CatVod', searchable: true },
      {
        id: 'jar',
        name: '文才秒播',
        runtime: 'tvbox-jar-spider',
        searchable: true,
      },
    ],
  });

  assert.deepEqual(calledSiteIds, ['cat']);
  assert.deepEqual(
    result.results.map((item) => item.sourceId),
    ['cat']
  );
  assert.deepEqual(result.failures, [
    {
      sourceId: 'jar',
      sourceName: '文才秒播',
      message: 'TVBox Spider 未连接',
    },
  ]);
});

test('searchAcrossSites reports each source as soon as it finishes', async () => {
  let releaseSlowSearch;
  const slowSearch = new Promise((resolve) => {
    releaseSlowSearch = () => resolve([{ id: 'slow-1', name: 'Slow Result' }]);
  });
  const progressEvents = [];
  let searchFinished = false;

  const searchPromise = searchAcrossSites({
    keyword: 'test',
    onProgress: (event) => progressEvents.push(event),
    searchSite: async (site) => {
      if (site.id === 'slow') {
        return slowSearch;
      }

      return [{ id: 'fast-1', name: 'Fast Result' }];
    },
    sites: [
      { id: 'slow', name: 'Slow Site', searchable: true },
      { id: 'fast', name: 'Fast Site', searchable: true },
    ],
  }).then((result) => {
    searchFinished = true;
    return result;
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(searchFinished, false);
  assert.equal(progressEvents.length, 1);
  assert.equal(progressEvents[0].type, 'results');
  assert.equal(progressEvents[0].site.id, 'fast');
  assert.deepEqual(progressEvents[0].results, [
    {
      id: 'fast-1',
      name: 'Fast Result',
      runtimeSiteId: 'fast',
      runtimeSiteName: 'Fast Site',
      sourceId: 'fast',
      sourceName: 'Fast Site',
    },
  ]);
  assert.equal(progressEvents[0].completedCount, 1);
  assert.equal(progressEvents[0].targetCount, 2);

  releaseSlowSearch();
  const result = await searchPromise;

  assert.equal(progressEvents.length, 2);
  assert.equal(progressEvents[1].site.id, 'slow');
  assert.deepEqual(
    result.results.map((item) => item.id),
    ['fast-1', 'slow-1']
  );
});

test('searchAcrossSites batches sources with the same batch key while keeping per-source progress', async () => {
  const batchCalls = [];
  const singleCalls = [];
  const progressEvents = [];

  const result = await searchAcrossSites({
    getSearchBatchKey: (site) => site.batchKey || '',
    keyword: '剑来',
    onProgress: (event) => progressEvents.push(event),
    searchSite: async (site) => {
      singleCalls.push(site.id);
      return [{ id: `${site.id}-result`, name: site.name }];
    },
    searchSiteBatch: async (batchSites, keyword) => {
      batchCalls.push({
        keyword,
        siteIds: batchSites.map((site) => site.id),
      });

      return {
        failures: [
          {
            sourceId: 'cat-two',
            sourceName: '二号源',
            message: '内部插件解析错误',
          },
        ],
        results: [
          {
            id: 'cat-one-result',
            name: '剑来',
            sourceId: 'cat-one',
            sourceName: '一号源',
          },
        ],
      };
    },
    sites: [
      { batchKey: 'cat-script', id: 'cat-one', name: '一号源', searchable: true },
      { batchKey: 'cat-script', id: 'cat-two', name: '二号源', searchable: true },
      { id: 'normal', name: '普通源', searchable: true },
    ],
  });

  assert.deepEqual(batchCalls, [
    {
      keyword: '剑来',
      siteIds: ['cat-one', 'cat-two'],
    },
  ]);
  assert.deepEqual(singleCalls, ['normal']);
  assert.deepEqual(
    result.results.map((item) => ({
      id: item.id,
      sourceId: item.sourceId,
      sourceName: item.sourceName,
    })).sort((left, right) => left.id.localeCompare(right.id)),
    [
      { id: 'cat-one-result', sourceId: 'cat-one', sourceName: '一号源' },
      { id: 'normal-result', sourceId: 'normal', sourceName: '普通源' },
    ]
  );
  assert.deepEqual(result.failures, [
    {
      sourceId: 'cat-two',
      sourceName: '二号源',
      message: '内部插件解析错误',
    },
  ]);
  assert.equal(progressEvents.length, 3);
  assert.deepEqual(
    progressEvents.map((event) => event.completedCount),
    [1, 2, 3]
  );
  assert.deepEqual(
    progressEvents
      .map((event) => ({
        sourceId: event.failure?.sourceId || event.results?.[0]?.sourceId || event.site.id,
        type: event.type,
      }))
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    [
      { sourceId: 'cat-one', type: 'results' },
      { sourceId: 'cat-two', type: 'failure' },
      { sourceId: 'normal', type: 'results' },
    ]
  );
});
