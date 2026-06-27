const {
  buildConfigDiagnostics,
  classifySourceUrl,
} = require('./iptv-core');
const {
  fetchTvBoxConfig,
} = require('./iptv-api');

function extractConfigSourceCandidates(text) {
  if (typeof text !== 'string') {
    return [];
  }

  const tokens = extractHttpTokens(text);
  const seenValid = new Set();
  const seenInvalid = new Set();
  const valid = [];
  const invalid = [];

  tokens.forEach((token) => {
    const input = trimUrlPunctuation(token);
    const normalized = normalizeHttpUrl(input);

    if (normalized) {
      if (!seenValid.has(normalized)) {
        seenValid.add(normalized);
        valid.push({
          input,
          url: normalized,
          valid: true,
        });
      }
      return;
    }

    if (!seenInvalid.has(input)) {
      seenInvalid.add(input);
      invalid.push({
        input,
        url: '',
        valid: false,
        reason: '链接格式错误，可能是复制时缺少域名或 @ 符号。',
      });
    }
  });

  return [...valid, ...invalid];
}

async function scanConfigSourceText(text, options = {}) {
  return scanConfigSourceCandidates(extractConfigSourceCandidates(text), options);
}

async function scanConfigSourceCandidates(
  candidates,
  { fetchImpl = fetch, now = () => new Date().toISOString() } = {}
) {
  const results = [];

  for (const candidate of candidates || []) {
    results.push(await scanConfigSourceCandidate(candidate, { fetchImpl, now }));
  }

  return results;
}

async function scanConfigSourceCandidate(candidate, { fetchImpl, now }) {
  if (!candidate?.valid) {
    return buildResult({
      input: candidate?.input || '',
      url: '',
      kind: 'invalid',
      ok: false,
      status: 'invalid-url',
      message: candidate?.reason || '链接格式错误。',
    });
  }

  const classification = classifySourceUrl(candidate.url);

  if (classification.kind === 'plugin') {
    return buildResult({
      input: candidate.input,
      url: candidate.url,
      kind: 'plugin',
      ok: false,
      status: 'plugin-source',
      message: '这是 CatVod/魔力云播插件源，当前版本只识别，不执行第三方脚本。',
    });
  }

  try {
    const parsed = await fetchTvBoxConfig(candidate.url, fetchImpl, now);
    const diagnostics = buildConfigDiagnostics({
      sources: [{ ...parsed.source, kind: 'config' }],
      sites: parsed.sites,
    });

    return buildResult({
      input: candidate.input,
      url: candidate.url,
      kind: 'config',
      ok: true,
      status: 'ready',
      message: `可导入配置，识别到 ${parsed.sites.length} 个站点。`,
      source: parsed.source,
      sites: parsed.sites,
      siteCount: parsed.sites.length,
      searchableCount: diagnostics.searchableSites,
      pluginCount: diagnostics.pluginSites,
    });
  } catch (error) {
    return buildResult({
      input: candidate.input,
      url: candidate.url,
      kind: 'unknown',
      ok: false,
      status: classifyConfigScanFailure(error),
      message: error?.message || '配置接口检测失败',
    });
  }
}

function classifyConfigScanFailure(error) {
  const message = error?.message || '';

  if (message.includes('HTTP') || message.includes('网络请求失败')) {
    return 'network-error';
  }

  return 'invalid-config';
}

function extractHttpTokens(text) {
  const tokens = [];
  const pattern = /https?:\/\/[^\s<>"'，。；；、【】（）()]+/gi;
  let match = pattern.exec(text);

  while (match) {
    tokens.push(match[0]);
    match = pattern.exec(text);
  }

  return tokens;
}

function normalizeHttpUrl(value) {
  try {
    const parsed = new URL(value);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }

    return parsed.toString();
  } catch {
    return '';
  }
}

function trimUrlPunctuation(value) {
  return String(value).replace(/[)\].,，。；;、]+$/g, '');
}

function buildResult({
  input,
  url,
  kind,
  ok,
  status,
  message,
  source = null,
  sites = [],
  siteCount = 0,
  searchableCount = 0,
  pluginCount = 0,
}) {
  return {
    input,
    url,
    kind,
    ok,
    status,
    message,
    source,
    sites,
    siteCount,
    searchableCount,
    pluginCount,
  };
}

module.exports = {
  extractConfigSourceCandidates,
  scanConfigSourceCandidates,
  scanConfigSourceText,
};
