const assert = require('node:assert/strict');
const test = require('node:test');

const {
  verifyPluginTarget,
} = require('../src/plugin-adapter');

test('verifies CatVod script capabilities by static inspection only', async () => {
  const result = await verifyPluginTarget(
    {
      kind: 'source',
      url: 'https://cat.example.com/index.js.md5',
    },
    {
      fetchImpl: async (url) => {
        assert.equal(url, 'https://cat.example.com/index.js.md5');
        return textResponse(`
          async function home() { return {}; }
          async function search(wd) { return []; }
          async function detail(id) { return {}; }
          async function play(flag, id) { return { url: id }; }
          export default { home, search, detail, play };
        `);
      },
    }
  );

  assert.equal(result.scriptBytes > 0, true);
  assert.deepEqual(
    {
      ...result,
      scriptBytes: 1,
      scriptText: 'script',
    },
    {
    ok: false,
    targetKind: 'source',
    runtime: 'catvod',
    status: 'sandbox-required',
    title: 'CatVod 脚本静态验证',
    message: '已下载脚本并完成静态能力识别；当前没有执行第三方脚本。',
    scriptUrl: 'https://cat.example.com/index.js.md5',
    scriptBytes: 1,
    scriptText: 'script',
    capabilities: {
      home: 'detected',
      search: 'detected',
      detail: 'detected',
      play: 'detected',
    },
    sandboxPreflight: {
      ok: true,
      status: 'sandbox-preflight-passed',
      title: '沙盒预检通过',
      message: '脚本没有发现明显危险能力，可以进入受限执行器技术验证。',
      blockedTokens: [],
      allowedApis: ['fetch', 'JSON', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder'],
      nextStep: '下一步在隔离执行层中只暴露网络请求和基础字符串/JSON 能力，验证 search/detail/play 是否能返回最终播放地址。',
    },
    nextStep: '下一步需要受限 JS 沙盒验证这些函数能否安全运行，再尝试解析最终播放地址。',
    }
  );
});

test('includes sandbox preflight blockers for unsafe CatVod scripts', async () => {
  const result = await verifyPluginTarget(
    {
      kind: 'source',
      url: 'https://cat.example.com/index.js.md5',
    },
    {
      fetchImpl: async () => textResponse(`
        async function search(wd) { return eval(wd); }
        async function play(flag, id) { return new Function(id)(); }
      `),
    }
  );

  assert.equal(result.status, 'sandbox-required');
  assert.equal(result.sandboxPreflight.ok, false);
  assert.deepEqual(result.sandboxPreflight.blockedTokens, ['eval', 'Function']);
  assert.match(result.sandboxPreflight.message, /eval, Function/);
});

test('verifies TVBox plugin sites as adapter-required without fetching scripts', async () => {
  const result = await verifyPluginTarget({
    kind: 'site',
    site: {
      name: '牛牛',
      type: 3,
      api: 'csp_Niuniu',
      searchable: true,
    },
  });

  assert.deepEqual(result, {
    ok: false,
    targetKind: 'site',
    runtime: 'tvbox-csp',
    status: 'adapter-required',
    title: 'TVBox 插件适配验证',
    message: '牛牛 是 TVBox/CSP 插件站点，需要先实现插件适配器，不能按普通 JSON API 请求。',
    scriptUrl: '',
    scriptBytes: 0,
    capabilities: {
      home: 'unknown',
      search: 'declared',
      detail: 'unknown',
      play: 'unknown',
    },
    nextStep: '需要把该 CSP 插件映射到 search/detail/play 适配器，或使用服务端解析层。',
  });
});

test('reports network failures when CatVod script cannot be downloaded', async () => {
  const result = await verifyPluginTarget(
    {
      kind: 'source',
      url: 'https://cat.example.com/index.js.md5',
    },
    {
      fetchImpl: async () => textResponse('not found', 404),
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 'network-error');
  assert.match(result.message, /HTTP 404/);
});

test('reports md5 hash files as non executable plugin manifests', async () => {
  const result = await verifyPluginTarget(
    {
      kind: 'source',
      url: 'https://cat.example.com/index.js.md5',
    },
    {
      fetchImpl: async () => textResponse('742b32fc4443dad721ae85639c5e4c60'),
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 'script-manifest-only');
  assert.equal(result.scriptBytes, 32);
  assert.equal(result.scriptText, '');
  assert.match(result.message, /MD5/);
});

function textResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}
