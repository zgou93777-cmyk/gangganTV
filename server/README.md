# Ganggan Plugin Parser

Server-side CatVod parser for sources that cannot safely run inside the iOS app.

## Local Run

```bash
npm --prefix server test
$env:PLUGIN_SERVER_TOKEN="change-me"
$env:PLUGIN_SCRIPT_TIMEOUT_MS="20000"
$env:PORT="3000"
npm --prefix server start
```

Health check:

```bash
curl http://127.0.0.1:3000/health
```

## Docker

```bash
docker build -t ganggan-plugin-parser ./server
docker run -d --name ganggan-plugin-parser \
  -p 3000:3000 \
  -e PLUGIN_SERVER_TOKEN=change-me \
  -e PLUGIN_SCRIPT_TIMEOUT_MS=20000 \
  --restart unless-stopped \
  ganggan-plugin-parser
```

In the app settings, set:

- Parser URL: `http://YOUR_SERVER_IP:3000`
- Token: the same `PLUGIN_SERVER_TOKEN`

Use HTTPS or a private network before wider distribution. Do not commit tokens.

## Current Compatibility

- Plain CatVod scripts with `search/detail/play` functions.
- Fastify-style scripts exporting an `api(app)` route installer.
- Magic-player bundles can run through the server-side host shim for search/detail/play.
- Some third-party routes still require account cookies or site-specific credentials; those return clear compatibility errors instead of crashing the app.
