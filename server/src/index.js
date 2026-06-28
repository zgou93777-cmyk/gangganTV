const {
  createParserServer,
} = require('./server');

async function main() {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  const server = createParserServer(createParserServerOptions(process.env));

  await server.listen(port, host);
  console.log(`ganggan plugin parser listening on http://${host}:${port}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  createParserServerOptions,
  main,
};

function createParserServerOptions(env) {
  return {
    runnerOptions: {
      scriptTimeoutMs: normalizeOptionalNumber(env.PLUGIN_SCRIPT_TIMEOUT_MS),
      timeoutMs: normalizeOptionalNumber(env.PLUGIN_EXECUTION_TIMEOUT_MS),
    },
    token: env.PLUGIN_SERVER_TOKEN || '',
  };
}

function normalizeOptionalNumber(value) {
  const number = Number(value);

  if (Number.isFinite(number) && number > 0) {
    return number;
  }

  return undefined;
}
