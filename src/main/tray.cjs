'use strict';

function createDockTray({ Tray, Menu, nativeImage, iconPath, window, onShow, onHide, onSettings, onQuit }) {
  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) throw new Error('Ogle notification-area icon could not be loaded.');
  const tray = new Tray(icon);
  let disposed = false;
  tray.setToolTip('Ogle');
  const available = () => !disposed && !window.isDestroyed();
  const show = () => { if (available()) onShow(); };
  const context = () => {
    if (!available()) return;
    const visible = window.isVisible() && !window.isMinimized();
    const menu = Menu.buildFromTemplate([
      { label: visible ? 'Hide Ogle' : 'Show Ogle', click: () => { if (available()) (visible ? onHide : onShow)(); } },
      { label: 'Settings', click: () => { if (available()) onSettings(); } },
      { type: 'separator' },
      { label: 'Quit Ogle', click: () => { if (!disposed) onQuit(); } }
    ]);
    tray.popUpContextMenu(menu);
  };
  // Showing is idempotent: the second click of a double-click must not hide it.
  tray.on('click', show);
  tray.on('right-click', context);
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      tray.removeListener('click', show);
      tray.removeListener('right-click', context);
      tray.destroy();
    }
  };
}
// Cover every Electron window, including OAuth popups created by Chromium.
// Reapply on show/restore because those paths can recreate Windows shell state.
function installTrayOnlyWindows(app, BrowserWindow) {
  const tracked = new Map();
  const attach = (_event, window) => {
    if (tracked.has(window) || window.isDestroyed()) return;
    const apply = () => { if (!window.isDestroyed()) window.setSkipTaskbar(true); };
    const detach = () => {
      window.removeListener('show', apply);
      window.removeListener('restore', apply);
      window.removeListener('closed', detach);
      tracked.delete(window);
    };
    tracked.set(window, detach);
    apply();
    window.on('show', apply);
    window.on('restore', apply);
    window.once('closed', detach);
  };
  app.on('browser-window-created', attach);
  for (const window of BrowserWindow.getAllWindows()) attach(null, window);
  return () => {
    app.removeListener('browser-window-created', attach);
    for (const detach of [...tracked.values()]) detach();
  };
}
module.exports = { createDockTray, installTrayOnlyWindows };
