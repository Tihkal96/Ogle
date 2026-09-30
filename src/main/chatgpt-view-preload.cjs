'use strict';
// Isolated, sandboxed input handling only. No API is exposed to the website.
const { ipcRenderer } = require('electron');
document.addEventListener('wheel', event => {
  if (window.top !== window || location.origin !== 'https://chatgpt.com' ||
      !event.isTrusted || !event.ctrlKey || !event.deltaY) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  ipcRenderer.send('ogle:chatgpt-wheel-zoom', event.deltaY < 0 ? 1 : -1);
}, { capture: true, passive: false });
