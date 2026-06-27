const {
  classifySourceUrl,
  isValidHttpUrl,
  parseM3uPlaylist,
} = require('./iptv-core');

function extractHttpUrls(text) {
  if (typeof text !== 'string') {
    return [];
  }

  const seen = new Set();
  const urls = [];
  const pattern = /https?:\/\/[^\s<>"'，。；；、【】（）()]+/gi;
  let match = pattern.exec(text);

  while (match) {
    const url = trimUrlPunctuation(match[0]);

    if (isValidHttpUrl(url) && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }

    match = pattern.exec(text);
  }

  return urls;
}

async function scanLiveSourceText(text, options = {}) {
  return scanLiveSourceUrls(extractHttpUrls(text), options);
}

async function scanLiveSourceUrls(urls, { fetchImpl = fetch } = {}) {
  const uniqueUrls = Array.from(new Set((urls || []).map((url) => String(url).trim())))
    .filter(isValidHttpUrl);
  const results = [];

  for (const url of uniqueUrls) {
    results.push(await scanLiveSourceUrl(url, fetchImpl));
  }

  return results;
}

async function scanLiveSourceUrl(url, fetchImpl) {
  const classification = classifySourceUrl(url);

  if (classification.kind === 'plugin') {
    return buildResult({
      url,
      kind: 'plugin',
      ok: false,
      status: 'plugin-source',
      message: '这是插件源，当前版本不会执行第三方脚本。',
    });
  }

  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept:
          'application/vnd.apple.mpegurl, audio/mpegurl, application/json;q=0.9, text/plain;q=0.8, */*;q=0.7',
      },
    });

    if (!response.ok) {
      return buildResult({
        url,
        kind: 'unknown',
        ok: false,
        status: 'network-error',
        message: `请求失败：HTTP ${response.status}`,
      });
    }

    if (typeof response.text !== 'function') {
      return buildResult({
        url,
        kind: 'unknown',
        ok: false,
        status: 'network-error',
        message: '接口没有返回可读取文本。',
      });
    }

    const contentType = getHeader(response, 'content-type').toLowerCase();
    const text = await response.text();

    return classifyFetchedSource(url, text, contentType);
  } catch (error) {
    return buildResult({
      url,
      kind: 'unknown',
      ok: false,
      status: 'network-error',
      message: `网络请求失败：${error?.message || '无法连接'}`,
    });
  }
}

function classifyFetchedSource(url, text, contentType) {
  const cleanText = typeof text === 'string' ? text.trim() : '';

  if (looksLikeWebPage(cleanText, contentType)) {
    return buildResult({
      url,
      kind: 'web',
      ok: false,
      status: 'web-page',
      message: '这是网页入口，需要用浏览器打开，不能直接当直播列表导入。',
    });
  }

  if (looksLikeJson(cleanText, contentType)) {
    return buildResult({
      url,
      kind: 'config',
      ok: false,
      status: 'config-source',
      message: '这是 JSON/配置类接口，请到配置接口里导入；不是直播 M3U 列表。',
    });
  }

  const channels = parseM3uPlaylist(cleanText, url);

  if (channels.length) {
    return buildResult({
      url,
      kind: 'm3u',
      ok: true,
      status: 'ready',
      channelCount: channels.length,
      sampleName: channels[0].name,
      message: `可导入直播列表，识别到 ${channels.length} 个频道。`,
    });
  }

  if (cleanText.toUpperCase().startsWith('#EXTM3U')) {
    return buildResult({
      url,
      kind: 'm3u',
      ok: false,
      status: 'empty-playlist',
      message: '这是 M3U 内容，但没有识别到可播放频道。',
    });
  }

  return buildResult({
    url,
    kind: 'unknown',
    ok: false,
    status: 'unknown-format',
    message: '没有识别到直播频道，可能不是 M3U 列表。',
  });
}

function looksLikeWebPage(text, contentType) {
  const lowerText = text.slice(0, 300).toLowerCase();
  return (
    contentType.includes('text/html') ||
    lowerText.includes('<!doctype html') ||
    lowerText.includes('<html')
  );
}

function looksLikeJson(text, contentType) {
  return (
    contentType.includes('application/json') ||
    text.startsWith('{') ||
    text.startsWith('[')
  );
}

function getHeader(response, name) {
  if (typeof response.headers?.get === 'function') {
    return response.headers.get(name) || '';
  }

  return '';
}

function trimUrlPunctuation(value) {
  return String(value).replace(/[)\].,，。；;、]+$/g, '');
}

function buildResult({
  url,
  kind,
  ok,
  status,
  message,
  channelCount = 0,
  sampleName = '',
}) {
  return {
    url,
    kind,
    ok,
    status,
    message,
    channelCount,
    sampleName,
  };
}

module.exports = {
  extractHttpUrls,
  scanLiveSourceText,
  scanLiveSourceUrls,
};
