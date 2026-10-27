// Tiny WebAudio synth: every sound effect and the shop jingle are generated, no samples.

let ctx = null;
let master = null;
let musicGain = null;
let noiseBuf = null;
let muted = false;

function ensure() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.55;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.22;
  musicGain.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}

function tone(type, f0, f1, dur, vol = 0.3, delay = 0, dest = master) {
  const c = ensure();
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.005, vol, dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, freq, q = 1, vol = 0.4, delay = 0, type = 'bandpass', sweepTo = null) {
  const c = ensure();
  const t = c.currentTime + delay;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  f.Q.value = q;
  const g = c.createGain();
  env(g, t, 0.004, vol, dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

export const sfx = {
  unlock() { ensure(); if (ctx.state === 'suspended') ctx.resume(); },
  setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.55; },
  get muted() { return muted; },
  click() { tone('square', 660, 880, 0.06, 0.12); },
  hover() { tone('triangle', 900, 900, 0.03, 0.05); },
  place() { tone('triangle', 180, 90, 0.12, 0.35); noise(0.06, 800, 2, 0.15); },
  deny() { tone('square', 200, 150, 0.15, 0.15); },
  shatter() {
    noise(0.25, 3200, 1.5, 0.5);
    for (let i = 0; i < 5; i++) tone('triangle', 1800 + Math.random() * 2400, 1200, 0.05, 0.08, 0.02 + i * 0.03);
  },
  boom() {
    noise(0.9, 900, 0.7, 0.9, 0, 'lowpass', 60);
    tone('sine', 120, 30, 0.6, 0.6);
  },
  fuse() { noise(0.9, 5000, 4, 0.12); },
  zap() {
    for (let i = 0; i < 6; i++) tone('sawtooth', 200 + Math.random() * 900, 80 + Math.random() * 200, 0.08, 0.15, i * 0.05);
    noise(0.35, 4000, 3, 0.2);
  },
  bite() { tone('square', 300, 120, 0.08, 0.2); tone('square', 260, 90, 0.08, 0.2, 0.09); },
  pop() { tone('sine', 300, 900, 0.1, 0.3); },
  puff() { noise(0.6, 600, 0.8, 0.35, 0, 'lowpass', 200); },
  splat() { noise(0.3, 400, 2, 0.4, 0, 'lowpass', 120); tone('sine', 140, 60, 0.2, 0.3); },
  buzz() { for (let i = 0; i < 4; i++) tone('sawtooth', 210 + i * 7, 230, 0.6, 0.05, i * 0.04); },
  coin() { tone('square', 988, 988, 0.07, 0.1); tone('square', 1319, 1319, 0.18, 0.1, 0.07); },
  clay() { tone('triangle', 520, 780, 0.08, 0.2); },
  heart() { tone('triangle', 660, 660, 0.08, 0.2); tone('triangle', 880, 880, 0.12, 0.2, 0.08); },
  hurt() { tone('square', 520, 260, 0.18, 0.18); },
  heroGrunt() {
    // a short pitched "hyah!" like an N64 voice clip
    const f = 380 + Math.random() * 80;
    tone('square', f, f * 1.4, 0.07, 0.12);
    tone('sawtooth', f * 1.4, f * 0.9, 0.12, 0.08, 0.06);
  },
  heroLaugh() { for (let i = 0; i < 4; i++) tone('square', 520 - i * 30, 600 - i * 30, 0.07, 0.1, i * 0.1); },
  snore() { noise(0.8, 300, 3, 0.15, 0, 'bandpass', 150); },
  merchantGasp() { tone('triangle', 300, 520, 0.25, 0.2); },
  merchantCheer() { tone('triangle', 400, 600, 0.1, 0.18); tone('triangle', 600, 800, 0.15, 0.18, 0.1); },
  bell() { for (let i = 0; i < 3; i++) { tone('sine', 1568, 1568, 0.8, 0.15, i * 0.25); tone('sine', 2093, 2093, 0.5, 0.06, i * 0.25); } },
  whoosh() { noise(0.3, 600, 1, 0.25, 0, 'bandpass', 2400); },
  wheel() { noise(0.12, 300, 1, 0.08, 0, 'lowpass'); },
  squish() { noise(0.12, 700, 2, 0.12, 0, 'lowpass', 250); },
  fanfare() {
    const notes = [523, 659, 784, 1047, 784, 1047];
    const times = [0, 0.12, 0.24, 0.36, 0.6, 0.72];
    notes.forEach((n, i) => { tone('square', n, n, i === 5 ? 0.7 : 0.14, 0.12, times[i]); tone('triangle', n / 2, n / 2, 0.14, 0.15, times[i]); });
  },
  sad() {
    [392, 370, 349, 330].forEach((n, i) => tone('triangle', n, n * (i === 3 ? 0.9 : 1), i === 3 ? 0.9 : 0.3, 0.2, i * 0.32));
  },
  kiln() { noise(1.6, 300, 0.6, 0.35, 0, 'lowpass', 900); },
  stamp() { tone('sine', 90, 40, 0.3, 0.6); noise(0.15, 1500, 1, 0.3); },
};

// A bouncy little shop loop (original tune), scheduled ahead of time.
const SONG = {
  bpm: 132,
  // scale degrees in C major, 0 = rest; 16 steps per bar, 4 bars
  lead: [
    5, 0, 8, 0, 10, 0, 8, 7, 5, 0, 3, 0, 5, 0, 0, 0,
    6, 0, 9, 0, 11, 0, 9, 8, 6, 0, 4, 0, 6, 0, 0, 0,
    5, 0, 8, 0, 10, 0, 12, 0, 13, 0, 12, 10, 8, 0, 7, 0,
    6, 0, 5, 0, 4, 0, 6, 0, 5, 0, 0, 0, 1, 0, 0, 0,
  ],
  bass: [1, 5, 4, 5],
};
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
function degToFreq(d, base = 261.63) {
  const i = d - 1;
  const oct = Math.floor(i / 7);
  return base * Math.pow(2, (MAJOR[((i % 7) + 7) % 7] + oct * 12) / 12);
}

let musicTimer = null;
let step = 0;
let nextTime = 0;
let musicOn = false;
let tempoMul = 1;

export const music = {
  start(mul = 1) {
    ensure();
    tempoMul = mul;
    if (musicOn) return;
    musicOn = true;
    step = 0;
    nextTime = ctx.currentTime + 0.1;
    musicTimer = setInterval(schedule, 50);
  },
  setTempo(mul) { tempoMul = mul; },
  stop() {
    musicOn = false;
    clearInterval(musicTimer);
  },
};

function schedule() {
  if (!musicOn) return;
  const stepDur = 60 / (SONG.bpm * tempoMul) / 4;
  while (nextTime < ctx.currentTime + 0.2) {
    const s = step % SONG.lead.length;
    const d = SONG.lead[s];
    const delay = nextTime - ctx.currentTime;
    if (d) tone('square', degToFreq(d, 523.25), degToFreq(d, 523.25), stepDur * 1.6, 0.12, delay, musicGain);
    if (s % 4 === 0) {
      const bar = Math.floor(s / 16);
      const root = SONG.bass[bar];
      const f = degToFreq(root, 130.81) * (s % 8 === 0 ? 1 : 1.5);
      tone('triangle', f, f, stepDur * 3, 0.35, delay, musicGain);
    }
    if (s % 4 === 2) {
      noise(0.04, 7000, 1, 0.05, delay);
    }
    nextTime += stepDur;
    step++;
  }
}
