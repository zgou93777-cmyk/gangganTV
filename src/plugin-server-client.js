const {
  normalizeCatVodDetailResult,
  normalizeCatVodPlayResult,
  normalizeCatVodSearchResult,
} = require('./catvod-adapter');

async function fetchPluginServerSearch(config, keyword, fetchImpl = fetch) {
  const payload = await postPluginServer(config, '/catvod/search', {
    keyword,
    scriptUrl: config?.scriptUrl,
  }, fetchImpl);

  return normalizeCatVodSearchResult(payload);
}

async function fetchPluginServerDetail(config, id, fetchImpl = fetch) {
  const payload = await postPluginServer(config, '/catvod/detail', {
    id,
    scriptUrl: config?.scriptUrl,
  }, fetchImpl);

  return normalizeCatVodDetailResult(payload);
}

async function fetchPluginServerPlay(config, episode, fetchImpl = fetch) {
  const payload = await postPluginServer(config, '/catvod/play', {
    flag: episode?.flag || episode?.group || '',
    id: episode?.id || episode?.url || '',
    scriptUrl: config?.scriptUrl,
  }, fetchImpl);

  return normalizeCatVodPlayResult(payload);
}

async function postPluginServer(config, path, body, fetchImpl) {
  const url = buildPluginServerUrl(config?.baseUrl, path);
  const response = await fetchImpl(url, {
    body: JSON.stringify(body),
    headers: buildPluginServerHeaders(config?.token),
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`插件解析服务请求失败：HTTP ${response.status}`);
  }

  try {
    return JSON.parse(await response.text());
  } catch {
    throw new Error('插件解析服务没有返回有效 JSON');
  }
}

function buildPluginServerUrl(baseUrl, path) {
  const cleanBaseUrl = typeof baseUrl === 'string' ? baseUrl.trim() : '';

  if (!/^https?:\/\//i.test(cleanBaseUrl)) {
    throw new Error('插件解析服务地址需要以 http:// 或 https:// 开头');
  }

  return `${cleanBaseUrl.replace(/\/+$/, '')}${path}`;
}

function buildPluginServerHeaders(token) {
  const headers = {
    Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
    'Content-Type': 'application/json',
  };
  const cleanToken = typeof token === 'string' ? token.trim() : '';

  if (cleanToken) {
    headers.Authorization = `Bearer ${cleanToken}`;
  }

  return headers;
}

module.exports = {
  fetchPluginServerDetail,
  fetchPluginServerPlay,
  fetchPluginServerSearch,
};
