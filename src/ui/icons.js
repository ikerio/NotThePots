import { RECIPES, profileAt } from '../game/recipes.js';
import { drawSymbol } from '../render/textures.js';

// Flat silhouette icon of a pot profile, used on cards and recipe sheets.
export function drawPotIcon(canvas, recipeId, profile, opts = {}) {
  const r = RECIPES[recipeId];
  const p = profile || r.profile;
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  if (!opts.keep) g.clearRect(0, 0, w, h);
  const maxH = opts.maxH || 1.6;
  const s = (h * 0.86) / maxH;
  const cx = w / 2, base = h * 0.94;
  const steps = 40;
  g.beginPath();
  g.moveTo(cx, base);
  for (let i = 0; i <= steps; i++) {
    const y = (i / steps) * p.h;
    g.lineTo(cx + profileAt(p, y) * s, base - y * s);
  }
  for (let i = steps; i >= 0; i--) {
    const y = (i / steps) * p.h;
    g.lineTo(cx - profileAt(p, y) * s, base - y * s);
  }
  g.closePath();
  if (opts.outline) {
    g.setLineDash(opts.dash || []);
    g.lineWidth = opts.lineWidth || 2;
    g.strokeStyle = opts.outline;
    g.stroke();
    g.setLineDash([]);
    return;
  }
  const gr = g.createLinearGradient(cx - 0.6 * s, 0, cx + 0.6 * s, 0);
  gr.addColorStop(0, r.glazeDark);
  gr.addColorStop(0.45, r.glaze);
  gr.addColorStop(1, r.glazeDark);
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(20,10,4,0.8)';
  g.stroke();
  g.save();
  g.clip();
  g.fillStyle = r.band;
  g.fillRect(0, base - p.h * s * 0.82, w, Math.max(2, h * 0.04));
  g.restore();
  drawSymbol(g, r.symbol, cx, base - p.h * s * 0.45, r.band, Math.max(0.6, (h / 64) * 0.9));
}

export function iconCanvas(recipeId, profile, size = 64, opts) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  drawPotIcon(c, recipeId, profile, opts);
  return c;
}

export const HEART_SVG = '<svg viewBox="0 0 24 22"><path d="M12 21 C 6 16, 1 12, 1 7 C 1 3, 4 1, 7 1 C 9.5 1, 11 2.5, 12 4 C 13 2.5, 14.5 1, 17 1 C 20 1, 23 3, 23 7 C 23 12, 18 16, 12 21 Z"/></svg>';
