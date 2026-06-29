const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createParserServerOptions,
} = require('../src/index');
const {
  CatVodRunner,
} = require('../src/catvod-runner');

test('createParserServerOptions maps parser timeout environment variables', () => {
  const options = createParserServerOptions({
    PLUGIN_EXECUTION_TIMEOUT_MS: '60000',
    PLUGIN_SCRIPT_TIMEOUT_MS: '20000',
    PLUGIN_SERVER_TOKEN: 'secret-token',
  });

  assert.deepEqual(options, {
    runnerOptions: {
      scriptTimeoutMs: 20000,
      timeoutMs: 60000,
    },
    token: 'secret-token',
  });
});

test('CatVodRunner defaults allow slower multi-source plugin searches', () => {
  const runner = new CatVodRunner({
    fetchText: async () => 'module.exports = {};',
  });

  assert.equal(runner.timeoutMs, 120000);
  assert.equal(runner.scriptTimeoutMs, 30000);
});
