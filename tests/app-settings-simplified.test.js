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
    '连接状态',
    '隐私说明',
  ].forEach((copy) => {
    assert.equal(settingsSource.includes(copy), true, `settings should include ${copy}`);
  });
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
