'use strict';

function isHttps(url) {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password; }
  catch { return false; }
}

function panelBounds(anchor, area) {
  const width = Math.min(640, area.width);
  const height = Math.min(760, area.height);
  const x = anchor ? anchor.x + anchor.width - width : area.x + area.width - width - 20;
  const y = anchor ? anchor.y - height - 12 : area.y + 20;
  return { x: Math.max(area.x, Math.min(x, area.x + area.width - width)), y: Math.max(area.y, Math.min(y, area.y + area.height - height)), width, height };
}
module.exports = { isHttps, panelBounds };
