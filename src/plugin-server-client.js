const {
  normalizeCatVodDetailResult,
  normalizeCatVodPlayResult,
  normalizeCatVodSearchResult,
} = require('./catvod-adapter');

async function fetchPluginServerHealth(config, fetchImpl = fetch) {
  const url = buildPluginServerUrl(config?.baseUrl, '/health');
  const response = await fetchImpl(url, {
    headers: buildPluginServerHeaders(config?.token),
    method: 'GET',
  });

  return readPluginServerResponse(response);
}

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
    const payload = await parsePluginServerJson(response);
    throw new Error(formatPluginServerError(response.status, payload));
  }

  return parsePluginServerJson(response);
}

async function readPluginServerResponse(response) {
  const payload = await parsePluginServerJson(response);

  if (!response.ok) {
    throw new Error(formatPluginServerError(response.status, payload));
  }

  return payload;
}

async function parsePluginServerJson(response) {
  try {
    return JSON.parse(await response.text());
  } catch {
    throw new Error('插件解析服务没有返回有效 JSON');
  }
}

function formatPluginServerError(status, payload) {
  const code = payload?.error || '';
  const message = payload?.message || '';

  if (status === 401 || code === 'unauthorized') {
    return '插件解析服务 Token 不正确或未填写，请检查设置里的 Token';
  }

  if (code === 'PLUGIN_CONFIG_UNSUPPORTED') {
    return '这个地址是 TVBox/OK 配置，不是可直接执行的 CatVod JS 插件；其中的 JAR/CSP 站点暂不兼容';
  }

  if (code === 'PLUGIN_SITE_INCOMPATIBLE' && isCookieLoginRequired(message)) {
    return '该线路需要 Cookie 或扫码登录，当前测试版暂不兼容；请换一个搜索结果或插件源';
  }

  if (code === 'PLUGIN_SITE_INCOMPATIBLE' && isMissingCookieRuntimeObject(message)) {
    return `插件环境缺少 cookie 兼容对象，属于适配器问题，不代表该源一定需要扫码：${message}`;
  }

  if (status === 422 || code === 'PLUGIN_SITE_INCOMPATIBLE') {
    return `该站点暂不兼容服务端解析${message ? `：${message}` : ''}`;
  }

  if (status === 504 || code === 'PLUGIN_TIMEOUT') {
    return '插件解析服务超时：该线路可能是网盘资源、需要账号能力，或当前源暂不兼容；请换一个播放线路/结果再试';
  }

  if (status >= 500) {
    return `插件解析服务内部错误${message ? `：${message}` : `：HTTP ${status}`}`;
  }

  return `插件解析服务请求失败：HTTP ${status}${message ? ` ${message}` : ''}`;
}

function isCookieLoginRequired(message) {
  return /(?:requires?|need|missing|invalid).{0,24}cookie|cookie.{0,24}(?:login|登录|扫码|required|missing|invalid)|扫码|登录/i.test(
    message || ''
  );
}

function isMissingCookieRuntimeObject(message) {
  return /reading ['"]cookie['"]|read propert(?:y|ies).*cookie|undefined.*cookie/i.test(
    message || ''
  );
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
  fetchPluginServerHealth,
  fetchPluginServerDetail,
  fetchPluginServerPlay,
  fetchPluginServerSearch,
};
