const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  GLASS_ACTIVE_OUTLINE_STYLE,
  GLASS_BUTTON_STYLE,
  GLASS_INPUT_STYLE,
  GLASS_NAV_STYLE,
  GLASS_PANEL_STYLE,
} = require('../src/ui-theme');

function assertNotSolidWhite(style, label) {
  assert.notEqual(style.backgroundColor, '#ffffff', `${label} must not be solid #ffffff`);
  assert.notEqual(style.backgroundColor, '#fff', `${label} must not be solid #fff`);
  assert.notEqual(style.backgroundColor, 'white', `${label} must not be solid white`);
}

test('defines transparent glass surfaces for MiraPlay-style controls', () => {
  assertNotSolidWhite(GLASS_BUTTON_STYLE, 'button');
  assert.match(GLASS_BUTTON_STYLE.backgroundColor, /rgba\(255, 255, 255, 0\.\d+\)/);
  assert.match(GLASS_BUTTON_STYLE.borderColor, /rgba\(255, 255, 255, 0\.\d+\)/);
  assert.match(GLASS_BUTTON_STYLE.boxShadow, /rgba\(0, 0, 0, 0\.\d+\)/);

  assertNotSolidWhite(GLASS_NAV_STYLE, 'bottom nav');
  assert.match(GLASS_NAV_STYLE.backgroundColor, /rgba\(255, 255, 255, 0\.\d+\)/);
  assert.match(GLASS_NAV_STYLE.borderColor, /rgba\(255, 255, 255, 0\.\d+\)/);

  assertNotSolidWhite(GLASS_PANEL_STYLE, 'panel');
  assert.match(GLASS_PANEL_STYLE.backgroundColor, /rgba\(255, 255, 255, 0\.\d+\)/);
  assert.match(GLASS_PANEL_STYLE.borderColor, /rgba\(255, 255, 255, 0\.\d+\)/);

  assertNotSolidWhite(GLASS_INPUT_STYLE, 'input');
  assert.match(GLASS_INPUT_STYLE.backgroundColor, /rgba\(255, 255, 255, 0\.\d+\)/);
  assert.match(GLASS_INPUT_STYLE.borderColor, /rgba\(229, 231, 235, 0\.\d+\)/);
});

test('defines an outline-only active tab surface', () => {
  assertNotSolidWhite(GLASS_ACTIVE_OUTLINE_STYLE, 'active tab');
  assert.equal(GLASS_ACTIVE_OUTLINE_STYLE.borderWidth > 0, true);
  assert.match(GLASS_ACTIVE_OUTLINE_STYLE.borderColor, /rgba\(255, 255, 255, 0\.\d+\)/);
});

test('App applies glass theme to the primary MiraPlay controls', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');

  [
    'sourcePill: {\n    ...GLASS_BUTTON_STYLE',
    'circleButton: {\n    ...GLASS_BUTTON_STYLE',
    'homeFilterChip: {\n    ...GLASS_BUTTON_STYLE',
    'searchBackButton: {\n    ...GLASS_BUTTON_STYLE',
    'searchSourceButton: {\n    ...GLASS_BUTTON_STYLE',
    'detailBackButton: {\n    ...GLASS_BUTTON_STYLE',
    'bottomTabs: {\n    ...GLASS_NAV_STYLE',
    'bottomTabActive: {\n    ...GLASS_ACTIVE_OUTLINE_STYLE',
  ].forEach((needle) => {
    assert.equal(appSource.includes(needle), true, `App.js should include ${needle}`);
  });
});

test('App applies MiraPlay page shells beyond the discover screen', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');

  [
    'styles.historyTop',
    'styles.historyPill',
    'settingsHero: {\n    ...GLASS_BUTTON_STYLE',
    'quickAction: {\n    ...GLASS_BUTTON_STYLE',
    'filterChip: {\n    ...GLASS_BUTTON_STYLE',
    'siteChip: {\n    ...GLASS_BUTTON_STYLE',
    'miniActionButton: {\n    ...GLASS_BUTTON_STYLE',
    'sourceManageCard: {\n    ...GLASS_BUTTON_STYLE',
    'sourceFilterSheet: {\n    backgroundColor: COLORS.page',
    'searchOverlayCard: {\n    backgroundColor: COLORS.page',
  ].forEach((needle) => {
    assert.equal(appSource.includes(needle), true, `App.js should include ${needle}`);
  });
});

test('App covers the remaining settings, search, and player surfaces', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');

  [
    'sourceMenu: {\n    ...GLASS_PANEL_STYLE',
    'sourceMenuItemActive: {\n    ...GLASS_ACTIVE_OUTLINE_STYLE',
    'input: {\n    ...GLASS_INPUT_STYLE',
    'searchInput: {\n    ...GLASS_INPUT_STYLE',
    'statusPanel: {\n    ...GLASS_PANEL_STYLE',
    'idleStatusPanel: {\n    ...GLASS_PANEL_STYLE',
    'loadingStatePanel: {\n    ...GLASS_PANEL_STYLE',
    'diagnosticsPanel: {\n    ...GLASS_PANEL_STYLE',
    'diagnosticTile: {\n    ...GLASS_BUTTON_STYLE',
    'selectedSitePanel: {\n    ...GLASS_PANEL_STYLE',
    'selectedDetailPanel: {\n    ...GLASS_PANEL_STYLE',
    'episodeButton: {\n    ...GLASS_BUTTON_STYLE',
    'sourceRow: {\n    ...GLASS_BUTTON_STYLE',
    'detailEmptyEpisodes: {\n    ...GLASS_BUTTON_STYLE',
    'playerLandscapeFrame: {\n    ...GLASS_PANEL_STYLE',
  ].forEach((needle) => {
    assert.equal(appSource.includes(needle), true, `App.js should include ${needle}`);
  });
});
