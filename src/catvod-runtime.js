class CatVodRuntimeController {
  constructor({
    fetchText = defaultFetchText,
    injectJavaScript,
    timeoutMs = 15000,
  } = {}) {
    this.fetchText = fetchText;
    this.injectJavaScript = injectJavaScript;
    this.timeoutMs = timeoutMs;
    this.nextCallId = 1;
    this.pendingCalls = new Map();
  }

  call(method, args = []) {
    if (typeof this.injectJavaScript !== 'function') {
      return Promise.reject(new Error('CatVod 执行器尚未准备好'));
    }

    const id = `catvod-call-${this.nextCallId++}`;
    const payload = JSON.stringify([id, method, args]);
    const script = `window.__CATVOD_BRIDGE__.run.apply(null, ${payload}); true;`;

    this.injectJavaScript(script);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCalls.delete(id);
        reject(new Error('插件执行超时'));
      }, this.timeoutMs);

      this.pendingCalls.set(id, {
        reject,
        resolve,
        timer,
      });
    });
  }

  async handleMessage(message) {
    const payload = parseMessage(message);

    if (!payload) {
      return null;
    }

    if (payload.type === 'result') {
      this.resolveCall(payload);
      return payload;
    }

    if (payload.type === 'fetch-text') {
      await this.resolveFetchText(payload);
      return payload;
    }

    return payload;
  }

  resolveCall(payload) {
    const pending = this.pendingCalls.get(String(payload.id));

    if (!pending) {
      return;
    }

    this.pendingCalls.delete(String(payload.id));
    clearTimeout(pending.timer);

    if (payload.ok) {
      pending.resolve(payload.value);
      return;
    }

    pending.reject(new Error(payload.error || '插件执行失败'));
  }

  async resolveFetchText(payload) {
    let responsePayload;

    try {
      const text = await this.fetchText(payload.url, payload.options || {});
      responsePayload = {
        text,
      };
    } catch (error) {
      responsePayload = {
        error: error?.message || '插件网络请求失败',
      };
    }

    this.injectJavaScript(
      `window.__CATVOD_BRIDGE__.resolveFetch(${JSON.stringify(
        String(payload.id)
      )}, ${JSON.stringify(responsePayload)}); true;`
    );
  }
}

async function defaultFetchText(url, options = {}) {
  const response = await fetch(url, {
    headers: options.headers || {},
    method: options.method || 'GET',
  });

  if (!response.ok) {
    throw new Error(`请求失败：HTTP ${response.status}`);
  }

  return response.text();
}

function parseMessage(message) {
  try {
    return JSON.parse(String(message));
  } catch {
    return null;
  }
}

module.exports = {
  CatVodRuntimeController,
};
