const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildTvBoxDetailUrl,
  buildTvBoxSearchUrl,
  classifySourceUrl,
  extractPlayableUrl,
  getPlayableUrlIssue,
  isValidHttpUrl,
  normalizeDetailResponse,
  normalizeSearchResponse,
  parseM3uPlaylist,
  parseTvBoxConfig,
} = require('../src/iptv-core');

test('validates only http and https urls after trimming whitespace', () => {
  assert.equal(isValidHttpUrl(' https://example.com/live.m3u8 '), true);
  assert.equal(isValidHttpUrl('http://example.com/movie.mp4'), true);
  assert.equal(isValidHttpUrl('ftp://example.com/file.ts'), false);
  assert.equal(isValidHttpUrl('not a url'), false);
  assert.equal(isValidHttpUrl(''), false);
});

test('flags m3u channel lists as not directly playable video urls', () => {
  assert.equal(
    getPlayableUrlIssue('https://iptv.example.com/list/Gather.m3u'),
    '这是频道列表地址，不是单个视频流。请在直播列表里导入后选择频道播放。'
  );
  assert.equal(getPlayableUrlIssue('https://media.example.com/live.m3u8'), '');
  assert.equal(getPlayableUrlIssue('https://media.example.com/movie.mp4'), '');
});

test('parses m3u playlists into live channels with metadata', () => {
  const channels = parseM3uPlaylist(`#EXTM3U
#EXTINF:-1 tvg-id="cctv1" tvg-name="CCTV-1" group-title="央视" tvg-logo="https://logo.example.com/cctv1.png",CCTV-1 综合
https://stream.example.com/cctv1.m3u8
#EXTINF:-1 group-title="卫视",湖南卫视
https://stream.example.com/hunan.m3u8
`);

  assert.deepEqual(channels, [
    {
      id: 'channel-1',
      name: 'CCTV-1 综合',
      group: '央视',
      logo: 'https://logo.example.com/cctv1.png',
      url: 'https://stream.example.com/cctv1.m3u8',
    },
    {
      id: 'channel-2',
      name: '湖南卫视',
      group: '卫视',
      logo: '',
      url: 'https://stream.example.com/hunan.m3u8',
    },
  ]);
});

test('resolves relative m3u channel urls against the playlist url', () => {
  const channels = parseM3uPlaylist(
    `#EXTM3U
#EXTINF:-1,Test Channel
streams/test.m3u8
`,
    'https://iptv.example.com/lists/main.m3u'
  );

  assert.equal(channels[0].url, 'https://iptv.example.com/lists/streams/test.m3u8');
});

test('classifies CatVod script urls as unsupported plugin sources', () => {
  const source = classifySourceUrl('http://user:pass@cat.example.com/index.js.md5');

  assert.deepEqual(source, {
    kind: 'plugin',
    reason: '检测到 CatVod/脚本插件源，当前版本不会在 App 内直接执行第三方脚本。',
  });
});

test('classifies the built-in mock source as a config source', () => {
  assert.deepEqual(classifySourceUrl('mock://demo-tvbox'), {
    kind: 'config',
    reason: '',
  });
});

test('parses TVBox config sites and marks searchable plugin sites as unsupported', () => {
  const parsed = parseTvBoxConfig(
    {
      name: '测试配置',
      sites: [
        {
          key: 'demo',
          name: '示例站点',
          type: 1,
          api: 'https://api.example.com/tvbox',
          searchable: 1,
        },
        {
          key: 'cat',
          name: '脚本站点',
          type: 3,
          api: 'csp_Demo',
          searchable: 1,
        },
      ],
    },
    'https://config.example.com/tvbox.json',
    '2026-06-27T09:00:00.000Z'
  );

  assert.equal(parsed.source.name, '测试配置');
  assert.equal(parsed.source.url, 'https://config.example.com/tvbox.json');
  assert.equal(parsed.source.importedAt, '2026-06-27T09:00:00.000Z');
  assert.equal(parsed.sites.length, 2);
  assert.deepEqual(parsed.sites[0], {
    id: 'demo',
    siteKey: 'demo',
    name: '示例站点',
    type: 1,
    api: 'https://api.example.com/tvbox',
    searchable: true,
    unsupportedReason: '',
  });
  assert.equal(parsed.sites[1].unsupportedReason, '插件站点暂不执行第三方脚本');
});

test('deduplicates repeated TVBox site keys into stable render-safe ids', () => {
  const parsed = parseTvBoxConfig(
    {
      sites: [
        {
          key: 'biliych',
          name: '哔哩一',
          type: 3,
          api: 'csp_Bili',
        },
        {
          key: 'biliych',
          name: '哔哩二',
          type: 3,
          api: 'csp_Bili2',
        },
      ],
    },
    'https://config.example.com/tvbox.json',
    '2026-06-27T09:00:00.000Z'
  );

  assert.deepEqual(
    parsed.sites.map((site) => site.id),
    ['biliych', 'biliych-2']
  );
  assert.deepEqual(
    parsed.sites.map((site) => site.siteKey),
    ['biliych', 'biliych']
  );
});

test('builds TVBox search and detail urls without dropping existing query params', () => {
  assert.equal(
    buildTvBoxSearchUrl(
      { api: 'https://api.example.com/tvbox?token=abc' },
      '三体'
    ),
    'https://api.example.com/tvbox?token=abc&ac=videolist&wd=%E4%B8%89%E4%BD%93'
  );

  assert.equal(
    buildTvBoxDetailUrl(
      { api: 'https://api.example.com/tvbox?token=abc' },
      'movie-1'
    ),
    'https://api.example.com/tvbox?token=abc&ac=videolist&ids=movie-1'
  );
});

test('normalizes common TVBox search responses', () => {
  const results = normalizeSearchResponse({
    list: [
      {
        vod_id: 'movie-1',
        vod_name: '三体',
        vod_pic: 'https://img.example.com/1.jpg',
        vod_remarks: '更新至 8',
      },
    ],
  });

  assert.deepEqual(results, [
    {
      id: 'movie-1',
      name: '三体',
      poster: 'https://img.example.com/1.jpg',
      remarks: '更新至 8',
    },
  ]);
});

test('normalizes TVBox detail responses into play groups and episodes', () => {
  const detail = normalizeDetailResponse({
    list: [
      {
        vod_id: 'movie-1',
        vod_name: '三体',
        vod_play_from: '线路一$$$线路二',
        vod_play_url:
          '第1集$https://media.example.com/1.m3u8#第2集$https://media.example.com/2.m3u8$$$备用$play-token',
      },
    ],
  });

  assert.equal(detail.id, 'movie-1');
  assert.equal(detail.name, '三体');
  assert.deepEqual(detail.playGroups, [
    {
      name: '线路一',
      episodes: [
        { name: '第1集', url: 'https://media.example.com/1.m3u8' },
        { name: '第2集', url: 'https://media.example.com/2.m3u8' },
      ],
    },
    {
      name: '线路二',
      episodes: [{ name: '备用', url: 'play-token' }],
    },
  ]);
});

test('extracts a final playable url from direct episodes or play api responses', () => {
  assert.equal(
    extractPlayableUrl({ url: 'https://media.example.com/final.m3u8' }),
    'https://media.example.com/final.m3u8'
  );
  assert.equal(
    extractPlayableUrl({ data: { url: 'https://media.example.com/final.mp4' } }),
    'https://media.example.com/final.mp4'
  );
  assert.equal(extractPlayableUrl({ url: 'not-http' }), '');
});
