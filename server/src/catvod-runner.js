const { fork } = require('node:child_process');
const path = require('node:path');

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_SCRIPT_TIMEOUT_MS = 5_000;

class CatVodRunner {
  constructor(options = {}) {
    this.fetchText = options.fetchText || fetchText;
    this.scriptCache = options.scriptCache || new Map();
    this.scriptTimeoutMs = normalizeTimeoutMs(
      options.scriptTimeoutMs,
      DEFAULT_SCRIPT_TIMEOUT_MS
    );
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  }

  async search(payload) {
    return this.call('search', payload);
  }

  async sources(payload) {
    return this.call('sources', payload);
  }

  async home(payload) {
    return this.call('home', payload);
  }

  async category(payload) {
    return this.call('category', payload);
  }

  async detail(payload) {
    return this.call('detail', payload);
  }

  async play(payload) {
    return this.call('play', payload);
  }

  async call(method, payload) {
    const script = await resolveExecutableScript(payload?.scriptUrl, {
      cache: this.scriptCache,
      fetchText: this.fetchText,
    });

    return runWorker({
      method,
      payload: {
        ...payload,
        scriptUrl: script.url,
      },
      scriptText: script.text,
      scriptTimeoutMs: this.scriptTimeoutMs,
      timeoutMs: this.timeoutMs,
    });
  }
}

async function resolveExecutableScriptUrl(scriptUrl, { fetchText: fetchTextImpl = fetchText } = {}) {
  const script = await resolveExecutableScript(scriptUrl, {
    fetchText: fetchTextImpl,
  });

  return script.url;
}

async function resolveExecutableScript(
  scriptUrl,
  { cache = null, fetchText: fetchTextImpl = fetchText } = {}
) {
  const requestUrl = normalizePluginRequestUrl(scriptUrl, 'scriptUrl');
  const cleanUrl = requestUrl.url;
  const cachedScript = cache?.get(cleanUrl);

  if (cachedScript) {
    return cachedScript;
  }

  const requestOptions = buildFetchTextOptions(requestUrl);
  const text = await fetchTextImpl(cleanUrl, requestOptions);

  assertExecutableScriptText(text);

  if (!isMd5HashText(text)) {
    const script = {
      text,
      url: cleanUrl,
    };
    cache?.set(cleanUrl, script);
    return script;
  }

  if (cleanUrl.toLowerCase().endsWith('.md5')) {
    const candidateUrl = cleanUrl.slice(0, -4);
    const cachedCandidate = cache?.get(candidateUrl);

    if (cachedCandidate) {
      cache?.set(cleanUrl, cachedCandidate);
      return cachedCandidate;
    }

    const candidateText = await fetchTextImpl(candidateUrl, requestOptions);

    assertExecutableScriptText(candidateText);

    if (!isMd5HashText(candidateText)) {
      const script = {
        text: candidateText,
        url: candidateUrl,
      };
      cache?.set(cleanUrl, script);
      cache?.set(candidateUrl, script);
      return script;
    }
  }

  throw Object.assign(new Error('The plugin manifest only returned an MD5 hash.'), {
    code: 'PLUGIN_MANIFEST_ONLY',
    statusCode: 422,
  });
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/plain, application/javascript;q=0.9, */*;q=0.8',
      'User-Agent': 'okhttp/4.10.0',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw Object.assign(new Error(`HTTP ${response.status}`), {
      code: 'PLUGIN_DOWNLOAD_FAILED',
      statusCode: 502,
    });
  }

  return response.text();
}

function runWorker({ method, payload, scriptText, scriptTimeoutMs, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, 'catvod-worker.js');
    const child = fork(workerPath, [], {
      execArgv: [],
      serialization: 'json',
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      windowsHide: true,
    });
    let settled = false;
    let stderr = '';
    const timer = setTimeout(() => {
      finish(
        Object.assign(new Error('Plugin execution timed out.'), {
          code: 'PLUGIN_TIMEOUT',
          statusCode: 504,
        })
      );
    }, timeoutMs);

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('message', (message) => {
      if (message?.ok) {
        finish(null, message.value);
        return;
      }

      finish(
        Object.assign(new Error(message?.message || stderr || 'Plugin execution failed.'), {
          code: message?.code || 'PLUGIN_EXECUTION_FAILED',
          stack: message?.stack,
          statusCode: message?.statusCode || 500,
        })
      );
    });
    child.on('error', finish);
    child.on('exit', (code) => {
      if (!settled && code !== 0) {
        finish(
          Object.assign(new Error(stderr.trim() || `Plugin worker exited with code ${code}.`), {
            code: 'PLUGIN_WORKER_EXITED',
            statusCode: 500,
          })
        );
      }
    });
    child.send({
      method,
      payload,
      scriptText,
      scriptTimeoutMs,
    });

    function finish(error, value) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      child.kill();

      if (error) {
        reject(error);
        return;
      }

      resolve(value);
    }
  });
}

function normalizeHttpUrl(value, fieldName) {
  const cleanValue = String(value || '').trim();

  if (!/^https?:\/\//i.test(cleanValue)) {
    throw Object.assign(new Error(`${fieldName} must start with http:// or https://.`), {
      code: 'INVALID_PLUGIN_URL',
      statusCode: 400,
    });
  }

  return cleanValue;
}

function normalizePluginRequestUrl(value, fieldName) {
  const cleanValue = normalizeHttpUrl(value, fieldName);

  try {
    const parsedUrl = new URL(cleanValue);
    const username = parsedUrl.username;
    const password = parsedUrl.password;
    let authorization = '';

    if (username || password) {
      authorization = `Basic ${Buffer.from(
        `${decodeURIComponent(username)}:${decodeURIComponent(password)}`
      ).toString('base64')}`;
      parsedUrl.username = '';
      parsedUrl.password = '';
    }

    return {
      authorization,
      url: parsedUrl.toString(),
    };
  } catch {
    return {
      authorization: '',
      url: cleanValue,
    };
  }
}

function buildFetchTextOptions(requestUrl) {
  if (!requestUrl?.authorization) {
    return undefined;
  }

  return {
    headers: {
      Authorization: requestUrl.authorization,
    },
  };
}

function isMd5HashText(value) {
  return /^[a-f0-9]{32}$/i.test(String(value || '').trim());
}

function assertExecutableScriptText(value) {
  const tvBoxConfig = parseTvBoxConfigText(value);

  if (tvBoxConfig) {
    const spider = String(tvBoxConfig.spider || '').toLowerCase();
    const sites = Array.isArray(tvBoxConfig.sites) ? tvBoxConfig.sites : [];
    const hasCspSites = sites.some((site) => {
      const api = String(site?.api || '').trim();
      return Number(site?.type) === 3 || /^csp_/i.test(api);
    });

    if (spider.includes('.jar') || hasCspSites) {
      throw Object.assign(
        new Error('TVBox/OK JSON configs that depend on JAR/CSP plugins are not supported by the JS parser yet.'),
        {
          code: 'PLUGIN_CONFIG_UNSUPPORTED',
          statusCode: 422,
        }
      );
    }
  }
}

function parseTvBoxConfigText(value) {
  const text = String(value || '').trim();

  if (!text || (text[0] !== '{' && text[0] !== '[')) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.sites)) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeTimeoutMs(value, fallback) {
  const timeout = Number(value);

  if (Number.isFinite(timeout) && timeout > 0) {
    return timeout;
  }

  return fallback;
}

module.exports = {
  CatVodRunner,
  resolveExecutableScript,
  resolveExecutableScriptUrl,
};
