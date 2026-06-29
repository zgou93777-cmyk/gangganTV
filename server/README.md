# Ganggan Remote Parser

This service runs the CatVod/TVBox parser outside Expo Go. The iPhone app only
stores the parser URL, Token, and user-entered source URL locally.

## Remote PM2 Deployment

Current remote parser:

```text
http://47.97.25.185:3000
```

On a new server:

```bash
cd /root
git clone https://github.com/zgou93777-cmyk/gangganTV.git
cd /root/gangganTV
git checkout codex/iptv-roadmap
cd server
npm install --omit=dev
npm install -g pm2
```

Start with a required Token:

```bash
PORT=3000 \
PLUGIN_SERVER_TOKEN='change-this-token' \
PLUGIN_SCRIPT_TIMEOUT_MS=30000 \
PLUGIN_EXECUTION_TIMEOUT_MS=180000 \
pm2 start src/index.js --name ganggan-parser
pm2 save
```

After pulling a new version or changing environment variables:

```bash
cd /root/gangganTV
git pull
cd server
npm install --omit=dev
PORT=3000 \
PLUGIN_SERVER_TOKEN='change-this-token' \
PLUGIN_SCRIPT_TIMEOUT_MS=30000 \
PLUGIN_EXECUTION_TIMEOUT_MS=180000 \
pm2 restart ganggan-parser --update-env
pm2 save
```

Health check:

```bash
curl -H "Authorization: Bearer change-this-token" \
  http://127.0.0.1:3000/health
```

Expected response includes:

```json
{
  "ok": true,
  "service": "ganggan-plugin-parser",
  "capabilities": {
    "catvod": true,
    "catvodHome": true,
    "catvodSources": true,
    "tvboxRoutes": true,
    "tvboxRuntime": false
  }
}
```

`tvboxRoutes: true` means the HTTP routes exist. `tvboxRuntime: false` means
Android Spider/JAR sources are not connected yet, so those sources may import
but cannot reliably search or play.

## App 设置

In the app Settings page:

- 远端解析器: `http://47.97.25.185:3000` or your new server URL
- 解析服务 Token: the same `PLUGIN_SERVER_TOKEN`
- 点播源接口: a user-provided CatVod source, for example
  `http://wexfnw:wexfnw@cat.999888987.xyz/index.js.md5`

Tap "保存解析服务", then "检测解析服务". Search and playback requests require
the Token; leaving it blank should fail before making parser requests.

## Security Notes

- Keep `PLUGIN_SERVER_TOKEN` private. Anyone with the URL and Token can call the
  parser endpoints.
- The app stores parser settings on the device only.
- The app does not provide built-in content and does not upload user source
  URLs anywhere except to the configured parser service for parsing.
- Use a firewall or security group to allow only the needed port, currently
  `3000`.

## Useful PM2 Commands

```bash
pm2 status
pm2 logs ganggan-parser
pm2 restart ganggan-parser --update-env
pm2 delete ganggan-parser
pm2 save
```

## Current Compatibility

- CatVod JS scripts with search, detail, play, home, category, and source list
  support.
- Magic-player bundles through the server-side host shim.
- TVBox facade routes for later Android Spider/JAR runtime work.
- Some third-party lines are netdisk or account-based resources. They may time
  out or require cookies; the app should show a clear "switch route/source"
  message instead of crashing.
