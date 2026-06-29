const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const readme = fs.readFileSync(path.join(__dirname, '..', 'server', 'README.md'), 'utf8');

test('server README documents remote PM2 deployment with token', () => {
  [
    'Remote PM2 Deployment',
    '47.97.25.185',
    'PLUGIN_SERVER_TOKEN',
    'pm2 start src/index.js --name ganggan-parser',
    'pm2 restart ganggan-parser --update-env',
    'App 设置',
    '远端解析器',
  ].forEach((copy) => {
    assert.equal(readme.includes(copy), true, `README should include ${copy}`);
  });
});
