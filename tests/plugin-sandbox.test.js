const assert = require('node:assert/strict');
const test = require('node:test');

const {
  preflightPluginSandbox,
  summarizeSandboxCompatibility,
} = require('../src/plugin-sandbox');

test('preflight allows CatVod scripts that only define adapter functions', () => {
  const result = preflightPluginSandbox(`
    async function home() { return { class: [] }; }
    async function search(wd) { return { list: [] }; }
    async function detail(id) { return { list: [] }; }
    async function play(flag, id) { return { parse: 0, url: id }; }
  `);

  assert.deepEqual(result, {
    ok: true,
    status: 'sandbox-preflight-passed',
    title: '沙盒预检通过',
    message: '脚本没有发现明显危险能力，可以进入受限执行器技术验证。',
    blockedTokens: [],
    compatibility: {
      status: 'ready',
      runnable: true,
      shimTokens: [],
      blockedTokens: [],
      message: '脚本可以进入受限执行器技术验证。',
    },
    allowedApis: ['fetch', 'JSON', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder'],
    nextStep: '下一步在隔离执行层中只暴露网络请求和基础字符串/JSON 能力，验证 search/detail/play 是否能返回最终播放地址。',
  });
});

test('preflight blocks scripts that request unsafe runtime capabilities', () => {
  const result = preflightPluginSandbox(`
    const fs = require('fs');
    const run = new Function('return globalThis')();
    localStorage.setItem('x', 'y');
  `);

  assert.deepEqual(result, {
    ok: false,
    status: 'sandbox-preflight-blocked',
    title: '沙盒预检阻断',
    message: '脚本需要兼容层：localStorage；仍阻断：Function, require。',
    blockedTokens: ['Function', 'require', 'localStorage'],
    compatibility: {
      status: 'shim-required',
      runnable: false,
      shimTokens: ['localStorage'],
      blockedTokens: ['Function', 'require'],
      message: '脚本需要兼容层：localStorage；仍阻断：Function, require。',
    },
    allowedApis: ['fetch', 'JSON', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder'],
    nextStep: '该插件源暂时不能本地执行；后续可改走服务端解析层或等待专用适配器。',
  });
});

test('preflight allows WebView global object references', () => {
  const result = preflightPluginSandbox(`
    const root = globalThis || window;
    document.title = 'plugin sandbox';
    async function search(wd) { return { list: [] }; }
  `);

  assert.equal(result.ok, true);
  assert.deepEqual(result.blockedTokens, []);
});

test('summarizes WebView shim requirements for bundled CatVod scripts', () => {
  const summary = summarizeSandboxCompatibility([
    'Function',
    'require',
    'WebSocket',
    'localStorage',
    'process',
  ]);

  assert.deepEqual(summary, {
    status: 'shim-required',
    runnable: false,
    shimTokens: ['localStorage', 'process'],
    blockedTokens: ['Function', 'require', 'WebSocket'],
    message: '脚本需要兼容层：localStorage, process；仍阻断：Function, require, WebSocket。',
  });
});
