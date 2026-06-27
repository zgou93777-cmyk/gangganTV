const assert = require('node:assert/strict');
const test = require('node:test');

const { testTvBoxSite } = require('../src/site-tester');

test('passes when search returns a result with playable groups', async () => {
  const calls = [];
  const result = await testTvBoxSite(
    {
      name: 'Demo Site',
      api: 'https://api.example.com/tvbox',
      searchable: true,
      unsupportedReason: '',
    },
    {
      keyword: 'test',
      fetchImpl: async (url) => {
        calls.push(url);

        if (url.includes('wd=test')) {
          return jsonResponse({
            list: [{ vod_id: 'movie-1', vod_name: 'Movie One' }],
          });
        }

        return jsonResponse({
          list: [
            {
              vod_id: 'movie-1',
              vod_name: 'Movie One',
              vod_play_from: 'Line A',
              vod_play_url: 'Episode 1$https://media.example.com/1.m3u8',
            },
          ],
        });
      },
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 'passed');
  assert.equal(result.keyword, 'test');
  assert.equal(result.resultName, 'Movie One');
  assert.equal(result.playGroupCount, 1);
  assert.equal(result.episodeCount, 1);
  assert.equal(calls.length, 2);
});

test('fails clearly when search returns no results', async () => {
  const result = await testTvBoxSite(
    {
      name: 'Empty Site',
      api: 'https://api.example.com/tvbox',
      searchable: true,
      unsupportedReason: '',
    },
    {
      keyword: 'missing',
      fetchImpl: async () => jsonResponse({ list: [] }),
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 'no-results');
  assert.equal(result.message, '测试搜索没有返回结果');
});

test('fails clearly when detail has no playable groups', async () => {
  const result = await testTvBoxSite(
    {
      name: 'No Play Site',
      api: 'https://api.example.com/tvbox',
      searchable: true,
      unsupportedReason: '',
    },
    {
      keyword: 'test',
      fetchImpl: async (url) => {
        if (url.includes('wd=test')) {
          return jsonResponse({
            list: [{ vod_id: 'movie-1', vod_name: 'Movie One' }],
          });
        }

        return jsonResponse({
          list: [{ vod_id: 'movie-1', vod_name: 'Movie One' }],
        });
      },
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 'no-play-items');
  assert.equal(result.message, '详情里没有可播放线路或剧集');
});

test('returns unsupported status for plugin sites', async () => {
  const result = await testTvBoxSite(
    {
      name: 'Plugin Site',
      unsupportedReason: '插件站点暂不执行第三方脚本',
    },
    {
      fetchImpl: async () => {
        throw new Error('should not fetch');
      },
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.message, '插件站点暂不执行第三方脚本');
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}
