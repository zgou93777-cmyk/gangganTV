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
  ['globalThis', /\bglobalThis\b/],
  ['process', /\bprocess\b/],
  ['document', /\bdocument\b/],
  ['window', /\bwindow\b/],
];

function preflightPluginSandbox(scriptText) {
  const blockedTokens = detectBlockedTokens(scriptText);

  if (blockedTokens.length) {
    return {
      ok: false,
      status: 'sandbox-preflight-blocked',
      title: '沙盒预检阻断',
      message: `脚本包含不允许在本机执行的能力：${blockedTokens.join(', ')}。`,
      blockedTokens,
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
    allowedApis: ALLOWED_APIS,
    nextStep: '下一步在隔离执行层中只暴露网络请求和基础字符串/JSON 能力，验证 search/detail/play 是否能返回最终播放地址。',
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
};
