const { fork } = require('node:child_process');
const path = require('node:path');

const DEFAULT_TIMEOUT_MS = 15_000;

class CatVodRunner {
  constructor(options = {}) {
    this.fetchText = options.fetchText || fetchText;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  }

  async search(payload) {
    return this.call('search', payload);
  }

  async detail(payload) {
    return this.call('detail', payload);
  }

  async play(payload) {
    return this.call('play', payload);
  }

  async call(method, payload) {
    const scriptUrl = await resolveExecutableScriptUrl(payload?.scriptUrl, {
      fetchText: this.fetchText,
    });
    const scriptText = await this.fetchText(scriptUrl);

    return runWorker({
      method,
      payload: {
        ...payload,
        scriptUrl,
      },
      scriptText,
      timeoutMs: this.timeoutMs,
    });
  }
}

async function resolveExecutableScriptUrl(scriptUrl, { fetchText: fetchTextImpl = fetchText } = {}) {
  const cleanUrl = normalizeHttpUrl(scriptUrl, 'scriptUrl');
  const text = await fetchTextImpl(cleanUrl);

  if (!isMd5HashText(text)) {
    return cleanUrl;
  }

  if (cleanUrl.toLowerCase().endsWith('.md5')) {
    const candidateUrl = cleanUrl.slice(0, -4);
    const candidateText = await fetchTextImpl(candidateUrl);

    if (!isMd5HashText(candidateText)) {
      return candidateUrl;
    }
  }

  throw Object.assign(new Error('The plugin manifest only returned an MD5 hash.'), {
    code: 'PLUGIN_MANIFEST_ONLY',
    statusCode: 422,
  });
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/plain, application/javascript;q=0.9, */*;q=0.8',
      'User-Agent': 'okhttp/4.10.0',
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

function runWorker({ method, payload, scriptText, timeoutMs }) {
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

function isMd5HashText(value) {
  return /^[a-f0-9]{32}$/i.test(String(value || '').trim());
}

module.exports = {
  CatVodRunner,
  resolveExecutableScriptUrl,
};
