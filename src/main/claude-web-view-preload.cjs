'use strict';
const {ipcRenderer}=require('electron');
document.addEventListener('wheel',event=>{if(window.top!==window||location.origin!=='https://claude.ai'||!event.isTrusted||!event.ctrlKey||!event.deltaY)return;event.preventDefault();event.stopImmediatePropagation();ipcRenderer.send('ogle:claude-web-wheel-zoom',event.deltaY<0?1:-1);},{capture:true,passive:false});
