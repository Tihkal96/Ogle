'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isHttps, panelBounds } = require('../src/chatgpt/navigation.cjs');
test('remote navigation rejects local, script, insecure and credential-bearing URLs', () => {
  for (const url of ['file:///C:/secret', 'javascript:alert(1)', 'http://chatgpt.com', 'https://user:secret@example.com', 'not a url', 'data:text/html,hi']) assert.equal(isHttps(url), false, url);
  assert.equal(isHttps('https://chatgpt.com/'), true);
  assert.equal(isHttps('https://accounts.google.com/o/oauth2/auth'), true);
});
test('panel stays within a secondary display with negative coordinates', () => {
  const area = { x: -1920, y: 0, width: 1920, height: 1040 };
  const bounds = panelBounds({ x: -1900, y: 10, width: 300, height: 200 }, area);
  assert.ok(bounds.x >= area.x && bounds.y >= area.y);
  assert.ok(bounds.x + bounds.width <= 0 && bounds.y + bounds.height <= 1040);
});
test('panel shrinks to fit small work areas', () => {
  assert.deepEqual(panelBounds(null, { x: 0, y: 0, width: 400, height: 300 }), { x: 0, y: 0, width: 400, height: 300 });
});
