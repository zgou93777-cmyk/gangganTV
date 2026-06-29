const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildDetailLoadingMessage,
  buildEpisodeLoadingMessage,
  buildPlaybackFailureMessage,
  buildSearchLoadingMessage,
  hasMojibakeText,
} = require('../src/vod-ux');

test('buildSearchLoadingMessage explains that real CatVod searches can be slow', () => {
  assert.equal(
    buildSearchLoadingMessage({ targetCount: 3 }),
    '正在搜索 3 个真实来源，可能需要 30-60 秒，请稍等'
  );
  assert.equal(
    buildSearchLoadingMessage({ targetCount: 0 }),
    '正在搜索真实来源，可能需要 30-60 秒，请稍等'
  );
});

test('detail and episode loading messages include the current item when available', () => {
  assert.equal(
    buildDetailLoadingMessage('痴迷TC'),
    '正在读取「痴迷TC」详情和播放列表'
  );
  assert.equal(
    buildEpisodeLoadingMessage('TC'),
    '正在解析「TC」播放地址'
  );
});

test('buildPlaybackFailureMessage guides users to switch route or source', () => {
  assert.equal(
    buildPlaybackFailureMessage('解析超时'),
    '解析超时。可以换一条播放线路，或返回搜索页换一个来源再试。'
  );
  assert.equal(
    buildPlaybackFailureMessage(),
    '播放失败。可以换一条播放线路，或返回搜索页换一个来源再试。'
  );
});

test('hasMojibakeText detects common broken Chinese encoding markers', () => {
  assert.equal(hasMojibakeText('发现 / 设置 / 正在搜索'), false);
  assert.equal(hasMojibakeText('鍙戠幇'), true);
  assert.equal(hasMojibakeText('璁剧疆'), true);
});
