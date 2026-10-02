'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createDockTray } = require('../src/main/tray.cjs');
function fixture() {
  let tray, menu; const calls = [];
  class Tray extends EventEmitter {
    constructor(icon) { super(); tray = this; this.icon = icon; this.destroyCount = 0; }
    setToolTip(text) { this.tooltip = text; }
    popUpContextMenu(value) { menu = value; }
    destroy() { this.destroyCount++; }
  }
  const window = { visible: true, minimized: false, destroyed: false,
    isVisible() { return this.visible; }, isMinimized() { return this.minimized; }, isDestroyed() { return this.destroyed; } };
  const icon = { isEmpty: () => false };
  const control = createDockTray({ Tray, Menu: { buildFromTemplate: value => value }, nativeImage: { createFromPath: file => { assert.equal(file, 'eye.png'); return icon; } }, iconPath: 'eye.png', window,
    onShow: () => { calls.push('show'); window.visible = true; window.minimized = false; }, onHide: () => { calls.push('hide'); window.visible = false; }, onSettings: () => calls.push('settings'), onQuit: () => calls.push('quit') });
  return { tray, window, calls, control, icon, menu: () => menu };
}
test('tray uses eye icon and repeated left clicks only show Ogle', () => {
  const f = fixture(); assert.equal(f.tray.icon, f.icon); assert.equal(f.tray.tooltip, 'Ogle');
  f.tray.emit('click'); f.tray.emit('click'); assert.deepEqual(f.calls, ['show', 'show']);
  f.control.dispose();
});
test('each right click reflects visibility and menu invokes supplied routes', () => {
  const f = fixture(); f.tray.emit('right-click'); assert.equal(f.menu()[0].label, 'Hide Ogle'); f.menu()[0].click();
  f.tray.emit('right-click'); assert.equal(f.menu()[0].label, 'Show Ogle'); f.menu()[0].click();
  f.window.minimized = true; f.tray.emit('right-click'); assert.equal(f.menu()[0].label, 'Show Ogle');
  f.menu()[1].click(); assert.deepEqual(f.menu()[2], { type: 'separator' }); f.menu()[3].click();
  assert.deepEqual(f.calls, ['hide', 'show', 'settings', 'quit']); f.control.dispose();
});
test('dispose removes listeners, destroys once and invalidates an already open menu', () => {
  const f = fixture(); f.tray.emit('right-click'); const old = f.menu(); f.control.dispose(); f.control.dispose();
  assert.equal(f.tray.destroyCount, 1); assert.equal(f.tray.listenerCount('click'), 0); assert.equal(f.tray.listenerCount('right-click'), 0);
  for (const item of old) item.click?.(); assert.deepEqual(f.calls, []);
});
test('destroyed window receives no show or context actions', () => {
  const f = fixture(); f.window.destroyed = true; f.tray.emit('click'); f.tray.emit('right-click');
  assert.deepEqual(f.calls, []); assert.equal(f.menu(), undefined); f.control.dispose();
});

test('tray-only policy covers existing and Chromium child windows across show and restore', () => {
  const { installTrayOnlyWindows } = require('../src/main/tray.cjs');
  const app = new EventEmitter();
  const make = () => Object.assign(new EventEmitter(), { destroyed:false, calls:[], isDestroyed(){return this.destroyed;}, setSkipTaskbar(value){this.calls.push(value);} });
  const existing = make(), popup = make();
  const dispose = installTrayOnlyWindows(app, {getAllWindows:()=>[existing]});
  app.emit('browser-window-created', {}, popup);
  existing.emit('show'); popup.emit('restore');
  assert.deepEqual(existing.calls,[true,true]); assert.deepEqual(popup.calls,[true,true]);
  popup.destroyed=true; popup.emit('closed'); assert.equal(popup.listenerCount('show'),0);
  dispose(); existing.emit('show'); assert.equal(existing.calls.length,2);
  assert.equal(app.listenerCount('browser-window-created'),0);
});
