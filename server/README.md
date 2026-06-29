# Ganggan Local Parser

This service runs the CatVod/TVBox parser outside Expo Go. The iPhone app only
stores the parser URL, optional Token, and user-entered source URL locally.

## Local Parser First

Run the parser on your computer first. This keeps parsing and playback on the
same local network, which is more reliable for third-party CatVod sources than
parsing on a cloud server.

```bash
cd server
npm install
PORT=3000 npm start
```

If you want a Token locally, start it with `PLUGIN_SERVER_TOKEN`; otherwise
leave the Token blank in the app.

Health check without a Token:

```bash
curl http://127.0.0.1:3000/health
```

In the app Settings page:

- 本地解析器: your computer LAN address, for example `http://192.168.1.20:3000`
- Token（可选）: leave blank unless the parser was started with `PLUGIN_SERVER_TOKEN`
- 点播源接口: a user-provided CatVod source, for example
  `http://wexfnw:wexfnw@cat.999888987.xyz/index.js.md5`

Tap "保存解析器", then "检测解析器".

## Remote PM2 Deployment

Cloud deployment is now a fallback/testing option. Some third-party sources may
be slow or fail to play when parsed from a cloud IP, even if local parsing works.

Previous remote parser:

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
