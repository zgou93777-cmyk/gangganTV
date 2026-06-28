function diagnosePluginSource(value) {
  const input = readableText(value);
  const normalized = normalizeHttpUrl(input);

  if (!normalized && looksLikeBrokenPluginUrl(input)) {
    return {
      kind: 'malformed-plugin-url',
      runtime: 'unknown',
      executable: false,
      safety: 'blocked',
      compatibility: 'repair-needed',
      title: '插件链接格式错误',
      summary: '这个插件链接可能复制时缺少域名或 @ 符号，无法判断真实脚本入口。',
      nextStep: '请重新复制完整链接；正确格式通常类似 http://user:pass@domain/index.js.md5。',
      capabilities: unknownCapabilities(),
    };
  }

  if (isCatVodScriptUrl(normalized || input)) {
    return {
      kind: 'catvod-script',
      runtime: 'catvod',
      executable: false,
      safety: 'blocked',
      compatibility: 'requires-sandbox',
      title: 'CatVod 插件脚本',
      summary: '已识别为 CatVod/魔力云播脚本源，当前不会在 App 内直接执行。',
      nextStep: '需要先做受限 JS 沙盒或服务端解析层，再把最终 m3u8/mp4 交给播放器。',
      capabilities: unknownCapabilities(),
    };
  }

  return {
    kind: 'unknown',
    runtime: 'unknown',
    executable: false,
    safety: 'blocked',
    compatibility: 'unknown',
    title: '未知插件源',
    summary: '暂时无法判断这个链接是否为可兼容插件源。',
    nextStep: '可以先按配置接口导入；如果失败，再作为插件源进入适配验证。',
    capabilities: unknownCapabilities(),
  };
}

function diagnosePluginSite(site) {
  const name = readableText(site?.name) || '该站点';
  const api = readableText(site?.api);
  const isTvBoxPlugin =
    Number(site?.type) === 3 || /^csp_/i.test(api) || isCatVodScriptUrl(api);

  if (isTvBoxPlugin) {
    return {
      kind: 'tvbox-plugin-site',
      runtime: 'tvbox-csp',
      executable: false,
      safety: 'blocked',
      compatibility: 'requires-adapter',
      title: 'TVBox 插件站点',
      summary: `${name} 是 TVBox/CSP 插件站点，不能按普通 JSON API 搜索播放。`,
      nextStep: '需要插件适配器解析 search/detail/play，或交给服务端解析后返回最终播放地址。',
      capabilities: {
        home: 'unknown',
        search: site?.searchable ? 'declared' : 'unknown',
        detail: 'unknown',
        play: 'unknown',
      },
    };
  }

  return {
    kind: 'json-api-site',
    runtime: 'tvbox-json',
    executable: true,
    safety: 'safe',
    compatibility: 'supported',
    title: '普通 JSON API 站点',
    summary: `${name} 看起来是普通 TVBox JSON API 站点，可以尝试搜索和播放。`,
    nextStep: '如果搜索或详情失败，再按该站点返回格式补兼容层。',
    capabilities: {
      home: 'unknown',
      search: site?.searchable ? 'declared' : 'unknown',
      detail: 'supported',
      play: 'supported',
    },
  };
}

function isCatVodScriptUrl(value) {
  const lowerValue = readableText(value).toLowerCase();

  return (
    lowerValue.includes('/cat/') ||
    lowerValue.includes('cat.') ||
    lowerValue.endsWith('.js') ||
    lowerValue.endsWith('.js.md5')
  );
}

function looksLikeBrokenPluginUrl(value) {
  const cleanValue = readableText(value).toLowerCase();
  return cleanValue.includes('index.js') || cleanValue.endsWith('.js.md5');
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

function unknownCapabilities() {
  return {
    home: 'unknown',
    search: 'unknown',
    detail: 'unknown',
    play: 'unknown',
  };
}

function readableText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

module.exports = {
  diagnosePluginSite,
  diagnosePluginSource,
};
