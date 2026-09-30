'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {pasteChatGPTDraft}=require('../src/main/chatgpt-draft.cjs');
test('draft paste rejects invalid input and serializes mutation',async()=>{let release;const contents={isDestroyed:()=>false,isLoadingMainFrame:()=>false,getURL:()=> 'https://chatgpt.com/',executeJavaScript:()=>new Promise(resolve=>release=resolve)};
await assert.rejects(pasteChatGPTDraft(contents,'x'.repeat(100001)),/100,000/);await assert.rejects(pasteChatGPTDraft(contents,''),/Select text/);
const first=pasteChatGPTDraft(contents,'text');await assert.rejects(pasteChatGPTDraft(contents,'second'),/in progress/);release({pasted:true});await first;
contents.getURL=()=> 'https://chatgpt.com.evil.example/';await assert.rejects(pasteChatGPTDraft(contents,'text'),/signing in/);
});
