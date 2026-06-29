const vm = require('node:vm');

process.on('message', async (message) => {
  try {
    const value = await executePlugin(message || {});
    process.send?.({
      ok: true,
      value,
    });
  } catch (error) {
    process.send?.({
      code: classifyError(error),
      message: error?.message || String(error),
      ok: false,
      stack: error?.stack || '',
      statusCode: error?.statusCode || 500,
    });
  }
});

async function executePlugin({ method, payload, scriptText, scriptTimeoutMs }) {
  const context = createPluginContext();
  vm.createContext(context);
  new vm.Script(String(scriptText || ''), {
    filename: payload?.scriptUrl || 'catvod-plugin.js',
  }).runInContext(context, {
    timeout: normalizeTimeoutMs(scriptTimeoutMs, 5_000),
  });

  if (context.module?.exports?.start) {
    await context.module.exports.start(defaultPluginConfig());
    const bundleResult = await callBundleHost(context, method, payload);

    if (bundleResult.called) {
      return bundleResult.value;
    }
  }

  const plainResult = await callPlainFunction(context, method, payload);

  if (plainResult.called) {
    return plainResult.value;
  }

  const routeResult = await callRoutePlugin(context, method, payload);

  if (routeResult.called) {
    return routeResult.value;
  }

  throw Object.assign(new Error(`Plugin does not provide ${method}.`), {
    code: 'PLUGIN_METHOD_MISSING',
    statusCode: 422,
  });
}

function createPluginContext() {
  const pluginModule = { exports: {} };
  const context = {
    AbortController,
    AbortSignal,
    ArrayBuffer,
    Blob,
    Buffer,
    clearImmediate,
    clearInterval,
    clearTimeout,
    console,
    Event,
    EventTarget,
    fetch,
    FormData,
    Headers,
    MessageChannel,
    MessageEvent,
    module: pluginModule,
    exports: pluginModule.exports,
    performance,
    process,
    queueMicrotask,
    ReadableStream,
    Request,
    require,
    Response,
    setImmediate,
    setInterval,
    setTimeout,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    WebSocket,
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
  };

  context.global = context;
  context.globalThis = context;
  context.catDartServerPort = () => 0;
  context.catServerFactory = (handler) => {
    const server = createMemoryServer(handler);
    context.__catvodServer = server;
    return server;
  };
  context.createCatApp = createMemoryCatApp;
  return context;
}

async function callPlainFunction(context, method, payload) {
  const fn =
    context[method] ||
    context.module?.exports?.[method] ||
    context.exports?.[method] ||
    context.module?.exports?.default?.[method];

  if (typeof fn !== 'function') {
    return { called: false };
  }

  return {
    called: true,
    value: await fn(...buildPlainArgs(method, payload)),
  };
}

async function callRoutePlugin(context, method, payload) {
  const api =
    context.module?.exports?.api ||
    context.module?.exports?.default?.api ||
    context.api;

  if (typeof api !== 'function') {
    return { called: false };
  }

  const router = createMemoryRouter();
  await api(router);
  return {
    called: true,
    value: await router.inject(routeRequest(method, payload)),
  };
}

async function callBundleHost(context, method, payload) {
  const app = context.__catvodApp;

  if (!app || typeof app.inject !== 'function') {
    return callBundleServerHost(context, method, payload);
  }

  const sites = await resolveBundleSites(app);

  if (method === 'sources') {
    return {
      called: true,
      value: { sites },
    };
  }

  if (method === 'search') {
    const mergedList = [];
    const selectedSiteBasePath = normalizeSiteBasePath(payload?.siteBasePath || '');
    const searchSites = selectedSiteBasePath
      ? sites.filter(
          (site) => normalizeSiteBasePath(site.api || '') === selectedSiteBasePath
        )
      : sites;

    for (const site of searchSites) {
      const siteBasePath = normalizeSiteBasePath(site.api || '');
      const request = routeRequest(method, payload);
      let value;

      try {
        value = await app.inject({
          ...request,
          path: `${siteBasePath}${request.path}`,
        });
      } catch {
        continue;
      }

      if ((value?.list || []).length) {
        const wrapped = wrapBundleResult(method, value, siteBasePath, site);
        mergedList.push(...(wrapped.list || []));
      }
    }

    return {
      called: true,
      value: { list: mergedList },
    };
  }

  if (method === 'home') {
    const site = selectBundleSite(sites, payload?.siteBasePath);
    const siteBasePath = normalizeSiteBasePath(site.api || '');
    let value = await app.inject({
      ...routeRequest(method, payload),
      path: `${siteBasePath}/home`,
    });
    value = await loadCategoryHomeFallback({
      injectJson: (request) => app.inject(request),
      site,
      siteBasePath,
      value,
    });

    return {
      called: true,
      value: wrapBundleResult('search', value, siteBasePath, site),
    };
  }

  const fallbackSiteBasePath = normalizeSiteBasePath(sites[0].api || '');
  const unwrappedPayload = unwrapBundlePayload(method, payload, fallbackSiteBasePath);
  const request = routeRequest(method, unwrappedPayload);
  const requestSiteBasePath = unwrappedPayload.siteBasePath || fallbackSiteBasePath;
  const site = selectBundleSite(sites, requestSiteBasePath);
  const value = await app.inject({
    ...request,
    path: `${requestSiteBasePath}${request.path}`,
  });

  return {
    called: true,
    value: wrapBundleResult(method, value, requestSiteBasePath, site),
  };
}

async function callBundleServerHost(context, method, payload) {
  const server = context.__catvodServer;

  if (!server || typeof server.injectJson !== 'function') {
    return { called: false };
  }

  const config = await server.injectJson({
    method: 'GET',
    path: '/config',
  });
  const sites = (config?.video?.sites || []).filter((candidate) => candidate?.api);

  if (!sites.length) {
    throw Object.assign(new Error('Bundle plugin did not expose any video sites.'), {
      code: 'PLUGIN_SITE_MISSING',
      statusCode: 422,
    });
  }

  if (method === 'sources') {
    return {
      called: true,
      value: { sites },
    };
  }

  if (method === 'search') {
    const mergedList = [];
    const selectedSiteBasePath = normalizeSiteBasePath(payload?.siteBasePath || '');
    const searchSites = selectedSiteBasePath
      ? sites.filter(
          (site) => normalizeSiteBasePath(site.api || '') === selectedSiteBasePath
        )
      : sites;

    for (const site of searchSites) {
      const siteBasePath = normalizeSiteBasePath(site.api || '');
      const request = routeRequest(method, payload);
      let value;

      try {
        value = await server.injectJson({
          ...request,
          path: `${siteBasePath}${request.path}`,
        });
      } catch {
        continue;
      }

      if ((value?.list || []).length) {
        const wrapped = wrapBundleResult(method, value, siteBasePath, site);
        mergedList.push(...(wrapped.list || []));
      }
    }

    return {
      called: true,
      value: { list: mergedList },
    };
  }

  if (method === 'home') {
    const site = selectBundleSite(sites, payload?.siteBasePath);
    const siteBasePath = normalizeSiteBasePath(site.api || '');
    let value = await server.injectJson({
      ...routeRequest(method, payload),
      path: `${siteBasePath}/home`,
    });
    value = await loadCategoryHomeFallback({
      injectJson: (request) => server.injectJson(request),
      site,
      siteBasePath,
      value,
    });

    return {
      called: true,
      value: wrapBundleResult('search', value, siteBasePath, site),
    };
  }

  const fallbackSiteBasePath = normalizeSiteBasePath(sites[0].api || '');
  const unwrappedPayload = unwrapBundlePayload(method, payload, fallbackSiteBasePath);
  const request = routeRequest(method, unwrappedPayload);
  const requestSiteBasePath = unwrappedPayload.siteBasePath || fallbackSiteBasePath;
  const value = await server.injectJson({
    ...request,
    path: `${requestSiteBasePath}${request.path}`,
  });

  return {
    called: true,
    value: wrapBundleResult(method, value, requestSiteBasePath),
  };
}

async function resolveBundleSiteBasePath(app) {
  return normalizeSiteBasePath((await resolveBundleSites(app))[0].api || '');
}

async function resolveBundleSites(app) {
  const config = await app.inject({
    method: 'GET',
    path: '/config',
  });
  const sites = (config?.video?.sites || []).filter((candidate) => candidate?.api);

  if (!sites.length) {
    throw Object.assign(new Error('Bundle plugin did not expose any video sites.'), {
      code: 'PLUGIN_SITE_MISSING',
      statusCode: 422,
    });
  }

  return sites;
}

function selectBundleSite(sites, siteBasePath) {
  const selectedSiteBasePath = normalizeSiteBasePath(siteBasePath || sites[0]?.api || '');
  return (
    sites.find(
      (candidate) => normalizeSiteBasePath(candidate.api || '') === selectedSiteBasePath
    ) || sites[0]
  );
}

function normalizeSiteBasePath(value) {
  return String(value || '').replace(/\/+$/, '');
}

function buildPlainArgs(method, payload) {
  if (method === 'search') {
    return [payload.keyword, false, 1];
  }

  if (method === 'detail') {
    return [payload.id];
  }

  return [payload.flag || '', payload.id || '', []];
}

function routeRequest(method, payload) {
  if (method === 'home' || method === 'sources') {
    return {
      body: {},
      method: 'POST',
      path: method === 'home' ? '/home' : '/config',
    };
  }

  if (method === 'search') {
    return {
      body: {
        page: 1,
        wd: payload.keyword,
      },
      method: 'POST',
      path: '/search',
    };
  }

  if (method === 'category') {
    return {
      body: {
        extend: payload.extend || {},
        filter: true,
        page: payload.page || 1,
        tid: payload.tid || '',
      },
      method: 'POST',
      path: '/category',
    };
  }

  if (method === 'detail') {
    return {
      body: {
        id: payload.id,
      },
      method: 'POST',
      path: '/detail',
    };
  }

  return {
    body: {
      flag: payload.flag || '',
      id: payload.id || '',
    },
    method: 'POST',
    path: '/play',
  };
}

function wrapBundleResult(method, value, siteBasePath, site = null) {
  if (method === 'search') {
    return {
      ...value,
      list: (value?.list || []).slice(0, 30).map((item) => ({
        ...item,
        vod_id: encodeBundleToken(siteBasePath, item?.vod_id),
        source_api: siteBasePath,
        source_key: site?.key || '',
        source_name: site?.name || site?.key || siteBasePath,
      })),
    };
  }

  if (method === 'detail') {
    return {
      ...value,
      list: (value?.list || []).map((item) => ({
        ...item,
        vod_id: encodeBundleToken(siteBasePath, item?.vod_id),
        vod_play_url: wrapPlayUrlTokens(siteBasePath, item?.vod_play_url),
      })),
    };
  }

  return value;
}

async function loadCategoryHomeFallback({ injectJson, site, siteBasePath, value }) {
  if ((value?.list || []).length) {
    return value;
  }

  const firstCategory = Array.isArray(value?.class)
    ? value.class.find((category) => category?.type_id || category?.typeId || category?.id)
    : null;
  const typeId = firstCategory?.type_id || firstCategory?.typeId || firstCategory?.id;

  if (!typeId) {
    return value;
  }

  try {
    const categoryValue = await injectJson({
      ...routeRequest('category', {
        extend: {},
        page: 1,
        tid: typeId,
      }),
      path: `${siteBasePath}/category`,
    });

    return {
      ...value,
      ...categoryValue,
      class: value.class,
      filters: value.filters,
      source_api: siteBasePath,
      source_key: site?.key || '',
      source_name: site?.name || site?.key || siteBasePath,
    };
  } catch {
    return value;
  }
}

function unwrapBundlePayload(method, payload, fallbackSiteBasePath) {
  if (method === 'search') {
    return payload;
  }

  const token = decodeBundleToken(payload?.id);

  if (!token) {
    return {
      ...payload,
      siteBasePath: fallbackSiteBasePath,
    };
  }

  return {
    ...payload,
    id: token.id,
    siteBasePath: token.siteBasePath,
  };
}

function wrapPlayUrlTokens(siteBasePath, playUrl) {
  return String(playUrl || '')
    .split('$$$')
    .map((group) =>
      group
        .split('#')
        .map((episode) => {
          const separatorIndex = episode.indexOf('$');

          if (separatorIndex === -1) {
            return episode;
          }

          return `${episode.slice(0, separatorIndex + 1)}${encodeBundleToken(
            siteBasePath,
            episode.slice(separatorIndex + 1)
          )}`;
        })
        .join('#')
    )
    .join('$$$');
}

function encodeBundleToken(siteBasePath, id) {
  return `catvod:${Buffer.from(
    JSON.stringify({
      id: String(id || ''),
      siteBasePath,
    })
  ).toString('base64url')}`;
}

function decodeBundleToken(value) {
  const text = String(value || '');

  if (!text.startsWith('catvod:')) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(text.slice('catvod:'.length), 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function createMemoryRouter() {
  const routes = new Map();

  return {
    get(path, handler) {
      routes.set(`GET ${path}`, handler);
    },
    post(path, handler) {
      routes.set(`POST ${path}`, handler);
    },
    route(route) {
      const methods = Array.isArray(route.method) ? route.method : [route.method];

      for (const method of methods) {
        routes.set(`${method} ${route.url}`, route.handler);
      }
    },
    async inject({ body, method, path }) {
      const handler = routes.get(`${method} ${path}`);

      if (!handler) {
        throw Object.assign(new Error(`Plugin route ${method} ${path} is missing.`), {
          code: 'PLUGIN_METHOD_MISSING',
          statusCode: 422,
        });
      }

      const reply = createReply();
      const result = await handler(
        {
          body: body || {},
          query: body || {},
          server: this,
        },
        reply
      );

      return reply.sent ? reply.payload : result;
    },
  };
}

function createMemoryCatApp(options = {}) {
  const router = createMemoryRouter();

  router.config = options.config || defaultPluginConfig();
  router.db = createMemoryDb();
  router.server = options.server || createMemoryServer();
  router.stop = false;
  router.addHook = () => router;
  router.address = () => ({
    dynamic: 'js2p://_WEB_',
    url: 'http://127.0.0.1:0',
  });
  router.close = () => {
    router.stop = true;
  };
  router.listen = (_options, callback) => {
    callback?.(null, 'http://127.0.0.1:0');
  };
  router.ready = async () => {};
  router.register = async (plugin, options = {}) => {
    const prefix = normalizePrefix(options.prefix || '');
    const child = createPrefixedRouter(router, prefix);
    await plugin(child, options);
    return router;
  };

  return router;
}

function createPrefixedRouter(root, prefix) {
  return {
    get(path, handler) {
      root.get(`${prefix}${normalizeRoutePath(path)}`, handler);
    },
    post(path, handler) {
      root.post(`${prefix}${normalizeRoutePath(path)}`, handler);
    },
    route(route) {
      root.route({
        ...route,
        url: `${prefix}${normalizeRoutePath(route.url)}`,
      });
    },
    register(plugin, options = {}) {
      const nextPrefix = `${prefix}${normalizePrefix(options.prefix || '')}`;
      return plugin(createPrefixedRouter(root, nextPrefix), options);
    },
    get config() {
      return root.config;
    },
    get db() {
      return root.db;
    },
    get server() {
      return root;
    },
    get stop() {
      return root.stop;
    },
  };
}

function createMemoryServer(handler = null) {
  const listeners = new Map();

  return {
    address: () => ({
      address: '127.0.0.1',
      family: 'IPv4',
      port: 0,
    }),
    close(callback) {
      callback?.();
    },
    closeAllConnections() {},
    closeIdleConnections() {},
    emit(event, ...args) {
      for (const listener of listeners.get(event) || []) {
        listener(...args);
      }

      return true;
    },
    listen(_options, callback) {
      callback?.(null, 'http://127.0.0.1:0');
      return this;
    },
    off(event, listener) {
      const current = listeners.get(event) || [];
      listeners.set(
        event,
        current.filter((item) => item !== listener)
      );
      return this;
    },
    on(event, listener) {
      listeners.set(event, [...(listeners.get(event) || []), listener]);
      return this;
    },
    once(event, listener) {
      const wrapped = (...args) => {
        this.off(event, wrapped);
        listener(...args);
      };

      return this.on(event, wrapped);
    },
    setTimeout() {
      return this;
    },
    async injectJson(request) {
      if (typeof handler !== 'function') {
        throw Object.assign(new Error('Plugin server handler is missing.'), {
          code: 'PLUGIN_METHOD_MISSING',
          statusCode: 422,
        });
      }

      const response = await injectServerHandler(handler, request);

      if (response.statusCode >= 400) {
        throw normalizeHandlerError(response);
      }

      return response.body ? JSON.parse(response.body) : {};
    },
  };
}

function normalizeHandlerError(response) {
  const payload = parseJsonSafe(response.body);
  const message = payload?.message || response.body || `HTTP ${response.statusCode}`;

  if (response.statusCode >= 500) {
    return Object.assign(new Error(message), {
      code: 'PLUGIN_SITE_INCOMPATIBLE',
      statusCode: 422,
    });
  }

  return Object.assign(new Error(message), {
    code: 'PLUGIN_SERVER_HANDLER_FAILED',
    statusCode: response.statusCode,
  });
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(String(text || ''));
  } catch {
    return null;
  }
}

function injectServerHandler(handler, request) {
  return new Promise((resolve, reject) => {
    const rawRequest = new MemoryRawRequest(request);
    const rawResponse = new MemoryRawResponse(resolve);

    try {
      handler(rawRequest, rawResponse);
    } catch (error) {
      reject(error);
    }
  });
}

class MemoryRawRequest {
  constructor({ body, method, path }) {
    this.body = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
    this.headers = {
      'content-type': 'application/json',
    };
    this.method = method;
    this.raw = this;
    this.encoding = null;
    this.url = path;
    this.listeners = {};
  }

  on(event, listener) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(listener);

    if (event === 'end') {
      queueMicrotask(() => {
        if (this.body.length) {
          this.emit('data', this.encoding ? this.body.toString(this.encoding) : this.body);
        }

        this.emit('end');
      });
    }

    return this;
  }

  emit(event, ...args) {
    for (const listener of this.listeners[event] || []) {
      listener(...args);
    }
  }

  off(event, listener) {
    return this.removeListener(event, listener);
  }

  removeListener(event, listener) {
    const current = this.listeners[event] || [];
    this.listeners[event] = current.filter((item) => item !== listener);
    return this;
  }

  resume() {
    return this;
  }

  setEncoding(encoding) {
    this.encoding = encoding;
    return this;
  }
}

class MemoryRawResponse {
  constructor(resolve) {
    this.body = '';
    this.headers = {};
    this.headersSent = false;
    this.listeners = {};
    this.resolve = resolve;
    this.statusCode = 200;
  }

  addTrailers() {}

  destroy() {
    this.emit('close');
  }

  end(body = '') {
    this.body += String(body || '');
    this.headersSent = true;
    this.emit('finish');
    this.resolve({
      body: this.body,
      headers: this.headers,
      statusCode: this.statusCode,
    });
  }

  off(event, listener) {
    return this.removeListener(event, listener);
  }

  on(event, listener) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(listener);
    return this;
  }

  once(event, listener) {
    const wrapped = (...args) => {
      this.removeListener(event, wrapped);
      listener(...args);
    };

    return this.on(event, wrapped);
  }

  emit(event, ...args) {
    for (const listener of this.listeners[event] || []) {
      listener(...args);
    }
  }

  getHeader(name) {
    return this.headers[String(name).toLowerCase()];
  }

  getHeaders() {
    return { ...this.headers };
  }

  hasHeader(name) {
    return Object.prototype.hasOwnProperty.call(this.headers, String(name).toLowerCase());
  }

  removeHeader(name) {
    delete this.headers[String(name).toLowerCase()];
  }

  removeListener(event, listener) {
    const current = this.listeners[event] || [];
    this.listeners[event] = current.filter((item) => item !== listener);
    return this;
  }

  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = value;
  }

  write(chunk) {
    this.headersSent = true;
    this.body += String(chunk || '');
    return true;
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;

    for (const [name, value] of Object.entries(headers)) {
      this.setHeader(name, value);
    }

    this.headersSent = true;
    return this;
  }
}

function normalizePrefix(value) {
  const cleanValue = String(value || '').trim();

  if (!cleanValue) {
    return '';
  }

  return `/${cleanValue.replace(/^\/+|\/+$/g, '')}`;
}

function normalizeRoutePath(value) {
  const cleanValue = String(value || '').trim();

  if (!cleanValue || cleanValue === '/') {
    return '';
  }

  return `/${cleanValue.replace(/^\/+|\/+$/g, '')}`;
}

function createMemoryDb() {
  const data = {};

  return {
    async delete(path) {
      setPath(data, path, undefined, true);
    },
    async getData(path) {
      const value = getPath(data, path);

      if (value === undefined) {
        throw new Error(`Can't find dataPath: ${path}`);
      }

      return value;
    },
    async getObjectDefault(path, defaultValue) {
      const value = getPath(data, path);
      return value === undefined ? defaultValue : value;
    },
    async push(path, value) {
      setPath(data, path, value);
    },
  };
}

function getPath(target, path) {
  const parts = String(path || '')
    .split('/')
    .filter(Boolean);
  let cursor = target;

  for (const part of parts) {
    if (!cursor || !Object.prototype.hasOwnProperty.call(cursor, part)) {
      return undefined;
    }

    cursor = cursor[part];
  }

  return cursor;
}

function setPath(target, path, value, shouldDelete = false) {
  const parts = String(path || '')
    .split('/')
    .filter(Boolean);
  let cursor = target;

  for (const part of parts.slice(0, -1)) {
    cursor[part] = cursor[part] || {};
    cursor = cursor[part];
  }

  const lastPart = parts.at(-1);

  if (!lastPart) {
    return;
  }

  if (shouldDelete) {
    delete cursor[lastPart];
    return;
  }

  cursor[lastPart] = value;
}

function defaultPluginConfig() {
  return {
    ali: {
      token: '',
      token280: '',
    },
    color: [],
    leijing: {},
    livetovod: {},
    muou: {},
    pans: {
      list: [],
    },
    sites: {
      list: [],
    },
    tgchannel: {},
    tgsou: {},
    uc: {
      refreshtoken: '',
      token: '',
    },
    wogg: {},
    wuming: {},
    y115: {
      cookie: '',
    },
  };
}

function createReply() {
  return {
    headersMap: {},
    payload: undefined,
    raw: {
      end() {},
      off() {},
      on() {},
      once() {},
      write() {
        return true;
      },
    },
    sent: false,
    header(name, value) {
      this.headersMap[String(name).toLowerCase()] = value;
      return this;
    },
    headers(values) {
      for (const [name, value] of Object.entries(values || {})) {
        this.header(name, value);
      }

      return this;
    },
    code() {
      return this;
    },
    send(value) {
      this.payload = value;
      this.sent = true;
      return value;
    },
    type(value) {
      return this.header('content-type', value);
    },
  };
}

function memoryStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.get(String(key)) || null;
    },
    removeItem(key) {
      values.delete(String(key));
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
  };
}

function classifyError(error) {
  if (/catServerFactory is not defined/.test(error?.message || '')) {
    return 'PLUGIN_HOST_MISSING';
  }

  return error?.code || 'PLUGIN_EXECUTION_FAILED';
}

function normalizeTimeoutMs(value, fallback) {
  const timeout = Number(value);

  if (Number.isFinite(timeout) && timeout > 0) {
    return timeout;
  }

  return fallback;
}
