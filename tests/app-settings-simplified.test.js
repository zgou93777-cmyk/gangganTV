const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');

function renderSettingsSource() {
  const start = appSource.indexOf('function renderSettings()');
  const end = appSource.indexOf('function renderActiveTab()', start);

  assert.notEqual(start, -1, 'renderSettings should exist');
  assert.notEqual(end, -1, 'renderActiveTab should follow renderSettings');

  return appSource.slice(start, end);
}

test('settings screen is a single-source user configuration page', () => {
  const settingsSource = renderSettingsSource();

  [
    '当前点播源',
    '源地址',
    '本地解析器',
    '本机解析器地址',
    'Token（可选）',
    '使用本机解析器地址',
    '保存解析器',
    '检测解析器',
    '连接状态',
    '隐私说明',
  ].forEach((copy) => {
    assert.equal(settingsSource.includes(copy), true, `settings should include ${copy}`);
  });

  assert.equal(settingsSource.includes('远端解析器'), false);
  assert.equal(settingsSource.includes('使用推荐解析服务'), false);
});

test('local parser setup does not require a token before saving or checking', () => {
  assert.equal(appSource.includes("setMessage('请填写远端解析器 Token"), false);
  assert.equal(appSource.includes("setMessage('请先填写远端解析器 Token"), false);
  assert.equal(appSource.includes('tokenRequired: true'), false);
  assert.equal(appSource.includes('Token（可选）'), true);
});

test('settings exposes local cache cleanup for parser data', () => {
  const settingsSource = renderSettingsSource();

  assert.equal(settingsSource.includes('本地缓存'), true);
  assert.equal(settingsSource.includes('清理本地缓存'), true);
  assert.equal(settingsSource.includes('clearLocalParserCache'), true);
});

test('settings screen hides developer batch diagnostics and plugin verification', () => {
  const settingsSource = renderSettingsSource();

  [
    '测试当前站点',
    '验证插件适配',
    '一键测试可搜索站点',
    '检测配置接口',
    '测试关键词',
    '批量测试',
    '配置检测：',
    '插件/不兼容',
  ].forEach((copy) => {
    assert.equal(settingsSource.includes(copy), false, `settings should not include ${copy}`);
  });
});
