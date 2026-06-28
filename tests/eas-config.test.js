const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('Expo project is configured for an iOS development build', () => {
  const appConfig = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;
  const easConfig = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

  assert.ok(packageJson.dependencies['expo-dev-client']);
  assert.equal(appConfig.scheme, 'ganggantv');
  assert.equal(appConfig.ios.bundleIdentifier, 'com.ganggan.tv');
  assert.equal(
    appConfig.ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads,
    true
  );
  assert.equal(easConfig.build.development.developmentClient, true);
  assert.equal(easConfig.build.development.distribution, 'internal');
});
