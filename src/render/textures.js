import * as THREE from 'three';

// Hand-painted canvas textures in the spirit of late-90s N64 interiors: soft
// gradients, brushy blotches and blurred grain (no crisp pixel noise), sampled
// with bilinear filtering.

let seed = 1337;
export function srand(s) { seed = s; }
export function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
const rr = (a, b) => a + rand() * (b - a);

const cache = new Map();

export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = opts.mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = !!opts.mips;
  t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.canvas = c;
  return t;
}

function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// 3x3 box blur, wrapping at the edges so tiled textures stay seamless
function soften(g, w, h, passes = 1, wrap = true) {
  for (let p = 0; p < passes; p++) {
    const s = g.getImageData(0, 0, w, h).data;
    const out = new Uint8ClampedArray(s.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, gg = 0, b = 0, a = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            let xx = x + dx, yy = y + dy;
            if (wrap) { xx = (xx + w) % w; yy = (yy + h) % h; } else if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const i = (yy * w + xx) * 4;
            r += s[i]; gg += s[i + 1]; b += s[i + 2]; a += s[i + 3]; n++;
          }
        }
        const o = (y * w + x) * 4;
        out[o] = r / n; out[o + 1] = gg / n; out[o + 2] = b / n; out[o + 3] = a / n;
      }
    }
    g.putImageData(new ImageData(out, w, h), 0, 0);
  }
}

// soft brush dabs, wrapped so the texture tiles
function blotches(g, w, h, n, color, rMin, rMax, aMin, aMax) {
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = rand() * h, r = rr(rMin, rMax), a = rr(aMin, aMax);
    for (const ox of [-w, 0, w]) {
      for (const oy of [-h, 0, h]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, `rgba(${color},${a})`);
        gr.addColorStop(1, `rgba(${color},0)`);
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
}

function grainLines(g, x0, y0, w, h, n, color, alpha) {
  for (let i = 0; i < n; i++) {
    const y = y0 + rand() * h;
    const amp = rr(0.5, 2.5), freq = rr(0.02, 0.08), ph = rand() * 6;
    g.strokeStyle = `rgba(${color},${rr(alpha * 0.5, alpha)})`;
    g.lineWidth = rr(0.6, 1.4);
    g.beginPath();
    for (let x = x0; x <= x0 + w; x += 2) {
      const yy = y + Math.sin(x * freq + ph) * amp;
      if (x === x0) g.moveTo(x, yy); else g.lineTo(x, yy);
    }
    g.stroke();
  }
}

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(c, k) {
  const [r, g, b] = hex(c);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export const tex = {
  floor: () => cached('floor', () => canvasTex(128, 128, (g, w, h) => {
    srand(11);
    const cols = ['#a8693a', '#9a5f34', '#b0743f', '#a06636'];
    const ph = h / 4;
    for (let i = 0; i < 4; i++) {
      const y = i * ph;
      const gr = g.createLinearGradient(0, y, 0, y + ph);
      gr.addColorStop(0, shade(cols[i], 0.12));
      gr.addColorStop(0.5, cols[i]);
      gr.addColorStop(1, shade(cols[i], -0.12));
      g.fillStyle = gr;
      g.fillRect(0, y, w, ph);
      grainLines(g, 0, y + 2, w, ph - 4, 9, '70,35,12', 0.35);
      if (i % 2 === 0) {
        const kx = rr(10, w - 10), ky = y + ph / 2;
        const kg = g.createRadialGradient(kx, ky, 0, kx, ky, 6);
        kg.addColorStop(0, 'rgba(60,28,8,0.7)');
        kg.addColorStop(1, 'rgba(60,28,8,0)');
        g.fillStyle = kg;
        g.fillRect(kx - 7, ky - 5, 14, 10);
      }
      // the gap between boards: a dark seam with a lit lip
      g.fillStyle = 'rgba(40,18,6,0.9)';
      g.fillRect(0, y + ph - 2, w, 2);
      g.fillStyle = 'rgba(255,215,160,0.25)';
      g.fillRect(0, y, w, 1);
      const seam = ((i * 47 + 21) % w);
      g.fillStyle = 'rgba(40,18,6,0.85)';
      g.fillRect(seam, y, 2, ph - 1);
      g.fillStyle = 'rgba(30,12,4,0.9)';
      g.beginPath(); g.arc(seam + 6, y + 6, 1.5, 0, 7); g.arc(seam + 6, y + ph - 7, 1.5, 0, 7); g.fill();
    }
    blotches(g, w, h, 14, '60,30,10', 8, 26, 0.05, 0.12);
    blotches(g, w, h, 8, '255,220,170', 10, 30, 0.04, 0.08);
    soften(g, w, h, 1);
  }, { mips: true })),

  wall: () => cached('wall', () => canvasTex(128, 128, (g, w, h) => {
    srand(21);
    g.fillStyle = '#e0b984';
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, 30, '255,236,200', 10, 34, 0.12, 0.3);
    blotches(g, w, h, 26, '160,100,50', 8, 30, 0.06, 0.16);
    blotches(g, w, h, 10, '120,80,40', 4, 10, 0.08, 0.15);
    g.strokeStyle = 'rgba(110,70,35,0.35)';
    g.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      let x = rand() * w, y = rand() * h;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += rr(-6, 6); y += rr(3, 8); g.lineTo(x, y); }
      g.stroke();
    }
    soften(g, w, h, 2);
  }, { mips: true })),

  wainscot: () => cached('wainscot', () => canvasTex(128, 64, (g, w, h) => {
    srand(31);
    for (let x = 0; x < w; x += 16) {
      const base = x % 32 ? '#7a4626' : '#6e3e20';
      const gr = g.createLinearGradient(x, 0, x + 16, 0);
      gr.addColorStop(0, shade(base, 0.2));
      gr.addColorStop(0.2, base);
      gr.addColorStop(0.85, base);
      gr.addColorStop(1, shade(base, -0.35));
      g.fillStyle = gr;
      g.fillRect(x, 0, 16, h);
    }
    g.save();
    g.rotate(Math.PI / 2);
    grainLines(g, 0, -w, h, w, 30, '40,18,6', 0.3);
    g.restore();
    const rail = g.createLinearGradient(0, 0, 0, 9);
    rail.addColorStop(0, '#b07a48');
    rail.addColorStop(0.5, '#8a5630');
    rail.addColorStop(1, '#3a1d0a');
    g.fillStyle = rail;
    g.fillRect(0, 0, w, 9);
    g.fillStyle = 'rgba(30,12,4,0.5)';
    g.fillRect(0, h - 3, w, 3);
    soften(g, w, h, 1);
  }, { mips: true })),

  darkWood: () => cached('darkWood', () => canvasTex(64, 64, (g, w, h) => {
    srand(41);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#6a3c1c');
    gr.addColorStop(1, '#552e14');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    grainLines(g, 0, 0, w, h, 18, '25,10,2', 0.4);
    blotches(g, w, h, 8, '255,200,140', 6, 16, 0.04, 0.08);
    soften(g, w, h, 1);
  }, { mips: true })),

  lightWood: () => cached('lightWood', () => canvasTex(64, 64, (g, w, h) => {
    srand(42);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#c48e55');
    gr.addColorStop(1, '#a8743f');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    grainLines(g, 0, 0, w, h, 14, '90,45,12', 0.35);
    g.fillStyle = 'rgba(60,30,10,0.6)';
    g.fillRect(0, 0, w, 2);
    g.fillStyle = 'rgba(255,230,190,0.35)';
    g.fillRect(0, 2, w, 1);
    soften(g, w, h, 1);
  }, { mips: true })),

  crate: () => cached('crate', () => canvasTex(64, 64, (g, w, h) => {
    srand(51);
    g.fillStyle = '#b58650';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      grainLines(g, 0, y + 2, w, 12, 4, '90,50,15', 0.35);
      g.fillStyle = 'rgba(70,35,10,0.6)';
      g.fillRect(0, y + 15, w, 1);
    }
    const frame = (x, y, fw, fh) => {
      const gr = g.createLinearGradient(x, y, x + fw, y + fh);
      gr.addColorStop(0, '#8e5e2c');
      gr.addColorStop(1, '#5a3612');
      g.fillStyle = gr;
      g.fillRect(x, y, fw, fh);
    };
    frame(0, 0, w, 7); frame(0, h - 7, w, 7); frame(0, 0, 7, h); frame(w - 7, 0, 7, h);
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(Math.PI / 4);
    frame(-4, -w * 0.62, 8, w * 1.24);
    g.restore();
    g.fillStyle = '#3a3a40';
    for (const [x, y] of [[4, 4], [w - 4, 4], [4, h - 4], [w - 4, h - 4]]) { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }
    soften(g, w, h, 1);
  }, { mips: true })),

  barrel: () => cached('barrel', () => canvasTex(64, 64, (g, w, h) => {
    srand(61);
    for (let x = 0; x < w; x += 8) {
      const base = x % 16 ? '#97602f' : '#8a5529';
      const gr = g.createLinearGradient(x, 0, x + 8, 0);
      gr.addColorStop(0, shade(base, -0.3));
      gr.addColorStop(0.4, shade(base, 0.1));
      gr.addColorStop(1, shade(base, -0.25));
      g.fillStyle = gr;
      g.fillRect(x, 0, 8, h);
    }
    for (const y of [8, h - 14]) {
      const gr = g.createLinearGradient(0, y, 0, y + 6);
      gr.addColorStop(0, '#9aa0a6');
      gr.addColorStop(0.5, '#5a5f66');
      gr.addColorStop(1, '#2e3136');
      g.fillStyle = gr;
      g.fillRect(0, y, w, 6);
    }
    soften(g, w, h, 1);
  }, { mips: true })),

  stone: () => cached('stone', () => canvasTex(64, 64, (g, w, h) => {
    srand(71);
    g.fillStyle = '#4e463e';
    g.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 8 : 0;
      for (let col = -1; col < 4; col++) {
        const x = col * 16 + off + 1, y = row * 16 + 1;
        const base = ['#9a9184', '#8c8376', '#a39a8c'][(row + col + 3) % 3];
        const gr = g.createRadialGradient(x + 6, y + 5, 1, x + 8, y + 8, 12);
        gr.addColorStop(0, shade(base, 0.2));
        gr.addColorStop(1, shade(base, -0.25));
        g.fillStyle = gr;
        g.beginPath();
        g.roundRect(x, y, 14, 14, 4);
        g.fill();
      }
    }
    blotches(g, w, h, 10, '60,70,40', 3, 8, 0.1, 0.2);
    soften(g, w, h, 1);
  }, { mips: true })),

  rug: () => cached('rug', () => canvasTex(128, 128, (g, w, h) => {
    srand(81);
    const red = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7);
    red.addColorStop(0, '#a8282a');
    red.addColorStop(1, '#7a1a1c');
    g.fillStyle = red;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e0b04a';
    g.lineWidth = 5;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.strokeStyle = '#1f3c6e';
    g.lineWidth = 3;
    g.strokeRect(15, 15, w - 30, h - 30);
    const dia = (r, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(w / 2, h / 2 - r); g.lineTo(w / 2 + r, h / 2); g.lineTo(w / 2, h / 2 + r); g.lineTo(w / 2 - r, h / 2); g.closePath(); g.fill(); };
    dia(42, '#1f3c6e'); dia(32, '#e0b04a'); dia(22, '#a8282a'); dia(10, '#f0e0b0');
    for (const [x, y] of [[26, 26], [w - 26, 26], [26, h - 26], [w - 26, h - 26]]) {
      g.fillStyle = '#e0b04a'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill();
    }
    g.fillStyle = '#f0e0b0';
    for (let x = 4; x < w; x += 6) { g.fillRect(x, 0, 2, 5); g.fillRect(x, h - 5, 2, 5); }
    blotches(g, w, h, 12, '40,10,10', 8, 20, 0.05, 0.12);
    soften(g, w, h, 1, false);
  }, { clamp: true, mips: true })),

  shadow: () => cached('shadow', () => canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(20,8,0,0.6)');
    gr.addColorStop(0.55, 'rgba(20,8,0,0.38)');
    gr.addColorStop(1, 'rgba(20,8,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }, { clamp: true })),

  softDot: () => cached('softDot', () => canvasTex(32, 32, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }, { clamp: true })),

  puff: () => cached('puff', () => canvasTex(64, 64, (g, w, h) => {
    srand(91);
    for (let i = 0; i < 9; i++) {
      const x = rr(18, 46), y = rr(18, 46), r = rr(12, 20);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.8)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }
  }, { clamp: true })),

  star: () => cached('star', () => canvasTex(64, 64, (g, w, h) => {
    const glow = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    glow.addColorStop(0, 'rgba(255,250,200,0.8)');
    glow.addColorStop(1, 'rgba(255,240,150,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff6b0';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 9 : 24;
      g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  }, { clamp: true })),

  zzz: () => cached('zzz', () => canvasTex(32, 32, (g, w, h) => {
    g.fillStyle = '#e8d8ff';
    g.strokeStyle = '#3a1f6e';
    g.lineWidth = 3;
    g.font = 'bold 26px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.strokeText('Z', w / 2, h / 2 + 1);
    g.fillText('Z', w / 2, h / 2 + 1);
  }, { clamp: true })),

  window: () => cached('window', () => canvasTex(64, 96, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#8fd0ff');
    gr.addColorStop(0.7, '#e8f6ff');
    gr.addColorStop(1, '#fff2c8');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    blotches(g, w, h * 0.5, 4, '255,255,255', 8, 16, 0.4, 0.7);
    const frame = (x, y, fw, fh) => {
      const fg = g.createLinearGradient(x, y, x + fw, y + fh);
      fg.addColorStop(0, '#7a4a24');
      fg.addColorStop(1, '#3e200c');
      g.fillStyle = fg;
      g.fillRect(x, y, fw, fh);
    };
    frame(0, 0, w, 6); frame(0, h - 6, w, 6); frame(0, 0, 6, h); frame(w - 6, 0, 6, h);
    frame(w / 2 - 2, 0, 4, h); frame(0, h / 2 - 2, w, 4);
    soften(g, w, h, 1, false);
  }, { clamp: true })),

  doorway: () => cached('doorway', () => canvasTex(64, 96, (g, w, h) => {
    srand(95);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#9fdcff');
    gr.addColorStop(0.62, '#fff4d0');
    gr.addColorStop(0.64, '#8ccc6a');
    gr.addColorStop(1, '#4e8e3a');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    blotches(g, w, h * 0.5, 5, '255,255,255', 6, 14, 0.4, 0.7);
    g.fillStyle = 'rgba(60,110,50,0.8)';
    for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(rr(0, w), h * 0.6, rr(8, 16), rr(6, 12), 0, 0, 7); g.fill(); }
    soften(g, w, h, 2, false);
  }, { clamp: true })),

  door: () => cached('door', () => canvasTex(64, 96, (g, w, h) => {
    srand(101);
    for (let x = 0; x < w; x += 16) {
      const base = x % 32 ? '#86522a' : '#784824';
      const gr = g.createLinearGradient(x, 0, x + 16, 0);
      gr.addColorStop(0, shade(base, 0.15));
      gr.addColorStop(0.8, base);
      gr.addColorStop(1, shade(base, -0.4));
      g.fillStyle = gr;
      g.fillRect(x, 0, 16, h);
    }
    g.save(); g.rotate(Math.PI / 2); grainLines(g, 0, -w, h, w, 20, '40,18,6', 0.3); g.restore();
    for (const y of [14, h - 20]) {
      const gr = g.createLinearGradient(0, y, 0, y + 6);
      gr.addColorStop(0, '#8a8e94');
      gr.addColorStop(1, '#34363a');
      g.fillStyle = gr;
      g.fillRect(0, y, w, 6);
    }
    g.strokeStyle = '#d9a43a';
    g.lineWidth = 2;
    g.beginPath(); g.arc(w - 12, h / 2, 5, 0, 7); g.stroke();
    soften(g, w, h, 1, false);
  })),

  sign: (text, bg = '#4a2c14', fg = '#f6d27a') => cached('sign' + text, () => canvasTex(256, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, shade(bg, 0.15));
    gr.addColorStop(1, shade(bg, -0.3));
    g.fillStyle = gr;
    g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 12); g.fill();
    g.strokeStyle = '#1e1008';
    g.lineWidth = 5;
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.font = '36px "Lilita One", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2 + 2, h / 2 + 4);
    g.fillStyle = fg;
    g.fillText(text, w / 2, h / 2 + 2);
  }, { clamp: true, mips: true })),

  merchantBody: () => cached('merchantBody', () => canvasTex(128, 64, (g, w, h) => {
    srand(131);
    // u wraps around the belly with u=0 facing forward; the canvas top is the chest
    const vest = g.createLinearGradient(0, 0, 0, h);
    vest.addColorStop(0, '#8a4626');
    vest.addColorStop(1, '#6a321a');
    g.fillStyle = vest;
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, 10, '40,15,5', 6, 14, 0.08, 0.15);
    const shirt = (x0, x1) => {
      const gr = g.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, '#f6eed8');
      gr.addColorStop(1, '#ddd0b0');
      g.fillStyle = gr;
      g.fillRect(x0, 0, x1 - x0, 44);
    };
    shirt(0, 18);
    shirt(w - 18, w);
    g.fillStyle = 'rgba(60,25,8,0.6)';
    g.fillRect(18, 0, 2, 44);
    g.fillRect(w - 20, 0, 2, 44);
    g.fillStyle = '#e8b84a';
    for (const y of [12, 24, 36]) { g.beginPath(); g.arc(22, y, 2, 0, 7); g.arc(w - 22, y, 2, 0, 7); g.fill(); }
    const sash = g.createLinearGradient(0, 42, 0, 52);
    sash.addColorStop(0, '#d8383a');
    sash.addColorStop(1, '#8a1416');
    g.fillStyle = sash;
    g.fillRect(0, 42, w, 10);
    g.fillStyle = '#4a3022';
    g.fillRect(0, 52, w, h - 52);
    soften(g, w, h, 1);
  })),

  apron: () => cached('apron', () => canvasTex(64, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#d8ccb0');
    gr.addColorStop(0.5, '#fbf6e8');
    gr.addColorStop(1, '#d8ccb0');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(150,120,80,0.25)';
    for (let x = 6; x < w; x += 12) g.fillRect(x, 0, 2, h);
    g.fillStyle = 'rgba(160,90,40,0.35)';
    g.beginPath(); g.ellipse(40, 40, 7, 4, 0.4, 0, 7); g.fill();
    soften(g, w, h, 1);
  })),

  tunic: () => cached('tunic', () => canvasTex(128, 64, (g, w, h) => {
    srand(141);
    // the canvas bottom (v=0) is the hem, cut into leaf points
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#5cc048');
    gr.addColorStop(1, '#3a8a2c');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(w, 0);
    const leaves = 10, lw = w / leaves;
    g.lineTo(w, h - 14);
    for (let i = leaves - 1; i >= 0; i--) {
      g.quadraticCurveTo(i * lw + lw * 0.9, h - 6, i * lw + lw / 2, h);
      g.quadraticCurveTo(i * lw + lw * 0.1, h - 6, i * lw, h - 14);
    }
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 12; i++) {
      const x = rand() * w;
      const fg = g.createLinearGradient(x - 5, 0, x + 5, 0);
      fg.addColorStop(0, 'rgba(20,60,10,0)');
      fg.addColorStop(0.5, 'rgba(20,60,10,0.25)');
      fg.addColorStop(1, 'rgba(20,60,10,0)');
      g.fillStyle = fg;
      g.fillRect(x - 5, 10, 10, h);
    }
    g.strokeStyle = 'rgba(30,80,20,0.6)';
    g.lineWidth = 1.2;
    for (let i = 0; i < leaves; i++) {
      g.beginPath(); g.moveTo(i * lw + lw / 2, h - 18); g.lineTo(i * lw + lw / 2, h - 2); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
  })),

  hair: () => cached('hair', () => canvasTex(64, 64, (g, w, h) => {
    srand(151);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#f08a3a');
    gr.addColorStop(1, '#a8481a');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const x = rand() * w;
      g.strokeStyle = rand() < 0.5 ? 'rgba(255,200,120,0.35)' : 'rgba(90,30,8,0.35)';
      g.lineWidth = rr(1, 2);
      g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + rr(-6, 6), h / 2, x + rr(-4, 4), h); g.stroke();
    }
    soften(g, w, h, 1);
  })),

  feather: () => cached('feather', () => canvasTex(32, 128, (g, w, h) => {
    g.fillStyle = '#e83a2a';
    g.beginPath();
    g.moveTo(w / 2, 2);
    g.quadraticCurveTo(w - 1, h * 0.35, w / 2 + 3, h - 6);
    g.lineTo(w / 2 - 3, h - 6);
    g.quadraticCurveTo(1, h * 0.35, w / 2, 2);
    g.fill();
    g.strokeStyle = 'rgba(120,10,5,0.7)';
    g.lineWidth = 1;
    for (let y = 10; y < h - 10; y += 5) {
      g.beginPath(); g.moveTo(w / 2, y); g.lineTo(3, y - 6); g.moveTo(w / 2, y); g.lineTo(w - 3, y - 6); g.stroke();
    }
    g.strokeStyle = '#fff0d0';
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(w / 2, 4); g.lineTo(w / 2, h); g.stroke();
  }, { clamp: true })),

  leaf: () => cached('leafTex', () => canvasTex(64, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#2e7a24');
    gr.addColorStop(0.5, '#6ac44a');
    gr.addColorStop(1, '#2e7a24');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(220,255,180,0.6)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    g.lineWidth = 1;
    for (let y = 6; y < h; y += 9) {
      g.beginPath(); g.moveTo(w / 2, y + 6); g.lineTo(6, y); g.moveTo(w / 2, y + 6); g.lineTo(w - 6, y); g.stroke();
    }
    soften(g, w, h, 1);
  })),

  stem: () => cached('stem', () => canvasTex(32, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#2a6a1e');
    gr.addColorStop(0.5, '#58ac3a');
    gr.addColorStop(1, '#2a6a1e');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(200,240,140,0.35)';
    for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 2);
    soften(g, w, h, 1);
  })),

  plantHead: () => cached('plantHead', () => canvasTex(128, 64, (g, w, h) => {
    srand(111);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#e83a3a');
    gr.addColorStop(1, '#9a1420');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) {
      const x = rand() * w, y = rr(4, h * 0.8), r = rr(3, 6);
      const sg = g.createRadialGradient(x - 1, y - 1, 0, x, y, r);
      sg.addColorStop(0, '#fffaf0');
      sg.addColorStop(1, '#f0d8b0');
      g.fillStyle = sg;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    soften(g, w, h, 1);
  })),

  clayWet: () => cached('clayWet', () => canvasTex(128, 128, (g, w, h) => {
    srand(121);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#b87a50');
    gr.addColorStop(1, '#9a5e3a');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    // throwing rings: soft horizontal ridges that read as spin
    for (let y = 0; y < h; y += 4) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '255,215,175' : '80,35,12'},${rr(0.06, 0.16)})`;
      g.fillRect(0, y, w, 2);
    }
    for (let i = 0; i < 26; i++) {
      g.fillStyle = 'rgba(255,230,200,0.22)';
      g.beginPath(); g.ellipse(rand() * w, rand() * h, rr(6, 18), 1.2, 0, 0, 7); g.fill();
    }
    soften(g, w, h, 1);
  })),

  lightSpill: () => cached('lightSpill', () => canvasTex(64, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,240,200,0.9)');
    gr.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(w * 0.2, 0); g.lineTo(w * 0.8, 0); g.lineTo(w, h); g.lineTo(0, h);
    g.closePath();
    g.fill();
    const side = g.createLinearGradient(0, 0, w, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)');
    side.addColorStop(0.3, 'rgba(0,0,0,0)');
    side.addColorStop(0.7, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = side;
    g.fillRect(0, 0, w, h);
  }, { clamp: true })),
};

// Glazed pot texture: u wraps around the pot, v runs bottom (0) to top (1).
export function potTexture(recipe) {
  return cached('pot_' + recipe.id, () => canvasTex(128, 128, (g, w, h) => {
    srand(recipe.id.length * 97 + 5);
    const gr = g.createLinearGradient(0, h, 0, 0);
    gr.addColorStop(0, recipe.glazeDark);
    gr.addColorStop(0.6, recipe.glaze);
    gr.addColorStop(1, shade(recipe.glaze, 0.15));
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, 16, '255,255,255', 6, 18, 0.04, 0.1);
    blotches(g, w, h, 16, '0,0,0', 6, 18, 0.05, 0.12);
    // glaze drips running down from the rim
    for (let i = 0; i < 9; i++) {
      const x = rand() * w, len = rr(8, 26);
      const dg = g.createLinearGradient(0, 0, 0, len);
      dg.addColorStop(0, shade(recipe.glaze, 0.3));
      dg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = dg;
      g.beginPath(); g.ellipse(x, len / 2, 2.5, len / 2, 0, 0, 7); g.fill();
    }
    const band = (y, hh) => {
      const bg = g.createLinearGradient(0, y, 0, y + hh);
      bg.addColorStop(0, shade(recipe.band, 0.25));
      bg.addColorStop(1, shade(recipe.band, -0.3));
      g.fillStyle = bg;
      g.fillRect(0, y, w, hh);
    };
    band(18, 7);
    band(h - 34, 5);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, 25, w, 2);
    for (let i = 0; i < 2; i++) drawSymbol(g, recipe.symbol, 32 + i * 64, 64, recipe.band, 1.9);
    soften(g, w, h, 1);
  }, { mips: true }));
}

export function drawSymbol(g, symbol, x, y, color, s = 1) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineWidth = 2;
  switch (symbol) {
    case 'gem':
      g.beginPath(); g.moveTo(0, -9); g.lineTo(7, 0); g.lineTo(0, 9); g.lineTo(-7, 0); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(-2, -5, 2, 5);
      break;
    case 'bomb':
      g.beginPath(); g.arc(0, 2, 7, 0, Math.PI * 2); g.fill();
      g.fillRect(-2, -8, 4, 4);
      g.fillStyle = '#ffdd55'; g.fillRect(1, -11, 3, 3);
      break;
    case 'leaf':
      g.beginPath(); g.ellipse(0, 0, 5, 9, 0.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.moveTo(-3, 6); g.lineTo(3, -6); g.stroke();
      break;
    case 'bolt':
      g.beginPath(); g.moveTo(2, -10); g.lineTo(-5, 1); g.lineTo(0, 1); g.lineTo(-2, 10); g.lineTo(6, -2); g.lineTo(1, -2); g.closePath(); g.fill();
      break;
    case 'moon': {
      // cut the crescent on a scratch canvas so the glaze underneath stays intact
      const c = document.createElement('canvas');
      c.width = c.height = 20;
      const m = c.getContext('2d');
      m.fillStyle = color;
      m.beginPath(); m.arc(10, 10, 8, 0, Math.PI * 2); m.fill();
      m.globalCompositeOperation = 'destination-out';
      m.beginPath(); m.arc(14, 7, 7, 0, Math.PI * 2); m.fill();
      g.drawImage(c, -10, -10);
      break;
    }
    case 'drop':
      g.beginPath(); g.moveTo(0, -10); g.quadraticCurveTo(8, 2, 0, 9); g.quadraticCurveTo(-8, 2, 0, -10); g.fill();
      break;
    case 'bee':
      g.beginPath(); g.ellipse(0, 0, 8, 6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(-3, -6, 2, 12); g.fillRect(2, -6, 2, 12);
      break;
    default:
      g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// ------------------------------------------------------------------ faces
// Heads are spheres. These textures wrap all the way round: u=0.25 faces
// forward and the canvas top is the crown. Eyes are painted big and glossy.

function paintEye(g, x, y, opts) {
  const { w = 7, h = 9, iris = '#3a7ad8', look = 0, lid = 0, lineColor = '#2a1408' } = opts;
  g.save();
  g.fillStyle = '#fffdf6';
  g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, 0, 7); g.fill();
  g.clip();
  const ig = g.createRadialGradient(x + look, y, 0.5, x + look, y + 0.5, w * 0.36);
  ig.addColorStop(0, shade(iris, 0.35));
  ig.addColorStop(1, shade(iris, -0.35));
  g.fillStyle = ig;
  g.beginPath(); g.ellipse(x + look, y + 0.5, w * 0.34, h * 0.36, 0, 0, 7); g.fill();
  g.fillStyle = '#100804';
  g.beginPath(); g.ellipse(x + look, y + 0.8, w * 0.15, h * 0.18, 0, 0, 7); g.fill();
  if (lid > 0) {
    g.fillStyle = opts.skin || '#f2c197';
    g.fillRect(x - w, y - h, w * 2, h * lid);
  }
  g.restore();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(x + look - w * 0.12, y - h * 0.12, 1.1, 0, 7); g.fill();
  g.strokeStyle = lineColor;
  g.lineCap = 'round';
  g.lineWidth = 2.2;
  g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, Math.PI * 1.02, Math.PI * 1.98); g.stroke();
  g.lineWidth = 1.2;
  g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
  const side = opts.side || 1;
  g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(x + side * w * 0.48, y - h * 0.12); g.lineTo(x + side * w * 0.72, y - h * 0.32); g.stroke();
}

function closedEye(g, x, y, w, color = '#2a1408') {
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineWidth = 2;
  g.beginPath(); g.arc(x, y - 1, w * 0.48, 0.25, Math.PI - 0.25); g.stroke();
}

function skinBase(g, w, h, skin, dark) {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, skin);
  gr.addColorStop(0.7, skin);
  gr.addColorStop(1, dark);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  const back = g.createLinearGradient(0, 0, w, 0);
  back.addColorStop(0, 'rgba(0,0,0,0)');
  back.addColorStop(0.5, 'rgba(0,0,0,0)');
  back.addColorStop(0.75, 'rgba(60,20,0,0.12)');
  back.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = back;
  g.fillRect(0, 0, w, h);
}

export function heroFace(expr, closed = false) {
  return cached(`hface_${expr}_${closed}`, () => canvasTex(128, 64, (g, w, h) => {
    const skin = '#f4c49a';
    skinBase(g, w, h, skin, '#d89a70');
    const cx = 32, ey = 30;
    const blush = (x) => { const b = g.createRadialGradient(x, 38, 0, x, 38, 5); b.addColorStop(0, 'rgba(240,110,90,0.55)'); b.addColorStop(1, 'rgba(240,110,90,0)'); g.fillStyle = b; g.fillRect(x - 6, 32, 12, 12); };
    blush(cx - 11); blush(cx + 11);
    g.fillStyle = 'rgba(170,90,50,0.6)';
    for (const [x, y] of [[-12, 35], [-10, 37], [-13, 38], [12, 35], [10, 37], [13, 38]]) { g.beginPath(); g.arc(cx + x, y, 0.6, 0, 7); g.fill(); }
    const eyes = (o) => {
      const ew = (o.w || 9) + 1.5, eh = (o.h || 11) + 1.5;
      if (closed) { closedEye(g, cx - 8.5, ey, ew); closedEye(g, cx + 8.5, ey, ew); return; }
      paintEye(g, cx - 8.5, ey, { ...o, w: ew, h: eh, skin, side: -1 });
      paintEye(g, cx + 8.5, ey, { ...o, w: ew, h: eh, skin, side: 1, look: -(o.look || 0) });
    };
    const brows = (tilt, y = 22) => {
      g.strokeStyle = '#8a3a12';
      g.lineWidth = 2.4;
      g.lineCap = 'round';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx - 14, y + tilt); g.quadraticCurveTo(cx - 9, y - 3, cx - 3, y - tilt); g.stroke();
      g.beginPath(); g.moveTo(cx + 3, y - tilt); g.quadraticCurveTo(cx + 9, y - 3, cx + 14, y + tilt); g.stroke();
    };
    const mouth = (kind) => {
      g.lineCap = 'round';
      if (kind === 'grin') {
        g.fillStyle = '#7a1e1a';
        g.beginPath(); g.moveTo(cx - 8, 41); g.quadraticCurveTo(cx, 50, cx + 8, 41); g.closePath(); g.fill();
        g.fillStyle = '#fff';
        g.beginPath(); g.moveTo(cx - 7, 41.5); g.quadraticCurveTo(cx, 44, cx + 7, 41.5); g.lineTo(cx + 6, 43); g.quadraticCurveTo(cx, 45, cx - 6, 43); g.fill();
      } else if (kind === 'o') {
        g.fillStyle = '#6a1414';
        g.beginPath(); g.ellipse(cx, 44, 3.5, 4.5, 0, 0, 7); g.fill();
      } else if (kind === 'flat') {
        g.strokeStyle = '#7a1e1a'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(cx - 4, 44); g.lineTo(cx + 4, 44); g.stroke();
      } else if (kind === 'teeth') {
        g.fillStyle = '#6a1414';
        g.beginPath(); g.roundRect(cx - 7, 40, 14, 7, 3); g.fill();
        g.fillStyle = '#fff';
        g.fillRect(cx - 6, 40.5, 12, 2.5);
        g.fillRect(cx - 6, 44.5, 12, 2);
      }
    };
    switch (expr) {
      case 'sleep':
        g.strokeStyle = '#3a1a08'; g.lineWidth = 1.6;
        for (const x of [cx - 7, cx + 7]) { g.beginPath(); g.arc(x, ey, 3.5, 0.2, Math.PI - 0.2); g.stroke(); }
        brows(-1, 24); mouth('o');
        break;
      case 'ko':
        g.strokeStyle = '#3a1a08'; g.lineWidth = 1.8;
        for (const x of [cx - 7, cx + 7]) {
          g.beginPath(); g.moveTo(x - 3, ey - 3); g.lineTo(x + 3, ey + 3); g.moveTo(x + 3, ey - 3); g.lineTo(x - 3, ey + 3); g.stroke();
        }
        brows(2); mouth('o');
        break;
      case 'hurt':
        eyes({ w: 7, h: 6, lid: 0.35 }); brows(3, 24); mouth('teeth');
        break;
      case 'zap':
        eyes({ w: 8, h: 10, iris: '#f0d040' }); brows(-2, 20); mouth('teeth');
        break;
      case 'angry':
        eyes({ w: 7, h: 8, lid: 0.3 }); brows(-3, 24); mouth('flat');
        break;
      case 'crazy':
        eyes({ w: 8, h: 10, look: 1.2 }); brows(-2, 21); mouth('grin');
        break;
      default:
        eyes({ w: 7, h: 9, look: 0.6 }); brows(-1); mouth('grin');
    }
  }));
}

export function merchantFace(expr, closed = false) {
  return cached(`mface_${expr}_${closed}`, () => canvasTex(128, 64, (g, w, h) => {
    const skin = '#e4a87c';
    skinBase(g, w, h, skin, '#c07a52');
    const cx = 32, ey = 27;
    const blush = (x) => { const b = g.createRadialGradient(x, 34, 0, x, 34, 6); b.addColorStop(0, 'rgba(220,90,70,0.5)'); b.addColorStop(1, 'rgba(220,90,70,0)'); g.fillStyle = b; g.fillRect(x - 7, 27, 14, 14); };
    blush(cx - 12); blush(cx + 12);
    const shine = g.createRadialGradient(cx - 4, 6, 0, cx - 4, 6, 12);
    shine.addColorStop(0, 'rgba(255,240,220,0.5)');
    shine.addColorStop(1, 'rgba(255,240,220,0)');
    g.fillStyle = shine;
    g.fillRect(cx - 18, 0, 30, 16);
    const eyes = (o) => {
      const ew = (o.w || 7) + 1.5, eh = (o.h || 8) + 1;
      if (closed) { closedEye(g, cx - 8, ey, ew); closedEye(g, cx + 8, ey, ew); return; }
      paintEye(g, cx - 8, ey, { iris: '#5a3a1a', skin, ...o, w: ew, h: eh, side: -1 });
      paintEye(g, cx + 8, ey, { iris: '#5a3a1a', skin, ...o, w: ew, h: eh, side: 1 });
    };
    const lids = (y) => {
      g.strokeStyle = '#3a2210'; g.lineWidth = 1.6;
      for (const x of [cx - 7, cx + 7]) { g.beginPath(); g.arc(x, y, 3.5, Math.PI + 0.3, -0.3); g.stroke(); }
    };
    const mouth = (kind) => {
      if (kind === 'o') { g.fillStyle = '#5a1010'; g.beginPath(); g.ellipse(cx, 45, 4, 5, 0, 0, 7); g.fill(); }
      if (kind === 'smile') {
        g.fillStyle = '#6a1414';
        g.beginPath(); g.moveTo(cx - 7, 43); g.quadraticCurveTo(cx, 51, cx + 7, 43); g.closePath(); g.fill();
        g.fillStyle = '#fff'; g.fillRect(cx - 5, 43, 10, 2);
      }
      if (kind === 'frown') {
        g.strokeStyle = '#5a1010'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(cx - 5, 47); g.quadraticCurveTo(cx, 43, cx + 5, 47); g.stroke();
      }
    };
    switch (expr) {
      case 'happy':
        g.strokeStyle = '#3a2210'; g.lineWidth = 1.8;
        for (const x of [cx - 7, cx + 7]) { g.beginPath(); g.arc(x, ey + 2, 3.5, Math.PI + 0.2, -0.2); g.stroke(); }
        mouth('smile');
        break;
      case 'cry':
        lids(ey + 1);
        g.fillStyle = 'rgba(120,200,255,0.85)';
        for (const x of [cx - 8, cx + 8]) { g.beginPath(); g.roundRect(x - 1.5, ey + 2, 3, 14, 1.5); g.fill(); }
        mouth('o');
        break;
      case 'shock':
        eyes({ w: 8, h: 10 }); mouth('o');
        break;
      case 'angry':
        eyes({ w: 7, h: 7, lid: 0.4 }); mouth('frown');
        break;
      default:
        eyes({ w: 7, h: 8, lid: 0.3 });
    }
  }));
}
