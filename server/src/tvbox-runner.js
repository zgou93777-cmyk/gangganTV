class TvBoxRunner {
  constructor({ fetchImpl = fetch, runtime = null } = {}) {
    this.fetchImpl = fetchImpl;
    this.runtime = runtime;
    this.configCache = new Map();
  }

  async search(payload) {
    const { site } = await this.resolveSite(payload);
    return this.callRuntime('search', site, payload);
  }

  async detail(payload) {
    const { site } = await this.resolveSite(payload);
    return this.callRuntime('detail', site, payload);
  }

  async play(payload) {
    const { site } = await this.resolveSite(payload);
    return this.callRuntime('play', site, payload);
  }

  async resolveSite({ configUrl, siteKey }) {
    if (!configUrl || !/^https?:\/\//i.test(configUrl)) {
      throw withStatus(
        new Error('配置地址需要以 http:// 或 https:// 开头'),
        'TVBOX_BAD_REQUEST',
        400
      );
    }

    if (!siteKey) {
      throw withStatus(new Error('缺少站点 key'), 'TVBOX_BAD_REQUEST', 400);
    }

    const config = await this.fetchConfig(configUrl);
    const sites = Array.isArray(config.sites) ? config.sites : [];
    const site = sites.find((item) => item?.key === siteKey);

    if (!site) {
      throw withStatus(
        new Error(`没有找到站点 ${siteKey}`),
        'TVBOX_SITE_NOT_FOUND',
        404
      );
    }

    return {
      config,
      site: {
        ...site,
        configUrl,
        configSpider: config.spider || '',
      },
    };
  }

  async fetchConfig(configUrl) {
    if (this.configCache.has(configUrl)) {
      return this.configCache.get(configUrl);
    }

    const response = await this.fetchImpl(configUrl, {
      headers: {
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        'User-Agent': 'okhttp/4.10.0',
      },
    });

    if (!response.ok) {
      throw withStatus(
        new Error(`配置请求失败：HTTP ${response.status}`),
        'TVBOX_CONFIG_FETCH_FAILED',
        502
      );
    }

    const config = JSON.parse(await response.text());
    this.configCache.set(configUrl, config);
    return config;
  }

  async callRuntime(action, site, payload) {
    if (!this.runtime || typeof this.runtime[action] !== 'function') {
      throw withStatus(
        new Error(`TVBox Spider 运行时未连接：${site.key || payload.siteKey}`),
        'TVBOX_RUNTIME_UNAVAILABLE',
        503
      );
    }

    return this.runtime[action](site, payload);
  }
}

function withStatus(error, code, statusCode) {
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  TvBoxRunner,
};
