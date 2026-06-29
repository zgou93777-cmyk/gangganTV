const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildSourceStatus,
  deleteConfigSource,
  renameConfigSource,
  selectDefaultSource,
} = require('../src/source-management');

test('renameConfigSource updates a source and its runtime site display names', () => {
  const result = renameConfigSource({
    name: '瓜子秒播',
    sourceId: 'cat-source',
    sources: [
      {
        id: 'cat-source',
        kind: 'plugin',
        name: 'cat.999888987.xyz',
        url: 'https://example.com/index.js.md5',
      },
    ],
    sites: [
      {
        id: 'catvod-server-runtime',
        name: 'cat.999888987.xyz 服务端插件',
        runtime: 'catvod-server',
        sourceId: 'cat-source',
        sourceName: 'cat.999888987.xyz',
      },
      {
        id: 'normal-api',
        name: '普通站点',
        sourceId: 'other-source',
        sourceName: '其他配置',
      },
    ],
  });

  assert.equal(result.sources[0].name, '瓜子秒播');
  assert.equal(result.sites[0].name, '瓜子秒播 服务端插件');
  assert.equal(result.sites[0].sourceName, '瓜子秒播');
  assert.equal(result.sites[1].name, '普通站点');
});

test('deleteConfigSource removes related sites and selects the next usable site', () => {
  const result = deleteConfigSource({
    configUrl: 'https://example.com/cat.js.md5',
    selectedSearchSourceIds: ['catvod-server-runtime', 'normal-api'],
    selectedSiteId: 'catvod-server-runtime',
    sourceId: 'cat-source',
    sources: [
      {
        id: 'cat-source',
        kind: 'plugin',
        name: 'CatVod',
        url: 'https://example.com/cat.js.md5',
      },
      {
        id: 'normal-source',
        kind: 'config',
        name: '普通配置',
        url: 'https://example.com/tvbox.json',
      },
    ],
    sites: [
      {
        id: 'catvod-server-runtime',
        name: 'CatVod 服务端插件',
        searchable: true,
        sourceId: 'cat-source',
      },
      {
        id: 'normal-api',
        name: '普通站点',
        searchable: true,
        sourceId: 'normal-source',
      },
    ],
  });

  assert.deepEqual(
    result.sources.map((source) => source.id),
    ['normal-source']
  );
  assert.deepEqual(
    result.sites.map((site) => site.id),
    ['normal-api']
  );
  assert.equal(result.selectedSiteId, 'normal-api');
  assert.deepEqual(result.selectedSearchSourceIds, ['normal-api']);
  assert.equal(result.configUrl, '');
});

test('selectDefaultSource returns the first usable site for a source', () => {
  const selectedSiteId = selectDefaultSource({
    sourceId: 'source-a',
    sites: [
      {
        id: 'blocked',
        searchable: true,
        sourceId: 'source-a',
        unsupportedReason: '暂不兼容',
      },
      {
        id: 'usable',
        searchable: true,
        sourceId: 'source-a',
      },
    ],
  });

  assert.equal(selectedSiteId, 'usable');
});

test('buildSourceStatus summarizes source availability for the settings UI', () => {
  assert.deepEqual(
    buildSourceStatus({
      selectedSiteId: 'catvod-server-runtime',
      source: {
        id: 'cat-source',
        kind: 'plugin',
        name: 'CatVod',
      },
      sites: [
        {
          id: 'catvod-server-runtime',
          runtime: 'catvod-server',
          searchable: true,
          sourceId: 'cat-source',
        },
      ],
    }),
    {
      isDefault: true,
      label: '可搜索',
      searchableCount: 1,
      siteCount: 1,
      tone: 'ready',
    }
  );

  assert.equal(
    buildSourceStatus({
      source: {
        id: 'jar-source',
        kind: 'config',
      },
      sites: [
        {
          id: 'jar',
          runtime: 'tvbox-jar-spider',
          searchable: true,
          sourceId: 'jar-source',
        },
      ],
    }).label,
    '待适配'
  );
});
