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
    .map((site, index) => normalizeSite(site, index))
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
    },
    sites,
  };
}

function normalizeSite(site, index) {
  if (!site || typeof site !== 'object') {
    return null;
  }

  const api = readableText(site.api);
  const type = Number.isFinite(Number(site.type)) ? Number(site.type) : 0;
  const isPlugin = type === 3 || /^csp_/i.test(api) || api.toLowerCase().includes('.js');

  const siteKey = readableText(site.key) || `${readableText(site.name) || 'site'}-${index}`;

  return {
    id: siteKey,
    siteKey,
    name: readableText(site.name) || readableText(site.key) || `站点 ${index + 1}`,
    type,
    api,
    searchable: isTruthyFlag(site.searchable),
    unsupportedReason: isPlugin ? '插件站点暂不执行第三方脚本' : '',
  };
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
  const list = Array.isArray(response?.list) ? response.list : [];

  return list
    .map((item) => {
      const id = readableText(item?.vod_id ?? item?.id);
      const name = readableText(item?.vod_name ?? item?.name);

      if (!id || !name) {
        return null;
      }

      return {
        id,
        name,
        poster: readableText(item?.vod_pic ?? item?.pic),
        remarks: readableText(item?.vod_remarks ?? item?.remarks),
      };
    })
    .filter(Boolean);
}

function normalizeDetailResponse(response) {
  const list = Array.isArray(response?.list) ? response.list : [];
  const item = list[0];

  if (!item || typeof item !== 'object') {
    throw new Error('没有找到影片详情');
  }

  return {
    id: readableText(item.vod_id ?? item.id),
    name: readableText(item.vod_name ?? item.name),
    poster: readableText(item.vod_pic ?? item.pic),
    remarks: readableText(item.vod_remarks ?? item.remarks),
    playGroups: parsePlayGroups(item.vod_play_from, item.vod_play_url),
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
  buildTvBoxDetailUrl,
  buildTvBoxSearchUrl,
  classifySourceUrl,
  extractPlayableUrl,
  isValidHttpUrl,
  normalizeDetailResponse,
  normalizeSearchResponse,
  parseTvBoxConfig,
};
