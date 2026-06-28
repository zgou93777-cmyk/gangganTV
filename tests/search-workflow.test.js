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
