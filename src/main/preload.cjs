'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const invoke = (name, ...args) => ipcRenderer.invoke(`dock:${name}`, ...args);
contextBridge.exposeInMainWorld('dock', Object.freeze({
  boot: () => invoke('boot'),
  listThreads: filters => invoke('listThreads', filters),
  readThread: id => invoke('readThread', id),
  startThread: cwd => invoke('startThread', cwd),
  sendTurn: (id, text, images = []) => invoke('sendTurn', id, text, images),
  interrupt: (id, turnId) => invoke('interrupt', id, turnId),
  respond: (id, result) => invoke('respond', id, result),
  saveSettings: patch => invoke('saveSettings', patch),
  chooseFolder: () => invoke('chooseFolder'),
  openChatGPT: action => invoke('openChatGPT', action),
  chatgptLayout: layout => invoke('chatgptLayout', layout),
  openCodex: id => invoke('openCodex', id),
  petMenu: () => invoke('petMenu'),
  petDrag: action => invoke('petDrag', action),
  codexAccount: () => invoke('codexAccount'),
  codexLogin: () => invoke('codexLogin'),
  codexLogout: () => invoke('codexLogout'),
  installPet: input => invoke('installPet', input),
  listPets: () => invoke('listPets'),
  petIcon: data=>invoke('petIcon',data),
  editorOpen: () => invoke('editorOpen'),
  editorSave: options => invoke('editorSave', options),
  chooseShortcut: kind => invoke('chooseShortcut', kind),
  importShortcuts: payload => invoke('importShortcuts', payload),
  shortcutIcons: paths=>invoke('shortcutIcons',paths),
  droppedPaths: files => Array.from(files || []).map(file => webUtils.getPathForFile(file)).filter(Boolean),
  openShortcut: path => invoke('openShortcut', path),
  readDirectory: path => invoke('readDirectory', path),
  terminalCreate: options => invoke('terminalCreate', options),
  terminalWrite: (id, data) => invoke('terminalWrite', id, data),
  terminalResize: (id, cols, rows) => invoke('terminalResize', id, cols, rows),
  terminalClose: id => invoke('terminalClose', id),
  terminalReleaseAdmin: () => invoke('terminalReleaseAdmin'),
  windowAction: action => invoke('windowAction', action),
  onEvent: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('dock:event', listener);
    return () => ipcRenderer.removeListener('dock:event', listener);
  }
}));
