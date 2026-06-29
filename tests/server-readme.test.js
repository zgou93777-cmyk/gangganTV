const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const readme = fs.readFileSync(path.join(__dirname, '..', 'server', 'README.md'), 'utf8');

test('server README documents local parser first and remote PM2 fallback', () => {
  [
    'Local Parser First',
    '本地解析器',
    'Token（可选）',
    '保存解析器',
    '检测解析器',
    'Remote PM2 Deployment',
    '47.97.25.185',
    'PLUGIN_SERVER_TOKEN',
    'pm2 start src/index.js --name ganggan-parser',
    'pm2 restart ganggan-parser --update-env',
  ].forEach((copy) => {
    assert.equal(readme.includes(copy), true, `README should include ${copy}`);
  });

  assert.equal(readme.includes('Cloud deployment is now a fallback'), true);
});
