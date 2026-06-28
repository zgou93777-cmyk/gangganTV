const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');

test('App shell does not expose live source workflows while focused on VOD', () => {
  [
    'scanLiveSourceText',
    'LiveSourceScanResultPanel',
    'renderLivePanel',
    'renderLiveChannelList',
    '直播源',
    '直播列表',
    '最近直播频道',
  ].forEach((needle) => {
    assert.equal(
      appSource.includes(needle),
      false,
      `App.js should not expose ${needle}`
    );
  });
});

test('App settings copy emphasizes CatVod VOD and local parser workflow', () => {
  assert.equal(appSource.includes('插件解析服务'), false);
  assert.equal(appSource.includes('本地 TVBox runtime'), false);
  assert.equal(appSource.includes('CatVod 点播'), true);
  assert.equal(appSource.includes('本地解析器'), true);
});
