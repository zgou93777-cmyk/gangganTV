const assert = require('node:assert/strict');
const test = require('node:test');

const {
  preflightPluginSandbox,
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
    message: '脚本包含不允许在本机执行的能力：Function, require, localStorage, globalThis。',
    blockedTokens: ['Function', 'require', 'localStorage', 'globalThis'],
    allowedApis: ['fetch', 'JSON', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder'],
    nextStep: '该插件源暂时不能本地执行；后续可改走服务端解析层或等待专用适配器。',
  });
});
