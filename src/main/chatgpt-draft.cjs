'use strict';
const pending=new WeakSet();
async function appendInPage(text){
 const fail=message=>{throw new Error(message);};
 const original=location.href;
 const samePage=()=>{if(location.origin!=='https://chatgpt.com'||location.href!==original)fail('ChatGPT changed pages. Review its draft before trying again.');};
 samePage();
 const selector='#prompt-textarea,textarea[data-testid="prompt-textarea"],textarea[placeholder*="Message"],[contenteditable="true"][data-placeholder],form [contenteditable="true"][role="textbox"],form .ProseMirror[contenteditable="true"],[data-testid="composer"] [contenteditable="true"],[data-testid="composer"] textarea,form[data-type="unified-composer"] textarea';
 let editor;
 for(let attempt=0;attempt<25;attempt++){
  samePage();editor=[...document.querySelectorAll(selector)].find(node=>node.getClientRects().length&&!node.disabled&&!node.readOnly&&(node.tagName==='TEXTAREA'||node.isContentEditable));
  if(editor)break;await new Promise(resolve=>setTimeout(resolve,200));
 }
 if(!editor)fail('Open ChatGPT and finish signing in to paste into its message box.');
 const read=()=>editor.tagName==='TEXTAREA'?editor.value:editor.innerText;
 const normalize=value=>value.replace(/\r\n/g,'\n');
 const before=read(),addition=(before&&!before.endsWith('\n')?'\n':'')+text;
 if(before.length+addition.length>100000)fail('The combined ChatGPT draft exceeds 100,000 characters.');
 samePage();editor.focus();samePage();
 if(read()!==before)fail('The ChatGPT draft changed. Review it before trying again.');
 if(!editor.isConnected)fail('ChatGPT changed its message box. Try again when ready.');
 if(editor.tagName==='TEXTAREA'){
  const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;
  if(!setter)fail('ChatGPT changed its message box. Paste in its tab instead.');
  setter.call(editor,before+addition);editor.setSelectionRange(editor.value.length,editor.value.length);
  editor.dispatchEvent(new Event('input',{bubbles:true}));
 }else{
  const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);
  const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
  if(!document.execCommand('insertText',false,addition))fail('ChatGPT could not accept the text. Review its draft before trying again.');
 }
 await new Promise(resolve=>setTimeout(resolve,50));
 samePage();
 if(!editor.isConnected)fail('ChatGPT replaced its message box. Review its draft before trying again.');
 if(normalize(read())!==normalize(before+addition))fail('ChatGPT did not retain the entire text. Review its draft before trying again.');
 return {pasted:true};
}
async function pasteChatGPTDraft(contents,text){
 if(typeof text!=='string'||!text.length||text.length>100000)throw new Error('Select text of at most 100,000 characters.');
 if(!contents||contents.isDestroyed())throw new Error('Open the ChatGPT tab before pasting.');
 let url;try{url=new URL(contents.getURL());}catch{}
 if(url?.origin!=='https://chatgpt.com'||contents.isLoadingMainFrame())throw new Error('Wait for ChatGPT to load and finish signing in before pasting.');
 if(pending.has(contents))throw new Error('A ChatGPT paste is already in progress.');
 pending.add(contents);
 try{return await contents.executeJavaScript(`(${appendInPage.toString()})(${JSON.stringify(text)})`,true);}
 finally{pending.delete(contents);}
}
module.exports={pasteChatGPTDraft};
