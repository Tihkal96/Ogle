'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const actions = new Set(['ready', 'new', 'back', 'reload', 'pin', 'external', 'close']);
contextBridge.exposeInMainWorld('chatgptPanel', {
  action(value) { if (actions.has(value)) ipcRenderer.send('petdock:chatgpt:action', value); },
  onStatus(callback) { ipcRenderer.on('petdock:chatgpt:status', (_event, status) => callback(status)); }
});
