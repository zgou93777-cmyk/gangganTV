# Ganggan Local Parser

Local parser for sources that cannot safely run inside Expo Go or the iOS app.
Run it on the same Windows computer as development, then let the iPhone connect
through the local network.

## Local Run

```bash
npm --prefix server test
$env:PLUGIN_SERVER_TOKEN="change-me"
$env:PLUGIN_EXECUTION_TIMEOUT_MS="60000"
$env:PLUGIN_SCRIPT_TIMEOUT_MS="20000"
$env:PORT="3000"
npm --prefix server start
```

Health check:

```bash
curl http://127.0.0.1:3000/health
```

From the iPhone, use the computer LAN address, for example:

```text
http://192.168.220.41:3000
```

The health response includes capability flags:

```json
{
  "ok": true,
  "service": "ganggan-plugin-parser",
  "capabilities": {
    "catvod": true,
    "tvboxRoutes": true,
    "tvboxRuntime": false
  }
}
```

`tvboxRoutes: true` means the HTTP API exists. `tvboxRuntime: false` means
the Android TVBox Spider/JAR runtime is not connected yet, so `csp_*` sources
can be imported and listed but cannot actually search/play through Spider yet.

## App Settings

For local Expo Go testing, keep the parser on this computer:

1. Start the parser with `npm --prefix server start`.
2. In the app settings, tap "使用本机解析器地址" or enter the LAN URL manually.
3. Leave Token empty unless `PLUGIN_SERVER_TOKEN` was set before starting the parser.
4. Tap "导入 CatVod 测试源" to add
   `http://wexfnw:wexfnw@cat.999888987.xyz/index.js.md5`.

This CatVod mirror has been verified locally for search and detail retrieval.
The OK影视 root URLs such as `http://tv.999888987.xyz/` and
`http://new.999888987.xyz/` also resolve to TVBox JSON configs, but their sites
are Android `csp_*` Spider/JAR entries. They can be imported and listed before
the Spider runtime exists, but search/play is expected to stay disabled until
`tvboxRuntime` becomes `true`.

Some CatVod play lines are netdisk resources and may time out or require account
capabilities, so a timeout from `/catvod/play` does not mean the video player is
broken.

## Docker

```bash
docker build -t ganggan-plugin-parser ./server
docker run -d --name ganggan-plugin-parser \
  -p 3000:3000 \
  -e PLUGIN_SERVER_TOKEN=change-me \
  -e PLUGIN_EXECUTION_TIMEOUT_MS=60000 \
  -e PLUGIN_SCRIPT_TIMEOUT_MS=20000 \
  --restart unless-stopped \
  ganggan-plugin-parser
```

In the app settings, set:

- Parser URL: `http://YOUR_COMPUTER_LAN_IP:3000`
- Token: the same `PLUGIN_SERVER_TOKEN`

Use the local network for development. Do not deploy to a slow public server for
daily testing unless a real remote runtime is needed.

## Current Compatibility

- Plain CatVod scripts with `search/detail/play` functions.
- Fastify-style scripts exporting an `api(app)` route installer.
- Magic-player bundles can run through the server-side host shim for search/detail/play.
- TVBox `/tvbox/search`, `/tvbox/detail`, and `/tvbox/play` facade routes.
- TVBox `csp_*` Spider/JAR sources still need a local Android/Dex runtime. The
  Wex/OK影视 configs tested so far are `classes.dex` plus Android guard assets,
  not ordinary JavaScript.
- Some third-party routes still require account cookies or site-specific credentials; those return clear compatibility errors instead of crashing the app.
