# TVBox Source UI And Spider Runtime Design

Date: 2026-06-28

## Context

The current Expo prototype can import basic TVBox JSON configs, search normal HTTP JSON sites, and play final direct URLs. The mistake in the previous compatibility model was treating `type: 3` / `csp_` sites as a generic unsupported plugin bucket, and sometimes explaining them as Cookie or scan-login sources.

TVBox/OK影视 uses a different flow:

1. A config can define a top-level `spider` JAR/DEX URL.
2. A site like `api: "csp_WexwencaiGuard"` maps to `com.github.catvod.spider.WexwencaiGuard`.
3. TVBox calls the Spider methods:
   - `searchContent(keyword, false)`
   - `detailContent(ids)`
   - `playerContent(flag, id, vipFlags)`
4. Only after `playerContent` returns can the app distinguish a direct playable URL, a parser URL, or a netdisk item that needs Cookie/scan login.

This means `🌺文才｜秒播🌺` should be treated as a TVBox JAR Spider source first, not as a netdisk-login source.

## Product Goal

Build an iPhone-first IPTV/video shell that feels like MiraPlay:

- The main screen is source-driven, not settings-driven.
- Imported configs become visible source lists.
- Search shows sources on the left and results on the right.
- Playback only receives final playable URLs.
- TVBox JAR/CSP execution happens outside the Expo app, through a controlled parser service.

## Non-Goals For This Pass

- Do not package or upload an iOS build yet.
- Do not add bundled content sources.
- Do not implement user netdisk account login in the first TVBox runtime pass.
- Do not run arbitrary third-party JAR/JS directly inside the iOS app.
- Do not redesign every visual detail before the source/search/play flow works.

## UI Design

### Discover Screen

The first screen should show content and sources immediately.

- Top-left source selector shows the active config/source, for example `豆瓣|首页`, `🌺文才｜秒播🌺`, or `💗虎斑|4K💗`.
- Tapping the selector opens a translucent source menu like the reference screenshots.
- The menu lists imported sites in their original display names, preserving emoji and separators.
- Search and settings/import remain one-tap actions at the top.
- Bottom navigation keeps three simple areas:
  - `发现`
  - `追剧`
  - `设置`

### Search Screen

After searching, the screen should split into two working areas.

- Top bar: back button, search input, source/filter button.
- Left rail: source buckets and counts.
  - `全部 (43 / 47)`
  - `🌺文才｜秒播🌺 1`
  - `💗虎斑|4K💗 3`
  - Sources that fail should remain visible with a small failed/unsupported state.
- Right content: poster grid for the selected bucket.
- Tapping a source in the left rail filters results immediately.
- Tapping a poster opens details.

### Detail And Playback

- Detail view shows poster, title, remarks, source name, play lines, and episodes/items.
- Tapping an episode calls the parser for final play resolution.
- If the result is a direct `m3u8/mp4` URL, send it to `expo-video`.
- If the result needs web parsing, show that status distinctly.
- If the result is netdisk-only, show `该线路需要添加网盘账号或扫码登录`.
- A failure in one source should not collapse the whole search page.

## Runtime Model

Normalize every site with a runtime label:

- `tvbox-json`: normal HTTP JSON APIs, usually `type: 0` or `type: 1`.
- `catvod-js`: `.js` or `.js.md5` CatVod JavaScript sources that the existing Node parser can attempt.
- `tvbox-jar-spider`: TVBox JAR/DEX Spider sites, usually `type: 3` with `api: "csp_Xxx"` and a config-level or site-level `jar`.
- `unsupported-plugin`: source shape is recognized but the required runtime is not available yet.

For `tvbox-jar-spider`, keep these fields:

- `configUrl`
- `siteKey`
- `siteName`
- `api`
- `ext`
- `jar`
- `configSpider`
- `searchable`
- `changeable`

## Parser Service Design

Keep the Expo app thin. Add a server-side TVBox adapter next to the existing CatVod parser.

Proposed HTTP API:

- `POST /tvbox/search`
  - input: `{ configUrl, siteKey, keyword }`
  - output: normalized search list plus source status
- `POST /tvbox/detail`
  - input: `{ configUrl, siteKey, id }`
  - output: normalized detail, lines, episodes
- `POST /tvbox/play`
  - input: `{ configUrl, siteKey, flag, id }`
  - output: `{ kind, url, headers, parse, message }`

The adapter must mimic TVBox:

1. Fetch and cache config JSON.
2. Resolve config-level `spider` and site-level `jar`.
3. Load the Spider class from `csp_Xxx`.
4. Call `searchContent`, `detailContent`, and `playerContent`.
5. Normalize the result for the Expo app.

Because real TVBox JARs are Android DEX and some include native guard assets, the implementation plan needs a runtime proof first:

- Try a server-side Android-compatible runtime service.
- If the Aliyun ECS cannot run the required Android runtime, use a small Android companion runtime as the parser worker.
- Keep the Node service as the public HTTP facade either way, so the app API stays stable.

## First Compatibility Target

The first real source to validate is:

- Config: `https://9280.kstore.vip/wex.json`
- Site: `🌺文才┃秒播🌺`
- API: `csp_WexwencaiGuard`
- Expected chain:
  - import config
  - show source in source selector
  - search keyword
  - show result under the matching source bucket
  - open detail
  - resolve an episode through `playerContent`
  - play the final URL if it is direct/playable

## Error Handling

- Empty search: `请输入搜索关键词`
- Source runtime missing: `该源需要 TVBox Spider 运行时，正在适配`
- JAR load failed: `源插件加载失败，请稍后重试或换源`
- Spider method failed: `该源解析失败，但不会影响其他源`
- Direct play missing: `没有解析到可播放地址`
- Netdisk required: `该线路需要添加网盘账号或扫码登录`
- Parser server unavailable: `解析服务连接失败，请检查设置里的服务地址`

## Test Plan

- Unit tests:
  - classify `csp_` sites as `tvbox-jar-spider`, not generic Cookie/netdisk.
  - preserve source names and emoji.
  - normalize search/detail/play responses across JSON, CatVod JS, and TVBox Spider adapters.
- UI tests/manual checks:
  - source selector opens and scrolls.
  - search page left source rail updates counts.
  - selecting a source filters the poster grid.
  - long source names truncate cleanly.
  - iPhone small-screen layout does not overlap.
- Parser integration checks:
  - `/health` reports CatVod and TVBox runtime availability separately.
  - `/tvbox/search` returns source-specific errors without crashing.
  - the `🌺文才┃秒播🌺` chain is the first end-to-end acceptance test.

## Implementation Order

1. Correct the data model and messages so `csp_` sources are TVBox Spider sources, not Cookie/netdisk by default.
2. Refactor the UI into source selector, search source rail, result grid, detail view, and player boundary.
3. Add Node facade routes for `/tvbox/search`, `/tvbox/detail`, and `/tvbox/play`.
4. Build the TVBox runtime proof-of-life against `wex.json`.
5. Wire the app to the TVBox runtime once the proof succeeds.
6. Push each meaningful version with bilingual commit messages.

## Approval Criteria

This design is successful when:

- Importing `wex.json` shows `🌺文才┃秒播🌺` as a selectable source.
- Searching shows source counts on the left and poster results on the right.
- `🌺文才┃秒播🌺` is not mislabeled as a Cookie/scan-login source.
- Playback errors explain whether the failure is runtime, parser, direct URL, or netdisk-account related.
- The Expo app remains usable in Expo Go while parser work happens on the server.
