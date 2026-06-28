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

test('buildSearchBuckets creates source buckets from CatVod result metadata', () => {
  const buckets = buildSearchBuckets({
    results: [
      { id: '1', sourceId: 'wen-cai', sourceName: '文才秒播' },
      { id: '2', sourceId: 'wen-cai', sourceName: '文才秒播' },
      { id: '3', sourceId: 'hu-ban', sourceName: '虎斑 4K' },
    ],
  });

  assert.deepEqual(
    buckets.map((bucket) => ({
      count: bucket.count,
      id: bucket.id,
      label: bucket.label,
    })),
    [
      { count: 3, id: 'all', label: '全部' },
      { count: 2, id: 'wen-cai', label: '文才秒播' },
      { count: 1, id: 'hu-ban', label: '虎斑 4K' },
    ]
  );
});
