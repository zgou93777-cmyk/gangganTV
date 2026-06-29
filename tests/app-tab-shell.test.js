const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');

test('watching and settings tabs hide the shared top playback status area', () => {
  assert.equal(appSource.includes("activeTab !== 'discover' && currentUrl"), false);
  assert.equal(appSource.includes("activeTab !== 'discover' ?"), false);
});

test('home top chrome is only rendered on the discover tab', () => {
  assert.equal(appSource.includes("activeTab === 'discover' ? ("), true);
  assert.equal(appSource.includes('styles.topChrome'), true);
});
