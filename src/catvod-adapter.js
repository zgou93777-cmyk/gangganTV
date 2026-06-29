const {
  extractPlayableUrl,
  isValidHttpUrl,
  normalizeDetailResponse,
  normalizeSearchResponse,
} = require('./iptv-core');

function normalizeCatVodSearchResult(payload) {
  const parsed = parseMaybeJson(payload);
  const normalizedResults = normalizeSearchResponse(parsed);
  const rawList = Array.isArray(parsed?.list) ? parsed.list : [];

  return normalizedResults.map((result, index) => {
    const rawItem = rawList[index] || {};
    const sourceId = readableText(
      rawItem.source_key || rawItem.source_api || rawItem.source_name
    );
    const sourceName = readableText(rawItem.source_name || rawItem.source_key);
    const sourceApi = readableText(rawItem.source_api);

    return {
      ...result,
      poster: normalizeCatVodImageUrl(result.poster),
      ...(sourceId ? { sourceId } : {}),
      ...(sourceName ? { sourceName } : {}),
      ...(sourceApi ? { sourceApi } : {}),
    };
  });
}

function normalizeCatVodImageUrl(value) {
  const cleanValue = readableText(value);

  if (!cleanValue) {
    return '';
  }

  try {
    const parsedUrl = new URL(cleanValue);
    const proxiedUrl = parsedUrl.searchParams.get('url');

    if (parsedUrl.pathname.includes('/imageProxy') && isValidHttpUrl(proxiedUrl || '')) {
      return proxiedUrl.trim();
    }
  } catch {
    return cleanValue;
  }

  return cleanValue;
}

function normalizeCatVodDetailResult(payload) {
  return normalizeDetailResponse(parseMaybeJson(payload));
}

function normalizeCatVodPlayResult(payload) {
  const parsed = parseMaybeJson(payload);

  if (isValidHttpUrl(parsed)) {
    return parsed.trim();
  }

  return extractPlayableUrl(parsed);
}

function buildCatVodExecutorHtml(scriptText) {
  const safeScriptText = escapeScriptText(scriptText);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <script>
    (function () {
      const pendingRequests = new Map();
      let nextRequestId = 1;

      function send(payload) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }

      window.__CATVOD_BRIDGE__ = {
        fetchText: function (url, options) {
          const id = String(nextRequestId++);
          send({ type: 'fetch-text', id, url: String(url || ''), options: options || {} });
          return new Promise(function (resolve, reject) {
            pendingRequests.set(id, { resolve, reject });
          });
        },
        resolveFetch: function (id, payload) {
          const pending = pendingRequests.get(String(id));
          if (!pending) return;
          pendingRequests.delete(String(id));
          if (payload && payload.error) {
            pending.reject(new Error(payload.error));
            return;
          }
          pending.resolve(payload ? payload.text : '');
        },
        run: async function (id, method, args) {
          try {
            const fn = window[method] || (window.__jsEvalReturn && window.__jsEvalReturn[method]);
            if (typeof fn !== 'function') {
              throw new Error('插件没有提供 ' + method + ' 方法');
            }
            const value = await fn.apply(null, Array.isArray(args) ? args : []);
            send({ type: 'result', id, ok: true, value });
          } catch (error) {
            send({
              type: 'result',
              id,
              ok: false,
              error: error && error.message ? error.message : String(error),
            });
          }
        },
      };

      window.fetch = async function (url, options) {
        const text = await window.__CATVOD_BRIDGE__.fetchText(url, options);
        return {
          ok: true,
          status: 200,
          text: async function () { return text; },
          json: async function () { return JSON.parse(text); },
        };
      };
      window.req = async function (url, options) {
        return window.__CATVOD_BRIDGE__.fetchText(url, options);
      };
    })();
  </script>
  <script>
    window.__jsEvalReturn = (function () {
      ${safeScriptText}
      return {
        init: typeof init === 'function' ? init : undefined,
        home: typeof home === 'function' ? home : undefined,
        search: typeof search === 'function' ? search : undefined,
        detail: typeof detail === 'function' ? detail : undefined,
        play: typeof play === 'function' ? play : undefined,
      };
    })();
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
  </script>
</body>
</html>`;
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const cleanValue = value.trim();

  if (!cleanValue) {
    return value;
  }

  try {
    return JSON.parse(cleanValue);
  } catch {
    return value;
  }
}

function escapeScriptText(value) {
  return String(value || '').replace(/<\/script/gi, '<\\/script');
}

function readableText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

module.exports = {
  buildCatVodExecutorHtml,
  normalizeCatVodDetailResult,
  normalizeCatVodPlayResult,
  normalizeCatVodSearchResult,
};
