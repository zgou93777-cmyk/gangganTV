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
