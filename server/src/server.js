const http = require('node:http');

const {
  CatVodRunner,
} = require('./catvod-runner');
const {
  TvBoxRunner,
} = require('./tvbox-runner');

const JSON_HEADERS = {
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-origin': '*',
  'content-type': 'application/json; charset=utf-8',
};

function createParserServer(options = {}) {
  const token = String(options.token || '').trim();
  const runner = options.runner || new CatVodRunner(options.runnerOptions);
  const tvBoxRunner =
    options.tvBoxRunner || new TvBoxRunner(options.tvBoxRunnerOptions);
  const routes = new Map();

  routes.set('GET /health', async () => ({
    capabilities: {
      catvod: true,
      tvboxRoutes: true,
      tvboxRuntime: Boolean(
        tvBoxRunner?.runtime &&
          typeof tvBoxRunner.runtime.search === 'function' &&
          typeof tvBoxRunner.runtime.detail === 'function' &&
          typeof tvBoxRunner.runtime.play === 'function'
      ),
    },
    ok: true,
    service: 'ganggan-plugin-parser',
  }));
  routes.set('POST /catvod/search', withAuth(token, async (request) =>
    runner.search({
      keyword: String(request.body?.keyword || request.body?.wd || '').trim(),
      ...(request.body?.siteBasePath ? { siteBasePath: request.body.siteBasePath } : {}),
      scriptUrl: request.body?.scriptUrl,
    })
  ));
  routes.set('POST /catvod/sources', withAuth(token, async (request) =>
    runner.sources({
      scriptUrl: request.body?.scriptUrl,
    })
  ));
  routes.set('POST /catvod/home', withAuth(token, async (request) =>
    runner.home({
      scriptUrl: request.body?.scriptUrl,
      siteBasePath: request.body?.siteBasePath,
    })
  ));
  routes.set('POST /catvod/detail', withAuth(token, async (request) =>
    runner.detail({
      id: request.body?.id,
      scriptUrl: request.body?.scriptUrl,
    })
  ));
  routes.set('POST /catvod/play', withAuth(token, async (request) =>
    runner.play({
      flag: request.body?.flag,
      id: request.body?.id,
      scriptUrl: request.body?.scriptUrl,
    })
  ));
  routes.set('POST /tvbox/search', withAuth(token, async (request) =>
    tvBoxRunner.search(request.body || {})
  ));
  routes.set('POST /tvbox/detail', withAuth(token, async (request) =>
    tvBoxRunner.detail(request.body || {})
  ));
  routes.set('POST /tvbox/play', withAuth(token, async (request) =>
    tvBoxRunner.play(request.body || {})
  ));

  async function handle(rawRequest, rawResponse) {
    if (rawRequest.method === 'OPTIONS') {
      sendJson(rawResponse, 204, null);
      return;
    }

    const url = new URL(rawRequest.url || '/', 'http://localhost');
    const route = routes.get(`${rawRequest.method} ${url.pathname}`);

    if (!route) {
      sendJson(rawResponse, 404, {
        error: 'not_found',
        message: 'Route not found.',
      });
      return;
    }

    try {
      const body = rawRequest.method === 'POST' ? await readJsonBody(rawRequest) : null;
      const result = await route({
        body,
        headers: rawRequest.headers || {},
        method: rawRequest.method,
        path: url.pathname,
      });
      sendJson(rawResponse, 200, result);
    } catch (error) {
      const statusCode = normalizeStatusCode(error?.statusCode || error?.status);
      sendJson(rawResponse, statusCode, {
        error: error?.code || 'parser_error',
        message: error?.message || 'Plugin parser request failed.',
      });
    }
  }

  return {
    inject(request) {
      return inject(handle, request);
    },
    listen(port, host = '0.0.0.0') {
      const server = http.createServer(handle);
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve(server);
        });
      });
    },
  };
}

function withAuth(token, handler) {
  return async (request) => {
    if (token && !isAuthorized(request.headers, token)) {
      throw Object.assign(new Error('Plugin parser token is missing or invalid.'), {
        code: 'unauthorized',
        statusCode: 401,
      });
    }

    return handler(request);
  };
}

function isAuthorized(headers, token) {
  const authorization = headers?.authorization || headers?.Authorization || '';
  return authorization === `Bearer ${token}`;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => {
      chunks.push(chunk);
    });
    request.on('error', reject);
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();

      if (!text) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(text));
      } catch {
        reject(
          Object.assign(new Error('Request body must be valid JSON.'), {
            code: 'invalid_json',
            statusCode: 400,
          })
        );
      }
    });
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, JSON_HEADERS);

  if (statusCode === 204) {
    response.end();
    return;
  }

  response.end(JSON.stringify(payload));
}

function normalizeStatusCode(value) {
  const statusCode = Number(value);

  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599) {
    return statusCode;
  }

  return 500;
}

function inject(handler, request) {
  return new Promise((resolve) => {
    const headers = normalizeHeaders(request.headers || {});
    const body = request.body === undefined ? '' : JSON.stringify(request.body);
    const rawRequest = new MemoryRequest({
      body,
      headers,
      method: request.method || 'GET',
      url: request.path || request.url || '/',
    });
    const rawResponse = new MemoryResponse(resolve);

    handler(rawRequest, rawResponse);
  });
}

class MemoryRequest {
  constructor({ body, headers, method, url }) {
    this.body = Buffer.from(body);
    this.headers = headers;
    this.method = method;
    this.url = url;
    this.listeners = {};
  }

  on(event, listener) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(listener);

    if (event === 'end') {
      queueMicrotask(() => {
        if (this.body.length) {
          this.emit('data', this.body);
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
}

class MemoryResponse {
  constructor(resolve) {
    this.headers = {};
    this.resolve = resolve;
    this.statusCode = 200;
  }

  writeHead(statusCode, headers) {
    this.statusCode = statusCode;
    this.headers = headers || {};
  }

  end(body = '') {
    const text = String(body || '');
    this.resolve({
      headers: this.headers,
      json: () => (text ? JSON.parse(text) : null),
      statusCode: this.statusCode,
      text: () => text,
    });
  }
}

function normalizeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
}

module.exports = {
  createParserServer,
};
