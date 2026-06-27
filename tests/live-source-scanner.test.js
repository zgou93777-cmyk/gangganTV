const assert = require('node:assert/strict');
const test = require('node:test');

const {
  extractHttpUrls,
  scanLiveSourceUrls,
} = require('../src/live-source-scanner');

test('extractHttpUrls pulls unique links from pasted source notes', () => {
  const urls = extractHttpUrls(`APTV：https://bit.ly/iptv-aptv
YanG: https://iptv.yang-1989.eu.org/m3u/Gather.m3u
网页：https://taoiptv.com/
重复: https://bit.ly/iptv-aptv
插件：http://user:pass@cat.example.com/index.js.md5`);

  assert.deepEqual(urls, [
    'https://bit.ly/iptv-aptv',
    'https://iptv.yang-1989.eu.org/m3u/Gather.m3u',
    'https://taoiptv.com/',
    'http://user:pass@cat.example.com/index.js.md5',
  ]);
});

test('scanLiveSourceUrls classifies m3u playlists, web pages, configs, plugins, and failures', async () => {
  const results = await scanLiveSourceUrls(
    [
      'https://live.example.com/list',
      'https://web.example.com/',
      'https://config.example.com/tvbox.json',
      'http://user:pass@cat.example.com/index.js.md5',
      'https://down.example.com/list.m3u',
    ],
    {
      fetchImpl: async (url) => {
        if (url.includes('live.example.com')) {
          return textResponse(`#EXTM3U
#EXTINF:-1 group-title="Test",Live One
https://media.example.com/live-one.m3u8
`);
        }

        if (url.includes('web.example.com')) {
          return textResponse('<!doctype html><html><title>IPTV</title></html>', 200, {
            'content-type': 'text/html; charset=utf-8',
          });
        }

        if (url.includes('config.example.com')) {
          return textResponse('{"sites":[]}', 200, {
            'content-type': 'application/json',
          });
        }

        if (url.includes('down.example.com')) {
          return textResponse('', 503);
        }

        throw new Error('unexpected url');
      },
    }
  );

  assert.deepEqual(
    results.map((result) => ({
      url: result.url,
      kind: result.kind,
      ok: result.ok,
      channelCount: result.channelCount,
      status: result.status,
    })),
    [
      {
        url: 'https://live.example.com/list',
        kind: 'm3u',
        ok: true,
        channelCount: 1,
        status: 'ready',
      },
      {
        url: 'https://web.example.com/',
        kind: 'web',
        ok: false,
        channelCount: 0,
        status: 'web-page',
      },
      {
        url: 'https://config.example.com/tvbox.json',
        kind: 'config',
        ok: false,
        channelCount: 0,
        status: 'config-source',
      },
      {
        url: 'http://user:pass@cat.example.com/index.js.md5',
        kind: 'plugin',
        ok: false,
        channelCount: 0,
        status: 'plugin-source',
      },
      {
        url: 'https://down.example.com/list.m3u',
        kind: 'unknown',
        ok: false,
        channelCount: 0,
        status: 'network-error',
      },
    ]
  );
  assert.equal(results[0].sampleName, 'Live One');
  assert.match(results[1].message, /网页/);
  assert.match(results[2].message, /配置/);
  assert.match(results[3].message, /插件/);
  assert.match(results[4].message, /HTTP 503/);
});

function textResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[name.toLowerCase()] || '';
      },
    },
    text: async () => body,
  };
}
