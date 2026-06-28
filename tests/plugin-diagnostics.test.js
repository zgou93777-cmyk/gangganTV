const assert = require('node:assert/strict');
const test = require('node:test');

const {
  diagnosePluginSource,
  diagnosePluginSite,
} = require('../src/plugin-diagnostics');

test('diagnoses CatVod script urls without executing third-party code', () => {
  const diagnostic = diagnosePluginSource(
    'https://9280.kstore.vip/cat/index.js.md5'
  );

  assert.deepEqual(diagnostic, {
    kind: 'catvod-script',
    runtime: 'catvod',
    executable: false,
    safety: 'blocked',
    compatibility: 'requires-sandbox',
    title: 'CatVod 插件脚本',
    summary: '已识别为 CatVod/魔力云播脚本源，当前不会在 App 内直接执行。',
    nextStep: '需要先做受限 JS 沙盒或服务端解析层，再把最终 m3u8/mp4 交给播放器。',
    capabilities: {
      home: 'unknown',
      search: 'unknown',
      detail: 'unknown',
      play: 'unknown',
    },
  });
});

test('diagnoses malformed copied plugin urls as repair-needed input', () => {
  const diagnostic = diagnosePluginSource('http://wexfnw:wexfnwindex.js.md5');

  assert.equal(diagnostic.kind, 'malformed-plugin-url');
  assert.equal(diagnostic.compatibility, 'repair-needed');
  assert.match(diagnostic.summary, /缺少域名或 @ 符号/);
  assert.equal(diagnostic.executable, false);
});

test('diagnoses TVBox plugin sites from csp api names', () => {
  const diagnostic = diagnosePluginSite({
    name: '牛牛',
    type: 3,
    api: 'csp_Niuniu',
    searchable: true,
  });

  assert.deepEqual(diagnostic, {
    kind: 'tvbox-plugin-site',
    runtime: 'tvbox-csp',
    executable: false,
    safety: 'blocked',
    compatibility: 'requires-adapter',
    title: 'TVBox 插件站点',
    summary: '牛牛 是 TVBox/CSP 插件站点，不能按普通 JSON API 搜索播放。',
    nextStep: '需要插件适配器解析 search/detail/play，或交给服务端解析后返回最终播放地址。',
    capabilities: {
      home: 'unknown',
      search: 'declared',
      detail: 'unknown',
      play: 'unknown',
    },
  });
});
