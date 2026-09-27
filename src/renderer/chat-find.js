'use strict';
window.OgleChatFind = (() => {
  let api, getTarget, layout, target=null, bar, input, count, matchCase, timer, requestId=null;
  let ranges=[], current=-1;
  const bars=new Map();
  const report=error=>window.OgleDiagnostics.record(error,'Find in chat');
  function clearHighlights(){CSS.highlights.delete('chat-find');CSS.highlights.delete('chat-find-current');}
  function close(){
    clearTimeout(timer);if(bar)bar.hidden=true;
    if(target==='chatgpt')api.chatgptStopFind().catch(report);
    target=null;requestId=null;ranges=[];current=-1;clearHighlights();document.getElementById('messages').classList.remove('chat-search-active');layout?.();
  }
  function highlight(scroll){
    CSS.highlights.set('chat-find',new Highlight(...ranges));
    CSS.highlights.set('chat-find-current',new Highlight(...(ranges[current]?[ranges[current]]:[])));
    count.textContent=ranges.length?`${current+1} / ${ranges.length}`:'0 / 0';
    if(scroll && ranges[current]){
      const node=document.getElementById('messages'),range=ranges[current];
      range.startContainer.parentElement.scrollIntoView({block:'center'});
      const box=range.getBoundingClientRect(),view=node.getBoundingClientRect();
      node.scrollTop+=box.top-view.top-node.clientHeight/2;
    }
  }
  function search(forward=true,next=false,scroll=true){
    clearTimeout(timer);if(!target)return;
    const query=input.value;if(!query){ranges=[];current=-1;count.textContent='';clearHighlights();if(target==='chatgpt')api.chatgptStopFind().catch(report);return;}
    if(target==='chatgpt'){
      requestId=null;count.textContent='…';api.chatgptFind(query,{forward,findNext:next,matchCase:matchCase.checked}).then(id=>{requestId=id;}).catch(report);return;
    }
    if(next && ranges.length){current=(current+(forward?1:-1)+ranges.length)%ranges.length;highlight(scroll);return;}
    const previous=current;ranges=[];
    const pattern=new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),matchCase.checked?'gu':'giu');
    for(const body of document.querySelectorAll('#messages .message-text')){
      const walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT);let node;
      while((node=walker.nextNode())){
        pattern.lastIndex=0;let match;
        while((match=pattern.exec(node.data))){const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);ranges.push(range);}
      }
    }
    current=ranges.length?(scroll?0:Math.max(0,Math.min(previous,ranges.length-1))):-1;highlight(scroll);
  }
  function open(name=getTarget()){
    if(!bars.has(name))return;
    if(target!==name)close();target=name;bar=bars.get(name);input=bar.querySelector('input[type=search]');count=bar.querySelector('output');matchCase=bar.querySelector('input[type=checkbox]');bar.hidden=false;
    document.getElementById('messages').classList.toggle('chat-search-active',name==='chats');
    layout();input.focus();input.select();if(input.value)search();
  }
  function mount(options){
    ({api,getTarget,layout}=options);
    for(const name of ['chats','chatgpt']){
      const row=document.createElement('div');row.className='chat-find';row.hidden=true;row.setAttribute('role','search');row.setAttribute('aria-label',`Find in ${name==='chats'?'Codex':'ChatGPT'}`);
      row.innerHTML='<input type="search" maxlength="500" placeholder="Find in conversation…" aria-label="Find in conversation"><output aria-live="polite"></output><button type="button" title="Previous match (Shift+Enter)" aria-label="Previous match">↑</button><button type="button" title="Next match (Enter)" aria-label="Next match">↓</button><label title="Match case"><input type="checkbox" aria-label="Match case">Aa</label><button type="button" title="Close find (Esc)" aria-label="Close find">×</button>';
      const anchor=name==='chats'?document.querySelector('.conversation-header'):document.querySelector('#chatgpt-panel>.subtoolbar');anchor.after(row);bars.set(name,row);
      row.querySelector('input[type=search]').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>search(),120);});
      row.querySelector('input[type=checkbox]').onchange=()=>search();
      const buttons=row.querySelectorAll('button');buttons[0].onclick=()=>search(false,true);buttons[1].onclick=()=>search(true,true);buttons[2].onclick=close;
      row.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}else if(event.key==='Enter'){event.preventDefault();search(!event.shiftKey,true);}});
    }
    document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'&&!event.altKey){const name=getTarget();if(!bars.has(name))return;event.preventDefault();event.stopPropagation();open(name);}else if(event.key==='Escape'&&target){event.preventDefault();close();}},true);
    new MutationObserver(()=>{if(target==='chats'&&input.value){clearTimeout(timer);timer=setTimeout(()=>search(true,false,false),160);}}).observe(document.getElementById('messages'),{subtree:true,childList:true,characterData:true});
  }
  function result(value){if(target==='chatgpt'&&input.value&&(!requestId||value.requestId===requestId))count.textContent=`${value.activeMatchOrdinal || 0} / ${value.matches || 0}`;}
  return {mount,open,close,result};
})();
