const assert = require('node:assert/strict');
const test = require('node:test');

const {
  fetchTvBoxConfig,
  fetchTvBoxDetail,
  fetchTvBoxSearch,
  fetchM3uPlaylist,
  isBuiltInMockConfigUrl,
  isBuiltInMockLivePlaylistUrl,
  resolveTvBoxEpisode,
} = require('../src/iptv-api');

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test('fetchTvBoxConfig loads and parses TVBox configs with injected fetch', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return jsonResponse({
      name: '远程配置',
      sites: [
        {
          key: 'demo',
          name: '示例站',
          type: 1,
          api: 'https://api.example.com/tvbox',
          searchable: 1,
        },
      ],
    });
  };

  const parsed = await fetchTvBoxConfig(
    'https://config.example.com/tvbox.json',
    fetchImpl,
    () => '2026-06-27T10:00:00.000Z'
  );

  assert.deepEqual(calls, ['https://config.example.com/tvbox.json']);
  assert.equal(parsed.source.name, '远程配置');
  assert.equal(parsed.sites[0].name, '示例站');
});

test('fetchTvBoxConfig rejects non-http URLs before calling fetch', async () => {
  let called = false;

  await assert.rejects(
    () => fetchTvBoxConfig('file:///tmp/config.json', async () => {
      called = true;
      return jsonResponse({});
    }),
    /配置地址需要以 http:\/\/ 或 https:\/\//
  );

  assert.equal(called, false);
});

test('fetchTvBoxSearch returns normalized search results', async () => {
  const site = {
    api: 'https://api.example.com/tvbox',
    searchable: true,
    unsupportedReason: '',
  };

  const results = await fetchTvBoxSearch(site, '三体', async (url) => {
    assert.equal(
      url,
      'https://api.example.com/tvbox?ac=videolist&wd=%E4%B8%89%E4%BD%93'
    );
    return jsonResponse({
      list: [{ vod_id: 'movie-1', vod_name: '三体' }],
    });
  });

  assert.deepEqual(results, [
    { id: 'movie-1', name: '三体', poster: '', remarks: '' },
  ]);
});

test('fetchTvBoxSearch rejects unsupported plugin sites with a clear message', async () => {
  await assert.rejects(
    () =>
      fetchTvBoxSearch(
        { unsupportedReason: '插件站点暂不执行第三方脚本' },
        '三体',
        async () => jsonResponse({})
      ),
    /插件站点暂不执行第三方脚本/
  );
});

test('fetchTvBoxDetail returns normalized play groups', async () => {
  const detail = await fetchTvBoxDetail(
    { api: 'https://api.example.com/tvbox' },
    'movie-1',
    async () =>
      jsonResponse({
        list: [
          {
            vod_id: 'movie-1',
            vod_name: '三体',
            vod_play_from: '线路一',
            vod_play_url: '第1集$https://media.example.com/1.m3u8',
          },
        ],
      })
  );

  assert.equal(detail.playGroups[0].episodes[0].url, 'https://media.example.com/1.m3u8');
});

test('resolveTvBoxEpisode returns direct urls without an extra network request', async () => {
  let called = false;

  const resolved = await resolveTvBoxEpisode(
    { api: 'https://api.example.com/tvbox' },
    { name: '第1集', url: 'https://media.example.com/1.m3u8' },
    async () => {
      called = true;
      return jsonResponse({});
    }
  );

  assert.equal(resolved, 'https://media.example.com/1.m3u8');
  assert.equal(called, false);
});

test('resolveTvBoxEpisode can resolve token episodes through the site api', async () => {
  const resolved = await resolveTvBoxEpisode(
    { api: 'https://api.example.com/tvbox' },
    { name: '备用', url: 'play-token' },
    async (url) => {
      assert.equal(url, 'https://api.example.com/tvbox?play=play-token');
      return jsonResponse({ url: 'https://media.example.com/final.mp4' });
    }
  );

  assert.equal(resolved, 'https://media.example.com/final.mp4');
});

test('network helpers include HTTP status in failures', async () => {
  await assert.rejects(
    () =>
      fetchTvBoxSearch(
        { api: 'https://api.example.com/tvbox', searchable: true },
        '三体',
        async () => jsonResponse({ message: 'nope' }, 500)
      ),
    /请求失败：HTTP 500/
  );
});

test('fetchM3uPlaylist loads text playlists and returns parsed channels', async () => {
  const calls = [];
  const channels = await fetchM3uPlaylist(
    'https://iptv.example.com/live/list.m3u',
    async (url, options) => {
      calls.push({ url, accept: options.headers.Accept });
      return {
        ok: true,
        status: 200,
        text: async () => `#EXTM3U
#EXTINF:-1 group-title="测试",测试频道
test.m3u8
`,
      };
    }
  );

  assert.deepEqual(calls, [
    {
      url: 'https://iptv.example.com/live/list.m3u',
      accept: 'application/vnd.apple.mpegurl, audio/mpegurl, text/plain;q=0.9, */*;q=0.8',
    },
  ]);
  assert.deepEqual(channels, [
    {
      id: 'channel-1',
      name: '测试频道',
      group: '测试',
      logo: '',
      url: 'https://iptv.example.com/live/test.m3u8',
    },
  ]);
});

test('fetchM3uPlaylist rejects empty playlists with a clear message', async () => {
  await assert.rejects(
    () =>
      fetchM3uPlaylist('https://iptv.example.com/empty.m3u', async () => ({
        ok: true,
        status: 200,
        text: async () => '#EXTM3U\n',
      })),
    /直播列表里没有可播放频道/
  );
});

test('built-in mock live playlist returns one playable channel without network', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return jsonResponse({});
  };

  assert.equal(isBuiltInMockLivePlaylistUrl('mock://demo-live-m3u'), true);

  const channels = await fetchM3uPlaylist('mock://demo-live-m3u', fetchImpl);

  assert.deepEqual(channels, [
    {
      id: 'channel-1',
      name: 'Apple HLS Test Channel',
      group: 'Test',
      logo: '',
      url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8',
    },
  ]);
  assert.equal(called, false);
});

test('built-in mock source supports config, search, detail, and direct HLS playback', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return jsonResponse({});
  };

  assert.equal(isBuiltInMockConfigUrl('mock://demo-tvbox'), true);

  const parsed = await fetchTvBoxConfig('mock://demo-tvbox', fetchImpl);
  assert.equal(called, false);
  assert.equal(parsed.source.id, 'mock://demo-tvbox');
  assert.equal(parsed.sites.length, 1);
  assert.equal(parsed.sites[0].id, 'demo-public');
  assert.equal(parsed.sites[0].searchable, true);

  const results = await fetchTvBoxSearch(parsed.sites[0], 'test', fetchImpl);
  assert.deepEqual(results, [
    {
      id: 'public-sintel',
      name: 'Sintel Test Video',
      poster: '',
      remarks: 'Public sample',
    },
  ]);

  const detail = await fetchTvBoxDetail(parsed.sites[0], 'public-sintel', fetchImpl);
  assert.equal(detail.name, 'Sintel Test Video');
  assert.equal(detail.playGroups[0].episodes[0].name, 'Apple HLS');

  const playable = await resolveTvBoxEpisode(
    parsed.sites[0],
    detail.playGroups[0].episodes[0],
    fetchImpl
  );
  assert.equal(
    playable,
    'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8'
  );
  assert.equal(called, false);
});
