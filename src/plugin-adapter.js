const {
  diagnosePluginSite,
  diagnosePluginSource,
} = require('./plugin-diagnostics');
const {
  preflightPluginSandbox,
} = require('./plugin-sandbox');

async function verifyPluginTarget(target, { fetchImpl = fetch } = {}) {
  if (target?.kind === 'site') {
    return verifyPluginSite(target.site);
  }

  return verifyPluginSource(target?.url, { fetchImpl });
}

function verifyPluginSite(site) {
  const diagnostic = diagnosePluginSite(site);
  const name = readableText(site?.name) || '该站点';

  if (diagnostic.kind !== 'tvbox-plugin-site') {
    return {
      ok: true,
      targetKind: 'site',
      runtime: diagnostic.runtime,
      status: 'supported-json-api',
      title: '普通站点验证',
      message: diagnostic.summary,
      scriptUrl: '',
      scriptBytes: 0,
      capabilities: diagnostic.capabilities,
      nextStep: diagnostic.nextStep,
    };
  }

  return {
    ok: false,
    targetKind: 'site',
    runtime: 'tvbox-csp',
    status: 'adapter-required',
    title: 'TVBox 插件适配验证',
    message: `${name} 是 TVBox/CSP 插件站点，需要先实现插件适配器，不能按普通 JSON API 请求。`,
    scriptUrl: '',
    scriptBytes: 0,
    capabilities: diagnostic.capabilities,
    nextStep: '需要把该 CSP 插件映射到 search/detail/play 适配器，或使用服务端解析层。',
  };
}

async function verifyPluginSource(url, { fetchImpl }) {
  const diagnostic = diagnosePluginSource(url);
  const cleanUrl = readableText(url);

  if (diagnostic.kind !== 'catvod-script') {
    return {
      ok: false,
      targetKind: 'source',
      runtime: diagnostic.runtime,
      status: diagnostic.compatibility,
      title: diagnostic.title,
      message: diagnostic.summary,
      scriptUrl: cleanUrl,
      scriptBytes: 0,
      capabilities: diagnostic.capabilities,
      nextStep: diagnostic.nextStep,
    };
  }

  try {
    const scriptText = await fetchPluginScript(cleanUrl, fetchImpl);
    const capabilities = inspectScriptCapabilities(scriptText);
    const sandboxPreflight = preflightPluginSandbox(scriptText);

    return {
      ok: false,
      targetKind: 'source',
      runtime: 'catvod',
      status: 'sandbox-required',
      title: 'CatVod 脚本静态验证',
      message: '已下载脚本并完成静态能力识别；当前没有执行第三方脚本。',
      scriptUrl: cleanUrl,
      scriptBytes: scriptText.length,
      capabilities,
      sandboxPreflight,
      nextStep: '下一步需要受限 JS 沙盒验证这些函数能否安全运行，再尝试解析最终播放地址。',
    };
  } catch (error) {
    return {
      ok: false,
      targetKind: 'source',
      runtime: 'catvod',
      status: 'network-error',
      title: 'CatVod 脚本下载失败',
      message: error?.message || '插件脚本下载失败',
      scriptUrl: cleanUrl,
      scriptBytes: 0,
      capabilities: diagnostic.capabilities,
      nextStep: '请确认网络、代理或链接是否可访问；下载成功后才能做沙盒验证。',
    };
  }
}

async function fetchPluginScript(url, fetchImpl) {
  let response;

  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: 'text/plain, application/javascript;q=0.9, */*;q=0.8',
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
    throw new Error('插件脚本没有返回文本内容');
  }

  return response.text();
}

function inspectScriptCapabilities(scriptText) {
  return {
    home: detectFunction(scriptText, 'home'),
    search: detectFunction(scriptText, 'search'),
    detail: detectFunction(scriptText, 'detail'),
    play: detectFunction(scriptText, 'play'),
  };
}

function detectFunction(scriptText, name) {
  const text = readableText(scriptText);
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`\\bfunction\\s+${escapedName}\\s*\\(`),
    new RegExp(`\\b${escapedName}\\s*[:=]\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*=>|[^=]*=>)`),
    new RegExp(`\\b${escapedName}\\s*\\(`),
  ];

  return patterns.some((pattern) => pattern.test(text)) ? 'detected' : 'unknown';
}

function readableText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

module.exports = {
  inspectScriptCapabilities,
  verifyPluginTarget,
};
