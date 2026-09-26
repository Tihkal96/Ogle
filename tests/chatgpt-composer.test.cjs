'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateChatGPTPayload, sendChatGPT } = require('../src/main/chatgpt-composer.cjs');
test('ChatGPT validates text, file data and attachment limits before page access', () => {
  assert.throws(() => validateChatGPTPayload({ text: '' }), /prompt/);
  assert.throws(() => validateChatGPTPayload({ text: 'x'.repeat(100001) }), /100,000/);
  assert.throws(() => validateChatGPTPayload({ text: 'x', attachments: Array(5).fill({}) }), /four/);
  assert.throws(() => validateChatGPTPayload({ text: 'x', attachments: [{ type: 'file', name: '../bad', url: 'data:text/plain;base64,eA==' }] }), /filename/);
  assert.throws(() => validateChatGPTPayload({ text: 'x', attachments: [{ type: 'file', name: 'a', url: 'https://example.com/a' }] }), /base64/);
  assert.deepEqual(validateChatGPTPayload({ text: '', attachments: [{ type: 'file', name: 'a.txt', url: 'data:text/plain;base64,eA==' }] }).files[0], { name: 'a.txt', mimeType: 'text/plain', base64: 'eA==' });
});
test('ChatGPT accepts only the loaded exact HTTPS origin and serializes sends', async () => {
  let release;
  const contents = { isDestroyed: () => false, isLoadingMainFrame: () => false, getURL: () => 'https://chatgpt.com/', executeJavaScript: () => new Promise(resolve => { release = resolve; }) };
  const first = sendChatGPT(contents, { text: 'Hello' });
  await assert.rejects(sendChatGPT(contents, { text: 'Again' }), /in progress/);
  release({ sent: true }); await first;
  contents.getURL = () => 'https://chatgpt.com.evil.example/';
  await assert.rejects(sendChatGPT(contents, { text: 'No' }), /finish signing in/);
});
