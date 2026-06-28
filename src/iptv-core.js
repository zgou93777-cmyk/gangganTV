function isValidHttpUrl(value) {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    const parsedUrl = new URL(value.trim());
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

function getPlayableUrlIssue(value) {
  if (!isValidHttpUrl(value)) {
    return '播放地址需要以 http:// 或 https:// 开头';
  }

  const cleanValue = value.trim();
  const pathname = new URL(cleanValue).pathname.toLowerCase();

  if (pathname.endsWith('.m3u')) {
    return '这是频道列表地址，不是单个视频流。请在直播列表里导入后选择频道播放。';
  }

  return '';
}

function parseM3uPlaylist(text, sourceUrl = '') {
  const lines = readableText(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const channels = [];
  let pendingInfo = null;

  lines.forEach((line) => {
    if (line.startsWith('#EXTINF')) {
      pendingInfo = parseExtInf(line);
      return;
    }

    if (line.startsWith('#')) {
      return;
    }

    const channelUrl = resolvePlaylistUrl(line, sourceUrl);

    if (!isValidHttpUrl(channelUrl)) {
      pendingInfo = null;
      return;
    }

    channels.push({
      id: `channel-${channels.length + 1}`,
      name: pendingInfo?.name || `频道 ${channels.length + 1}`,
      group: pendingInfo?.group || '',
      logo: pendingInfo?.logo || '',
      url: channelUrl,
    });
    pendingInfo = null;
  });

  return channels;
}

function parseExtInf(line) {
  const commaIndex = line.indexOf(',');
  const attributesText = commaIndex === -1 ? line : line.slice(0, commaIndex);
  const displayName = commaIndex === -1 ? '' : readableText(line.slice(commaIndex + 1));
  const attributes = parseM3uAttributes(attributesText);

  return {
    name: displayName || attributes['tvg-name'] || attributes.name || '',
    group: attributes['group-title'] || '',
    logo: attributes['tvg-logo'] || '',
  };
}

function parseM3uAttributes(text) {
  const attributes = {};
  const pattern = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
  let match = pattern.exec(text);

  while (match) {
    attributes[match[1].toLowerCase()] = readableText(match[2]);
    match = pattern.exec(text);
  }

  return attributes;
}

function resolvePlaylistUrl(value, sourceUrl) {
  const cleanValue = readableText(value);

  if (isValidHttpUrl(cleanValue)) {
    return cleanValue;
  }

  if (!sourceUrl || !isValidHttpUrl(sourceUrl)) {
    return cleanValue;
  }

  try {
    return new URL(cleanValue, sourceUrl).toString();
  } catch {
    return cleanValue;
  }
}

function classifySourceUrl(value) {
  const cleanValue = typeof value === 'string' ? value.trim() : '';
  const lowerValue = cleanValue.toLowerCase();

  if (lowerValue === 'mock://demo-tvbox') {
    return {
      kind: 'config',
      reason: '',
    };
  }

  if (
    lowerValue.includes('cat.') ||
    lowerValue.endsWith('.js') ||
    lowerValue.endsWith('.js.md5') ||
    lowerValue.includes('/cat/')
  ) {
    return {
      kind: 'plugin',
      reason: '检测到 CatVod/脚本插件源，当前版本不会在 App 内直接执行第三方脚本。',
    };
  }

  if (!isValidHttpUrl(cleanValue)) {
    return {
      kind: 'invalid',
      reason: '地址需要以 http:// 或 https:// 开头。',
    };
  }

  return {
    kind: 'config',
    reason: '',
  };
}

function parseTvBoxConfig(config, sourceUrl, importedAt) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('配置内容不是有效 JSON 对象');
  }

  if (!Array.isArray(config.sites)) {
    throw new Error('没有找到 TVBox 站点列表');
  }

  const seenSiteIds = new Map();
  const sites = config.sites
    .map((site, index) => normalizeSite(site, index, config))
    .map((site) => withUniqueSiteId(site, seenSiteIds))
    .filter(Boolean);

  if (sites.length === 0) {
    throw new Error('配置里没有可识别的站点');
  }

  return {
    source: {
      id: sourceUrl,
      name: readableText(config.name) || hostnameFromUrl(sourceUrl) || '配置接口',
      url: sourceUrl,
      importedAt,
      spider: readableText(config.spider),
    },
    sites,
  };
}

function buildConfigDiagnostics({ sources = [], sites = [] } = {}) {
  const configSourceCount = sources.filter((source) => source.kind !== 'plugin').length;
  const pluginSourceCount = sources.filter((source) => source.kind === 'plugin').length;
  const runtimeSites = sites.filter((site) => site.runtime === 'tvbox-jar-spider').length;
  const pluginSites = sites.filter((site) => site.runtime === 'catvod-server').length;
  const unsupportedSites = sites.filter((site) => site.unsupportedReason).length;
  const searchableSites = sites.filter(
    (site) => site.searchable && !site.unsupportedReason
  ).length;
  const nonSearchableSites = sites.filter(
    (site) => !site.searchable && !site.unsupportedReason
  ).length;
  const totalSites = sites.length;
  const status = totalSites === 0 ? 'empty' : searchableSites > 0 ? 'ready' : 'limited';

  return {
    sourceCount: sources.length,
    configSourceCount,
    pluginSourceCount,
    totalSites,
    searchableSites,
    nonSearchableSites,
    pluginSites,
    runtimeSites,
    unsupportedSites,
    status,
    summary: buildConfigDiagnosticsSummary(
      totalSites,
      searchableSites,
      pluginSites,
      runtimeSites
    ),
  };
}

function buildConfigDiagnosticsSummary(
  totalSites,
  searchableSites,
  pluginSites,
  runtimeSites
) {
  if (totalSites === 0) {
    return '还没有导入可识别站点';
  }

  const parts = [`已导入 ${totalSites} 个站点`, `${searchableSites} 个可搜索`];

  if (runtimeSites > 0) {
    parts.push(`TVBox Spider ${runtimeSites} 个`);
  }

  if (pluginSites > 0) {
    parts.push(`${pluginSites} 个 CatVod JS`);
  }

  return parts.join('，');
}

function normalizeSite(site, index, config = {}) {
  if (!site || typeof site !== 'object') {
    return null;
  }

  const api = readableText(site.api);
  const type = Number.isFinite(Number(site.type)) ? Number(site.type) : 0;
  const isCatVodScript = isCatVodScriptUrl(api);
  const isTvBoxCsp = type === 3 || /^csp_/i.test(api);
  const configSpider = readableText(config.spider);

  const siteKey = readableText(site.key) || `${readableText(site.name) || 'site'}-${index}`;

  const normalizedSite = {
    id: siteKey,
    siteKey,
    name: readableText(site.name) || readableText(site.key) || `站点 ${index + 1}`,
    type,
    api,
    searchable: isTruthyFlagWithDefault(site.searchable, false),
    unsupportedReason: '',
  };

  if (isCatVodScript) {
    normalizedSite.runtime = 'catvod-server';
    normalizedSite.scriptUrl = api;
  } else if (isTvBoxCsp) {
    normalizedSite.runtime = 'tvbox-jar-spider';
    normalizedSite.scriptUrl = api;
    normalizedSite.configSpider = configSpider;
    normalizedSite.jar = readableText(site.jar);
    normalizedSite.ext = readableText(site.ext);
    normalizedSite.changeable = isTruthyFlag(site.changeable);
    normalizedSite.searchable = isTruthyFlagWithDefault(site.searchable, true);
    normalizedSite.unsupportedReason = '';
  }

  return normalizedSite;
}

function withUniqueSiteId(site, seenSiteIds) {
  if (!site) {
    return null;
  }

  const count = (seenSiteIds.get(site.id) || 0) + 1;
  seenSiteIds.set(site.id, count);

  if (count === 1) {
    return site;
  }

  return {
    ...site,
    id: `${site.id}-${count}`,
  };
}

function buildTvBoxSearchUrl(site, keyword) {
  const parsedUrl = new URL(site.api);
  parsedUrl.searchParams.set('ac', 'videolist');
  parsedUrl.searchParams.set('wd', keyword);
  return parsedUrl.toString();
}

function buildTvBoxDetailUrl(site, id) {
  const parsedUrl = new URL(site.api);
  parsedUrl.searchParams.set('ac', 'videolist');
  parsedUrl.searchParams.set('ids', id);
  return parsedUrl.toString();
}

function normalizeSearchResponse(response) {
  const list = firstArray([
    response?.list,
    response?.data?.list,
    response?.data?.vodList,
    response?.data?.videos,
    response?.result?.list,
    response?.result?.vodList,
    response?.videos,
    response?.vodList,
  ]);

  return list
    .map((item) => {
      const id = readableText(item?.vod_id ?? item?.vodId ?? item?.id);
      const name = readableText(item?.vod_name ?? item?.vodName ?? item?.name ?? item?.title);

      if (!id || !name) {
        return null;
      }

      return {
        id,
        name,
        poster: readableText(item?.vod_pic ?? item?.vodPic ?? item?.pic ?? item?.cover),
        remarks: readableText(
          item?.vod_remarks ?? item?.vodRemarks ?? item?.remarks ?? item?.note
        ),
      };
    })
    .filter(Boolean);
}

function normalizeDetailResponse(response) {
  const list = firstArray([
    response?.list,
    response?.data?.list,
    response?.data?.vodList,
    response?.result?.list,
    response?.result?.vodList,
  ]);
  const item = list[0] || firstObject([response?.data, response?.result, response?.vod]);

  if (!item || typeof item !== 'object') {
    throw new Error('没有找到影片详情');
  }

  return {
    id: readableText(item.vod_id ?? item.vodId ?? item.id),
    name: readableText(item.vod_name ?? item.vodName ?? item.name ?? item.title),
    poster: readableText(item.vod_pic ?? item.vodPic ?? item.pic ?? item.cover),
    remarks: readableText(item.vod_remarks ?? item.vodRemarks ?? item.remarks ?? item.note),
    playGroups: parsePlayGroups(
      item.vod_play_from ?? item.vodPlayFrom ?? item.playFrom,
      item.vod_play_url ?? item.vodPlayUrl ?? item.playUrl
    ),
  };
}

function parsePlayGroups(playFrom, playUrl) {
  const groupNames = readableText(playFrom)
    .split('$$$')
    .map((name, index) => readableText(name) || `线路 ${index + 1}`);

  return readableText(playUrl)
    .split('$$$')
    .map((groupText, groupIndex) => {
      const episodes = groupText
        .split('#')
        .map((episodeText, episodeIndex) => parseEpisode(episodeText, episodeIndex))
        .filter(Boolean);

      return {
        name: groupNames[groupIndex] || `线路 ${groupIndex + 1}`,
        episodes,
      };
    })
    .filter((group) => group.episodes.length > 0);
}

function parseEpisode(episodeText, episodeIndex) {
  const cleanText = readableText(episodeText);

  if (!cleanText) {
    return null;
  }

  const separatorIndex = cleanText.indexOf('$');

  if (separatorIndex === -1) {
    return {
      name: `播放 ${episodeIndex + 1}`,
      url: cleanText,
    };
  }

  return {
    name: readableText(cleanText.slice(0, separatorIndex)) || `播放 ${episodeIndex + 1}`,
    url: readableText(cleanText.slice(separatorIndex + 1)),
  };
}

function extractPlayableUrl(payload) {
  const candidates = [
    payload?.url,
    payload?.playUrl,
    payload?.data?.url,
    payload?.data?.playUrl,
  ];

  return candidates.find((candidate) => isValidHttpUrl(candidate))?.trim() || '';
}

function firstArray(values) {
  return values.find((value) => Array.isArray(value)) || [];
}

function firstObject(values) {
  return values.find(
    (value) => value && typeof value === 'object' && !Array.isArray(value)
  );
}

function isTruthyFlag(value) {
  if (value === true) {
    return true;
  }

  if (typeof value === 'number') {
    return value > 0;
  }

  if (typeof value === 'string') {
    return ['1', 'true', 'yes'].includes(value.trim().toLowerCase());
  }

  return false;
}

function isTruthyFlagWithDefault(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  return isTruthyFlag(value);
}

function isCatVodScriptUrl(value) {
  const lowerValue = readableText(value).toLowerCase();

  return (
    lowerValue.startsWith('http') &&
    (lowerValue.includes('/cat/') ||
      lowerValue.includes('cat.') ||
      lowerValue.endsWith('.js') ||
      lowerValue.endsWith('.js.md5'))
  );
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

function readableText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

module.exports = {
  buildConfigDiagnostics,
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
};
