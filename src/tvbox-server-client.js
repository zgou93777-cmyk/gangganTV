const {
  extractPlayableUrl,
  normalizeDetailResponse,
  normalizeSearchResponse,
} = require('./iptv-core');

async function fetchTvBoxServerSearch(config, keyword, fetchImpl = fetch) {
  const payload = await postTvBoxServer(
    config,
    '/tvbox/search',
    {
      configUrl: config?.configUrl,
      siteKey: config?.siteKey,
      keyword,
    },
    fetchImpl
  );

  return normalizeSearchResponse(payload).map((result) => ({
    ...result,
    sourceId: config?.siteKey || '',
  }));
}

async function fetchTvBoxServerDetail(config, id, fetchImpl = fetch) {
  const payload = await postTvBoxServer(
    config,
    '/tvbox/detail',
    {
      configUrl: config?.configUrl,
      siteKey: config?.siteKey,
      id,
    },
    fetchImpl
  );

  return normalizeDetailResponse(payload);
}

async function fetchTvBoxServerPlay(config, episode, fetchImpl = fetch) {
  const payload = await postTvBoxServer(
    config,
    '/tvbox/play',
    {
      configUrl: config?.configUrl,
      siteKey: config?.siteKey,
      flag: episode?.flag || episode?.group || '',
      id: episode?.id || episode?.url || '',
    },
    fetchImpl
  );

  if (payload?.kind === 'netdisk') {
    throw new Error(payload.message || '该线路需要添加网盘账号或扫码登录');
  }

  const playableUrl = payload?.url || extractPlayableUrl(payload);

  if (!playableUrl) {
    throw new Error(payload?.message || '没有解析到可播放地址');
  }

  return playableUrl;
}

async function postTvBoxServer(config, path, body, fetchImpl) {
  const response = await fetchImpl(buildTvBoxServerUrl(config?.baseUrl, path), {
    body: JSON.stringify(body),
    headers: buildTvBoxServerHeaders(config?.token),
    method: 'POST',
  });

  const payload = await parseTvBoxServerJson(response);

  if (!response.ok) {
    throw new Error(formatTvBoxServerError(response.status, payload));
  }

  return payload;
}

function buildTvBoxServerUrl(baseUrl, path) {
  const cleanBaseUrl = typeof baseUrl === 'string' ? baseUrl.trim() : '';

  if (!/^https?:\/\//i.test(cleanBaseUrl)) {
    throw new Error('解析服务地址需要以 http:// 或 https:// 开头');
  }

  return `${cleanBaseUrl.replace(/\/+$/, '')}${path}`;
}

function buildTvBoxServerHeaders(token) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const cleanToken = typeof token === 'string' ? token.trim() : '';

  if (cleanToken) {
    headers.Authorization = `Bearer ${cleanToken}`;
  }

  return headers;
}

async function parseTvBoxServerJson(response) {
  try {
    return JSON.parse(await response.text());
  } catch {
    throw new Error('TVBox 解析服务没有返回有效 JSON');
  }
}

function formatTvBoxServerError(status, payload) {
  const code = payload?.error || '';
  const message = payload?.message || '';

  if (status === 401 || code === 'unauthorized') {
    return '解析服务 Token 不正确或未填写，请检查设置里的 Token';
  }

  if (code === 'TVBOX_RUNTIME_UNAVAILABLE') {
    return 'TVBox Spider 运行时还没有连接成功，当前源正在适配';
  }

  if (code === 'TVBOX_NETDISK_REQUIRED') {
    return '该线路需要添加网盘账号或扫码登录';
  }

  if (status === 504 || code === 'TVBOX_TIMEOUT') {
    return 'TVBox 解析服务超时，请稍后重试或换一个源';
  }

  return `TVBox 解析服务请求失败：HTTP ${status}${message ? ` ${message}` : ''}`;
}

module.exports = {
  fetchTvBoxServerDetail,
  fetchTvBoxServerPlay,
  fetchTvBoxServerSearch,
  buildTvBoxServerUrl,
  buildTvBoxServerHeaders,
  formatTvBoxServerError,
};
