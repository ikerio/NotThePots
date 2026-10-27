// Pot types. Each recipe has a target silhouette the player shapes on the wheel.
// Profiles are radii sampled from the base (t=0) to the rim (t=1) in wheel units.

export const PROFILE_N = 16;
export const WHEEL_MAX_R = 1.0;
export const WHEEL_MAX_H = 1.6;

function keys(points) {
  return (t) => {
    for (let i = 0; i < points.length - 1; i++) {
      const [t0, r0] = points[i];
      const [t1, r1] = points[i + 1];
      if (t >= t0 && t <= t1) {
        const k = (t - t0) / (t1 - t0 || 1);
        const s = (1 - Math.cos(k * Math.PI)) / 2;
        return r0 + (r1 - r0) * s;
      }
    }
    return points[points.length - 1][1];
  };
}

export function sampleProfile(h, fn) {
  const r = [];
  for (let i = 0; i < PROFILE_N; i++) r.push(fn(i / (PROFILE_N - 1)));
  return { h, r };
}

export const RECIPES = {
  merch: {
    id: 'merch', name: 'Fine Merchandise', short: 'Merch',
    desc: 'Your precious stock. Lose them all and the shop goes bust.',
    cost: 0, cooldown: 0,
    glaze: '#5c86d6', glazeDark: '#22346e', band: '#f3d36b', symbol: 'gem', color: '#f3d36b',
    profile: sampleProfile(1.25, keys([[0, 0.3], [0.3, 0.56], [0.6, 0.46], [0.84, 0.2], [1, 0.3]])),
  },
  bomb: {
    id: 'bomb', name: 'Boom Pot', short: 'Boom',
    desc: 'The fuse lights the moment it is lifted. The blast sets off any other trap pots nearby (your merchandise is blast-proof).',
    effect: 'Explodes · 2 dmg · chain reacts',
    cost: 4, cooldown: 7,
    glaze: '#474b57', glazeDark: '#1b1d24', band: '#e8613e', symbol: 'bomb', color: '#e8613e',
    profile: sampleProfile(1.0, keys([[0, 0.24], [0.12, 0.46], [0.42, 0.6], [0.7, 0.47], [0.86, 0.17], [1, 0.14]])),
  },
  snapper: {
    id: 'snapper', name: 'Snapper Pot', short: 'Snapper',
    desc: 'A hungry potted plant waits inside. It bursts out and keeps biting anyone who comes close.',
    effect: 'Plant turret · bites 0.5 dmg',
    cost: 5, cooldown: 9,
    glaze: '#4f8a3a', glazeDark: '#1f4418', band: '#d7e86a', symbol: 'leaf', color: '#8fd45a',
    profile: sampleProfile(1.15, keys([[0, 0.3], [0.3, 0.35], [0.65, 0.45], [0.9, 0.62], [1, 0.68]])),
  },
  zap: {
    id: 'zap', name: 'Zap Jar', short: 'Zap',
    desc: 'Stores a nasty static charge. Whoever touches it gets fried and paralyzed.',
    effect: 'Shock · 1 dmg · paralyzes',
    cost: 5, cooldown: 9,
    glaze: '#2f5f9e', glazeDark: '#132a4e', band: '#ffe14a', symbol: 'bolt', color: '#ffe14a',
    profile: sampleProfile(1.45, keys([[0, 0.36], [0.17, 0.43], [0.3, 0.29], [0.5, 0.29], [0.62, 0.43], [0.75, 0.29], [0.92, 0.2], [1, 0.27]])),
  },
  snooze: {
    id: 'snooze', name: 'Snooze Gourd', short: 'Snooze',
    desc: 'Cracks open into a lavender sleeping mist. Sleepers take extra damage from everything.',
    effect: 'Sleep cloud · sleepers take 2x dmg',
    cost: 6, cooldown: 12,
    glaze: '#8a5ac4', glazeDark: '#3a1f6e', band: '#f0d8ff', symbol: 'moon', color: '#c9a2ff',
    profile: sampleProfile(1.4, keys([[0, 0.3], [0.22, 0.58], [0.45, 0.4], [0.58, 0.22], [0.75, 0.37], [0.9, 0.2], [1, 0.12]])),
  },
  glue: {
    id: 'glue', name: 'Glue Crock', short: 'Glue',
    desc: 'Splatters a sticky puddle. Roots the target, then slows him to a crawl.',
    effect: 'Roots, then slows · no rolling',
    cost: 3, cooldown: 6,
    glaze: '#d1a33c', glazeDark: '#6e4a10', band: '#fff2b0', symbol: 'drop', color: '#ffd35a',
    profile: sampleProfile(0.62, keys([[0, 0.62], [0.4, 0.82], [0.75, 0.72], [1, 0.48]])),
  },
  hive: {
    id: 'hive', name: 'Hive Pot', short: 'Hive',
    desc: 'Home to an extremely grumpy swarm. They chase him around and he cannot lift anything while flailing.',
    effect: 'Bee swarm · panics · damage over time',
    cost: 7, cooldown: 14,
    glaze: '#c98a2a', glazeDark: '#5a3410', band: '#2a1a08', symbol: 'bee', color: '#ffb52e',
    profile: sampleProfile(1.15, keys([[0, 0.6], [0.25, 0.63], [0.5, 0.55], [0.75, 0.41], [0.92, 0.2], [1, 0.08]])),
  },
};

export const HAZARDS = ['bomb', 'snapper', 'zap', 'snooze', 'glue', 'hive'];
export const STARTER = ['bomb', 'snapper'];

// Quality (0..1) from crafting scales effects.
export function power(q) { return 0.6 + 0.8 * q; }

export function gradeOf(match) {
  if (match >= 0.93) return 'S';
  if (match >= 0.86) return 'A';
  if (match >= 0.78) return 'B';
  if (match >= 0.68) return 'C';
  return 'D';
}

export function qualityOf(match) {
  return Math.max(0, Math.min(1, (match - 0.55) / 0.4));
}

export function profileAt(p, y) {
  if (y < 0 || y > p.h) return 0;
  const f = (y / p.h) * (PROFILE_N - 1);
  const i = Math.min(PROFILE_N - 2, Math.floor(f));
  const k = f - i;
  return p.r[i] * (1 - k) + p.r[i + 1] * k;
}

// Silhouette intersection-over-union, both in wheel units.
export function matchScore(a, b) {
  let inter = 0, union = 0;
  const steps = 64;
  const H = Math.max(a.h, b.h);
  for (let i = 0; i < steps; i++) {
    const y = ((i + 0.5) / steps) * H;
    const ra = profileAt(a, y), rb = profileAt(b, y);
    inter += Math.min(ra, rb);
    union += Math.max(ra, rb);
  }
  return union > 0 ? inter / union : 0;
}
