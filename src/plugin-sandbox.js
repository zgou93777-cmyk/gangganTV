const ALLOWED_APIS = [
  'fetch',
  'JSON',
  'URL',
  'URLSearchParams',
  'TextEncoder',
  'TextDecoder',
];

const BLOCKED_PATTERNS = [
  ['eval', /\beval\s*\(/],
  ['Function', /\b(?:new\s+)?Function\s*\(/],
  ['require', /\brequire\s*\(/],
  ['importScripts', /\bimportScripts\s*\(/],
  ['WebSocket', /\bWebSocket\b/],
  ['FileSystem', /\b(?:FileSystem|expo-file-system)\b/],
  ['AsyncStorage', /\bAsyncStorage\b/],
  ['SecureStore', /\bSecureStore\b/],
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/],
  ['process', /\bprocess\b/],
];

const SHIM_COMPATIBLE_TOKENS = new Set(['localStorage', 'sessionStorage', 'process']);

function preflightPluginSandbox(scriptText) {
  const blockedTokens = detectBlockedTokens(scriptText);

  if (blockedTokens.length) {
    const compatibility = summarizeSandboxCompatibility(blockedTokens);

    return {
      ok: false,
      status: 'sandbox-preflight-blocked',
      title: '沙盒预检阻断',
      message: compatibility.message,
      blockedTokens,
      compatibility,
      allowedApis: ALLOWED_APIS,
      nextStep: '该插件源暂时不能本地执行；后续可改走服务端解析层或等待专用适配器。',
    };
  }

  return {
    ok: true,
    status: 'sandbox-preflight-passed',
    title: '沙盒预检通过',
    message: '脚本没有发现明显危险能力，可以进入受限执行器技术验证。',
    blockedTokens: [],
    compatibility: {
      status: 'ready',
      runnable: true,
      shimTokens: [],
      blockedTokens: [],
      message: '脚本可以进入受限执行器技术验证。',
    },
    allowedApis: ALLOWED_APIS,
    nextStep: '下一步在隔离执行层中只暴露网络请求和基础字符串/JSON 能力，验证 search/detail/play 是否能返回最终播放地址。',
  };
}

function summarizeSandboxCompatibility(blockedTokens) {
  const uniqueTokens = [...new Set(blockedTokens)];
  const shimTokens = uniqueTokens.filter((token) => SHIM_COMPATIBLE_TOKENS.has(token));
  const hardBlockedTokens = uniqueTokens.filter(
    (token) => !SHIM_COMPATIBLE_TOKENS.has(token)
  );

  if (!hardBlockedTokens.length) {
    return {
      status: 'shim-required',
      runnable: true,
      shimTokens,
      blockedTokens: [],
      message: `脚本需要兼容层：${shimTokens.join(', ')}。`,
    };
  }

  return {
    status: shimTokens.length ? 'shim-required' : 'blocked',
    runnable: false,
    shimTokens,
    blockedTokens: hardBlockedTokens,
    message: shimTokens.length
      ? `脚本需要兼容层：${shimTokens.join(', ')}；仍阻断：${hardBlockedTokens.join(', ')}。`
      : `脚本包含不允许在本机执行的能力：${hardBlockedTokens.join(', ')}。`,
  };
}

function detectBlockedTokens(scriptText) {
  const text = readableText(scriptText);
  const tokens = [];

  for (const [token, pattern] of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      tokens.push(token);
    }
  }

  return tokens;
}

function readableText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

module.exports = {
  preflightPluginSandbox,
  summarizeSandboxCompatibility,
};
