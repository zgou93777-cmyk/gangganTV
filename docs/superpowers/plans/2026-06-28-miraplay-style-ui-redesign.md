# MiraPlay Style UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the Expo IPTV prototype into the confirmed MiraPlay-style flow: discover feed, search overlay, dedicated source-filtered results page, poster detail page, and landscape player layer.

**Architecture:** Keep the app usable in Expo Go and avoid introducing a new router in this pass. Add UI model helpers in `src/ui-model.js` for poster feed data, page state defaults, source selection, and detail normalization; keep existing playback/search/import APIs in `App.js` but render them through distinct page states.

**Tech Stack:** Expo SDK 54 project, React Native, `expo-video`, AsyncStorage, Node test runner.

---

### Task 1: UI Model Helpers

**Files:**
- Modify: `src/ui-model.js`
- Modify: `tests/ui-model.test.js`

- [ ] **Step 1: Write failing tests**

Add tests that describe the new UI model:

```js
test('defines MiraPlay discover categories and filters', () => {
  assert.deepEqual(
    DISCOVER_FEED_TABS.map((tab) => tab.label),
    ['热门内容', '热门电视', '热门综艺', '电影', '电视']
  );
  assert.equal(DISCOVER_SORT_FILTERS[0].label, '排序');
  assert.equal(DISCOVER_REGION_FILTERS[1].label, '华语');
});

test('builds demo discover posters with stable card fields', () => {
  const posters = buildDiscoverPosterFeed();
  assert.equal(posters.length >= 9, true);
  assert.deepEqual(Object.keys(posters[0]).sort(), [
    'id',
    'poster',
    'rating',
    'subtitle',
    'title',
  ]);
});

test('normalizes a selected search result into detail view data', () => {
  const detail = buildPosterDetailModel({
    name: '痴迷',
    poster: 'https://img.example.com/obsession.jpg',
    remarks: 'HD中字',
    sourceName: '瓜子',
    year: '2026',
    type: '恐怖 / 惊悚',
    duration: '108分钟',
    description: '测试简介',
  });

  assert.equal(detail.title, '痴迷');
  assert.equal(detail.heroImage, 'https://img.example.com/obsession.jpg');
  assert.equal(detail.metaLine, '2026 · 恐怖 / 惊悚 · 108分钟');
  assert.equal(detail.sourceName, '瓜子');
});
```

- [ ] **Step 2: Verify tests fail**

Run: `npm test tests/ui-model.test.js`

Expected: FAIL because `DISCOVER_FEED_TABS`, `DISCOVER_SORT_FILTERS`, `DISCOVER_REGION_FILTERS`, `buildDiscoverPosterFeed`, and `buildPosterDetailModel` do not exist yet.

- [ ] **Step 3: Implement helpers**

Add the exported constants and helper functions in `src/ui-model.js`. Use real Chinese labels, stable placeholder poster URLs, and defensive fallback text.

- [ ] **Step 4: Verify tests pass**

Run: `npm test tests/ui-model.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui-model.js tests/ui-model.test.js docs/superpowers/plans/2026-06-28-miraplay-style-ui-redesign.md
git commit -m "feat: add MiraPlay UI model helpers" -m "中文：增加首页热播流、筛选项和详情页数据模型，为 UI 重构做准备。" -m "English: Add discover feed, filter, and poster detail model helpers for the MiraPlay UI redesign."
git push origin codex/iptv-roadmap
```

### Task 2: Discover Feed And Search Overlay

**Files:**
- Modify: `App.js`

- [ ] **Step 1: Add page state**

Add state for `activePage`, `searchOverlayOpen`, `overlayKeyword`, and selected discover filters. Keep `activeTab` for bottom navigation.

- [ ] **Step 2: Replace discover content**

Change the discover tab so it renders:

- Top source selector on the left.
- Search button on the right.
- Horizontal discover category rail.
- Sort and region filter chips.
- Three-column poster grid from `buildDiscoverPosterFeed()`.
- Bottom floating tabs.

- [ ] **Step 3: Add search overlay**

Render a centered overlay when `searchOverlayOpen` is true. It contains a search input, cancel button, and blue search button. Submitting a non-empty keyword closes the overlay, stores the keyword in `searchKeyword`, sets `activePage` to `searchResults`, and calls the existing search function.

- [ ] **Step 4: Verify syntax**

Run: `node --check App.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add App.js
git commit -m "feat: add MiraPlay discover feed" -m "中文：首页改成热播海报内容流，并把搜索改成弹窗入口。" -m "English: Rework the home screen into a poster feed and move search behind an overlay."
git push origin codex/iptv-roadmap
```

### Task 3: Dedicated Search Results Page

**Files:**
- Modify: `App.js`

- [ ] **Step 1: Render search page when active**

When `activePage === 'searchResults'`, render a full search page instead of the discover/settings tab layout.

- [ ] **Step 2: Build top bar**

Top bar contains:

- Back button returning to discover.
- Search input bound to `searchKeyword`.
- Source selector button that opens a multi-select source sheet.

- [ ] **Step 3: Build left source rail and right poster grid**

Reuse `searchBuckets`, `activeSearchBucketId`, `visibleSearchResults`, and `vodResultCards`. Left rail shows source names and counts; right side shows two-column poster cards. Tapping a poster opens detail.

- [ ] **Step 4: Add source multi-select sheet**

Use local selected source IDs. Default is all sites. Tapping a site toggles it. Applying the sheet reruns search for selected sites where possible; if the current search API only supports all or selected site, keep selected sites visually tracked and filter existing results locally.

- [ ] **Step 5: Verify syntax**

Run: `node --check App.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add App.js
git commit -m "feat: add dedicated VOD search page" -m "中文：新增独立点播搜索页，顶部返回/搜索/源选择，左侧来源分类，右侧海报结果。" -m "English: Add a dedicated VOD search page with top controls, source rail, and poster results."
git push origin codex/iptv-roadmap
```

### Task 4: Poster Detail Page

**Files:**
- Modify: `App.js`

- [ ] **Step 1: Render detail page when active**

When a poster is selected, set `activePage` to `detail` and render a dark detail page.

- [ ] **Step 2: Build the detail visual**

Use the selected result/detail model to render:

- Back button.
- Large hero image.
- Title, meta line, and primary play button.
- Icon row for search, favorite, and more.
- Description.
- Source/line selector.
- Episode/play-item grid.

- [ ] **Step 3: Wire existing detail loading**

Keep the existing `openDetail`/detail-loading behavior. If detail data is missing, show a skeleton/error state instead of crashing.

- [ ] **Step 4: Verify syntax**

Run: `node --check App.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add App.js
git commit -m "feat: add poster detail page" -m "中文：新增接近参考图三的深色海报详情页，承载线路和剧集选择。" -m "English: Add a dark poster detail page for line and episode selection."
git push origin codex/iptv-roadmap
```

### Task 5: Landscape Player Layer

**Files:**
- Modify: `App.js`

- [ ] **Step 1: Add player overlay state**

Track whether the player layer is open separately from the current playable URL.

- [ ] **Step 2: Open player from play actions**

When an episode or direct play resolves successfully, set the player layer open. The `expo-video` player still receives only the final URL.

- [ ] **Step 3: Render landscape player layer**

Render a dark full-screen layer with:

- Back/close button.
- 16:9 `VideoView`.
- Current title and source label.
- Chinese loading/error status.

- [ ] **Step 4: Verify syntax**

Run: `node --check App.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add App.js
git commit -m "feat: add landscape player layer" -m "中文：播放项解析成功后打开独立横屏播放器层，退出后回到详情页。" -m "English: Open resolved playback in a dedicated landscape player layer and return to detail on close."
git push origin codex/iptv-roadmap
```

### Task 6: Full Verification

**Files:**
- No planned source edits unless verification finds a bug.

- [ ] **Step 1: Run unit tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Run server tests**

Run: `npm --prefix server test`

Expected: all tests pass.

- [ ] **Step 3: Run iOS export check**

Run: `npx expo export --platform ios --output-dir .expo-check-ios`

Expected: export completes.

- [ ] **Step 4: Remove export output**

Run: `Remove-Item -Recurse -Force .expo-check-ios`

Expected: generated verification output is removed.

- [ ] **Step 5: Final commit if needed**

If verification required fixes:

```bash
git add App.js src/ui-model.js tests/ui-model.test.js
git commit -m "fix: polish MiraPlay UI flow" -m "中文：修复验证中发现的 UI 流程和导出问题。" -m "English: Fix UI flow and export issues found during verification."
git push origin codex/iptv-roadmap
```

## Self-Review

- Spec coverage: discover feed, search overlay, dedicated search page, poster detail, landscape player, errors, and verification are all mapped to tasks.
- Placeholder scan: no TBD/TODO placeholders are present.
- Type consistency: UI model helper names are introduced in Task 1 and reused by App.js tasks.
