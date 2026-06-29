const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const FORBIDDEN_INLINE_ICONS = ['⌕', '⌁', '◴', '♕', '▶', '♥', '⚙', '♡', '⋯', '☰', '‹', '⌄'];

test('App and UI model avoid temporary text glyph icons', () => {
  const files = ['App.js', path.join('src', 'ui-model.js')];

  files.forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

    FORBIDDEN_INLINE_ICONS.forEach((glyph) => {
      assert.equal(source.includes(glyph), false, `${file} still contains ${glyph}`);
    });
  });
});
