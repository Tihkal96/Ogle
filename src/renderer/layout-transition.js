'use strict';
// Windows may present the old surface once at the new native window origin.
// Keep that surface transparent until both native bounds and Chromium agree.
window.DockLayoutTransition = (() => {
  let sequence = 0, queue = Promise.resolve(), busy = false;
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  async function paint() { await frame(); await frame(); }
  async function fade(from, to, duration) {
    const body = document.body;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) duration = 0;
    const animation = body.animate([{ opacity: from }, { opacity: to }], { duration, fill: 'forwards' });
    await animation.finished;
    body.style.opacity = String(to);
    animation.cancel();
  }
  function run(render, resize, mode) {
    const id = ++sequence;
    busy = true;
    document.body.dataset.layoutTransition = 'true';
    queue = queue.catch(() => {}).then(async () => {
      if (id !== sequence) return;
      const preparation=await window.dock.windowTransition('begin',mode,matchMedia('(prefers-reduced-motion: reduce)').matches);
      if(preparation?.unchanged){if(id===sequence){render();await resize();}return;}
      document.body.style.opacity='0';
      if (id !== sequence) return;
      await paint();
      render();
      const result = await resize();
      const deadline = performance.now() + 1500;
      while (result?.bounds && (innerWidth !== result.bounds.width || innerHeight !== result.bounds.height)) {
        if (performance.now() > deadline) throw new Error('The dock window did not finish resizing.');
        await frame();
      }
      await paint();
      if (id !== sequence) return;
      await window.dock.windowTransition('finish');
      await fade(0, 1, 90);
    }).finally(async () => {
      try { await window.dock.windowTransition('finish'); } catch {}
      if (id === sequence) {
        document.body.style.opacity = '1';
        delete document.body.dataset.layoutTransition;
        busy = false;
      }
    });
    return queue;
  }
  return { run, get busy() { return busy; } };
})();
