const {
  createParserServer,
} = require('./server');

async function main() {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  const server = createParserServer({
    runnerOptions: {
      scriptTimeoutMs: process.env.PLUGIN_SCRIPT_TIMEOUT_MS,
    },
    token: process.env.PLUGIN_SERVER_TOKEN || '',
  });

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
  main,
};
