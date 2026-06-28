const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createParserServerOptions,
} = require('../src/index');

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
