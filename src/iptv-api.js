const {
  buildTvBoxDetailUrl,
  buildTvBoxSearchUrl,
  extractPlayableUrl,
  isValidHttpUrl,
  normalizeDetailResponse,
  normalizeSearchResponse,
  parseM3uPlaylist,
  parseTvBoxConfig,
} = require('./iptv-core');

const BUILT_IN_MOCK_CONFIG_URL = 'mock://demo-tvbox';
const BUILT_IN_MOCK_LIVE_PLAYLIST_URL = 'mock://demo-live-m3u';
const BUILT_IN_MOCK_SITE_API = 'mock://demo-tvbox/api';
const BUILT_IN_MOCK_VIDEO_URL =
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8';
const BUILT_IN_MOCK_LIVE_PLAYLIST = `#EXTM3U
#EXTINF:-1 group-title="Test",Apple HLS Test Channel
${BUILT_IN_MOCK_VIDEO_URL}
`;

const BUILT_IN_MOCK_CONFIG = {
  name: 'Built-in Test Source',
  sites: [
    {
      key: 'demo-public',
      name: 'Public Test Site',
      type: 1,
      api: BUILT_IN_MOCK_SITE_API,
      searchable: 1,
    },
  ],
};

const BUILT_IN_MOCK_SEARCH_RESPONSE = {
  list: [
    {
      vod_id: 'public-sintel',
      vod_name: 'Sintel Test Video',
      vod_pic: '',
      vod_remarks: 'Public sample',
    },
  ],
};

const BUILT_IN_MOCK_DETAIL_RESPONSE = {
  list: [
    {
      vod_id: 'public-sintel',
      vod_name: 'Sintel Test Video',
      vod_pic: '',
      vod_remarks: 'Public sample',
      vod_play_from: 'Public HLS',
      vod_play_url: `Apple HLS$${BUILT_IN_MOCK_VIDEO_URL}`,
    },
  ],
};

async function fetchTvBoxConfig(
  url,
  fetchImpl = fetch,
  now = () => new Date().toISOString()
) {
  const cleanUrl = typeof url === 'string' ? url.trim() : '';

  if (isBuiltInMockConfigUrl(cleanUrl)) {
    return parseTvBoxConfig(BUILT_IN_MOCK_CONFIG, cleanUrl, now());
  }

  if (!isValidHttpUrl(cleanUrl)) {
    throw new Error('配置地址需要以 http:// 或 https:// 开头');
  }

  const json = await fetchJson(cleanUrl, fetchImpl);
  return parseTvBoxConfig(json, cleanUrl, now());
}

async function fetchM3uPlaylist(url, fetchImpl = fetch) {
  const cleanUrl = typeof url === 'string' ? url.trim() : '';

  if (isBuiltInMockLivePlaylistUrl(cleanUrl)) {
    return parseM3uPlaylist(BUILT_IN_MOCK_LIVE_PLAYLIST, cleanUrl);
  }

  if (!isValidHttpUrl(cleanUrl)) {
    throw new Error('直播列表地址需要以 http:// 或 https:// 开头');
  }

  const text = await fetchText(cleanUrl, fetchImpl);
  const channels = parseM3uPlaylist(text, cleanUrl);

  if (!channels.length) {
    throw new Error('直播列表里没有可播放频道');
  }

  return channels;
}

async function fetchTvBoxSearch(site, keyword, fetchImpl = fetch) {
  ensureSearchableSite(site);

  const cleanKeyword = typeof keyword === 'string' ? keyword.trim() : '';

  if (!cleanKeyword) {
    throw new Error('请输入搜索关键词');
  }

  if (isBuiltInMockSite(site)) {
    return normalizeSearchResponse(BUILT_IN_MOCK_SEARCH_RESPONSE);
  }

  const json = await fetchJson(buildTvBoxSearchUrl(site, cleanKeyword), fetchImpl);
  return normalizeSearchResponse(json);
}

async function fetchTvBoxDetail(site, id, fetchImpl = fetch) {
  if (site?.unsupportedReason) {
    throw new Error(site.unsupportedReason);
  }

  const cleanId = typeof id === 'string' ? id.trim() : '';

  if (!cleanId) {
    throw new Error('缺少影片 ID');
  }

  if (isBuiltInMockSite(site)) {
    if (cleanId !== 'public-sintel') {
      throw new Error('测试源没有找到这个影片');
    }

    return normalizeDetailResponse(BUILT_IN_MOCK_DETAIL_RESPONSE);
  }

  const json = await fetchJson(buildTvBoxDetailUrl(site, cleanId), fetchImpl);
  return normalizeDetailResponse(json);
}

async function resolveTvBoxEpisode(site, episode, fetchImpl = fetch) {
  const episodeUrl = typeof episode?.url === 'string' ? episode.url.trim() : '';

  if (isValidHttpUrl(episodeUrl)) {
    return episodeUrl;
  }

  if (!episodeUrl) {
    throw new Error('播放项没有可用地址');
  }

  if (site?.unsupportedReason) {
    throw new Error(site.unsupportedReason);
  }

  const parsedUrl = new URL(site.api);
  parsedUrl.searchParams.set('play', episodeUrl);
  const json = await fetchJson(parsedUrl.toString(), fetchImpl);
  const playableUrl = extractPlayableUrl(json);

  if (!playableUrl) {
    throw new Error('没有解析到可播放地址');
  }

  return playableUrl;
}

async function fetchJson(url, fetchImpl) {
  let response;

  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        'User-Agent': 'okhttp/4.10.0',
      },
    });
  } catch (error) {
    throw new Error(`网络请求失败：${error?.message || '无法连接'}`);
  }

  if (!response.ok) {
    throw new Error(`请求失败：HTTP ${response.status}`);
  }

  try {
    if (typeof response.text === 'function') {
      return JSON.parse(await response.text());
    }

    return await response.json();
  } catch {
    throw new Error('接口没有返回有效 JSON');
  }
}

async function fetchText(url, fetchImpl) {
  let response;

  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: 'application/vnd.apple.mpegurl, audio/mpegurl, text/plain;q=0.9, */*;q=0.8',
        'User-Agent': 'okhttp/4.10.0',
      },
    });
  } catch (error) {
    throw new Error(`网络请求失败：${error?.message || '无法连接'}`);
  }

  if (!response.ok) {
    throw new Error(`请求失败：HTTP ${response.status}`);
  }

  if (typeof response.text !== 'function') {
    throw new Error('接口没有返回文本内容');
  }

  return response.text();
}

function ensureSearchableSite(site) {
  if (site?.unsupportedReason) {
    throw new Error(site.unsupportedReason);
  }

  if (isBuiltInMockSite(site)) {
    return;
  }

  if (!site?.api || !isValidHttpUrl(site.api)) {
    throw new Error('站点 API 不是有效 HTTP 地址');
  }

  if (site.searchable === false) {
    throw new Error('该站点未声明搜索能力');
  }
}

function isBuiltInMockConfigUrl(url) {
  return typeof url === 'string' && url.trim().toLowerCase() === BUILT_IN_MOCK_CONFIG_URL;
}

function isBuiltInMockLivePlaylistUrl(url) {
  return (
    typeof url === 'string' &&
    url.trim().toLowerCase() === BUILT_IN_MOCK_LIVE_PLAYLIST_URL
  );
}

function isBuiltInMockSite(site) {
  return site?.api === BUILT_IN_MOCK_SITE_API || site?.sourceId === BUILT_IN_MOCK_CONFIG_URL;
}

module.exports = {
  fetchM3uPlaylist,
  fetchTvBoxConfig,
  fetchTvBoxDetail,
  fetchTvBoxSearch,
  isBuiltInMockConfigUrl,
  isBuiltInMockLivePlaylistUrl,
  resolveTvBoxEpisode,
};
