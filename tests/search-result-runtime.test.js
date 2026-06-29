const assert = require('node:assert/strict');
const test = require('node:test');

const {
  resolveResultRuntimeSite,
} = require('../src/search-result-runtime');

test('resolveResultRuntimeSite uses parent runtime site for CatVod child results', () => {
  const sites = [
    {
      id: 'catvod-server-runtime',
      name: 'cat.999888987.xyz',
      runtime: 'catvod-server',
    },
  ];
  const result = {
    id: 'movie-1',
    runtimeSiteId: 'catvod-server-runtime',
    sourceId: 'nodejs_guazi',
    sourceName: '🌺瓜子|秒播🌺',
  };

  assert.deepEqual(resolveResultRuntimeSite({ result, selectedSite: null, sites }), sites[0]);
});

test('resolveResultRuntimeSite falls back to result source id and then selected site', () => {
  const sites = [{ id: 'normal-api', name: '普通接口' }];
  const selectedSite = { id: 'selected', name: '当前源' };

  assert.deepEqual(
    resolveResultRuntimeSite({
      result: { id: 'movie-1', sourceId: 'normal-api' },
      selectedSite,
      sites,
    }),
    sites[0]
  );
  assert.deepEqual(
    resolveResultRuntimeSite({
      result: { id: 'movie-2', sourceId: 'missing' },
      selectedSite,
      sites,
    }),
    selectedSite
  );
});
