import * as THREE from 'three';
import gsap from 'gsap';
import { buildHero } from '../models/models.js';
import { cellX, cellZ } from './grid.js';
import { sfx } from '../audio.js';

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ALL8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function shortAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d;
}

// Petey: a pot-smashing lunatic in green tights. State machine + GSAP actions.
export class Hero {
  constructor(game, level) {
    this.game = game;
    this.m = buildHero();
    this.root = this.m.root;
    this.maxHp = this.hp = level.heroHP;
    this.speed = level.speed;
    this.impatience = level.impatience;
    this.rollSmash = !!level.rollSmash;
    this.state = 'outside';
    this.path = [];
    this.moving = false;
    const door = game.grid.door;
    this.cell = { c: door.c, r: -1 };
    this.root.position.set(cellX(door.c), 0, cellZ(-1));
    this.root.rotation.y = 0;
    this.t = { stun: 0, sleep: 0, stuck: 0, panic: 0, sleepImmune: 0, idle: 0, roll: 0, rollCd: 3, face: 0 };
    this.disable = null;
    this.slowed = false;
    this.held = null;
    this.tl = null;
    this.phase = 0;
    this.time = 0;
    this.gridVersion = -1;
    this.nemesis = null;
    this.loot = 0;
    this.mats = new Set();
    this.root.traverse((o) => { if (o.isMesh && o.material && o.material.emissive) this.mats.add(o.material); });
    this.flashK = { k: 0 };
    this.koStars = null;
  }

  get pos() { return this.root.position; }
  get alive() { return this.state !== 'dead' && this.state !== 'gone'; }
  get active() { return this.alive && this.state !== 'outside' && this.state !== 'victory' && this.state !== 'leaving'; }
  get busy() { return this.state === 'action'; }

  enter() {
    this.state = 'walk';
    const d = this.game.grid.door;
    this.path = [{ c: d.c, r: 0 }, { c: d.c, r: 1 }];
    this.entering = true;
  }

  // ------------------------------------------------------------ update

  update(dt) {
    this.time += dt;
    const T = this.t;
    for (const k in T) T[k] = Math.max(0, T[k] - dt);
    this.animate(dt);
    if (!this.alive || this.state === 'outside' || this.state === 'victory' || this.state === 'action') return;
    if (T.stun > 0 || T.sleep > 0 || T.stuck > 0) {
      if (this.state !== 'disabled') { this.state = 'disabled'; this.moving = false; this.snapToCell(); }
      return;
    }
    if (this.state === 'disabled') this.recover();
    if ((T.panic > 0 || (this.panicking && this.moving)) && this.state !== 'leaving') { this.panicMove(dt); return; }
    if (this.panicking) { this.panicking = false; this.path = []; this.state = 'idle'; this.m.setFace('grin'); }
    if (this.state === 'idle') {
      if (T.idle <= 0) this.think();
      return;
    }
    if (this.state === 'walk' || this.state === 'leaving') this.walk(dt);
  }

  snapToCell() {
    // when frozen mid-step, settle back onto the last cell
    gsap.to(this.root.position, { x: cellX(this.cell.c), z: cellZ(this.cell.r), duration: 0.15 });
  }

  think() {
    const g = this.game.grid;
    if (this.cell.r < 0) return;
    const n = this.nemesis;
    if (n && n.alive && Math.abs(n.c - this.cell.c) + Math.abs(n.r - this.cell.r) === 1) {
      this.nemesis = null;
      this.interact(g.get(n.c, n.r));
      return;
    }
    const flow = g.flow(this.cell.c, this.cell.r);
    this.gridVersion = g.version;
    let best = null, bestScore = Infinity;
    for (const pot of this.game.pots) {
      if (pot.state !== 'idle') continue;
      const d = flow.dist[g.idx(pot.c, pot.r)];
      if (!isFinite(d)) continue;
      const s = d - (pot.type === 'merch' ? 3 : 0) + Math.random() * 0.8;
      if (s < bestScore) { bestScore = s; best = { c: pot.c, r: pot.r }; }
    }
    for (const p of this.game.pickups) {
      if (p.kind !== 'heart' || !p.alive) continue;
      const d = flow.dist[g.idx(p.c, p.r)];
      if (!isFinite(d) || d > 6) continue;
      const s = d - 4;
      if (s < bestScore) { bestScore = s; best = { c: p.c, r: p.r }; }
    }
    if (!best) {
      // nothing to smash: wander
      const cells = g.freeCells();
      const k = cells[Math.floor(Math.random() * cells.length)];
      best = k ? { c: k.c, r: k.r } : null;
      this.t.idle = 0.6;
    }
    const path = best ? g.pathTo(flow, best.c, best.r) : null;
    if (path && path.length) {
      this.path = path;
      this.state = 'walk';
    } else {
      this.path = [];
      this.state = 'idle';
      this.t.idle = 0.5;
    }
  }

  walk(dt) {
    const g = this.game.grid;
    if (!this.moving) {
      if (!this.path.length) {
        if (this.state === 'leaving') { this.state = 'gone'; this.root.visible = false; return; }
        this.entering = false;
        this.state = 'idle';
        return;
      }
      if (this.state !== 'leaving' && g.version !== this.gridVersion && !this.entering) {
        this.think();
        if (this.state !== 'walk') return;
      }
      const next = this.path[0];
      const k = g.get(next.c, next.r);
      if (this.state !== 'leaving' && k && (k.pot || k.plant)) {
        if (this.t.roll > 0 && this.rollSmash && k.pot) {
          this.t.roll = 0;
          this.game.breakPot(k.pot, 'roll');
          this.bonk();
          return;
        }
        this.t.roll = 0;
        this.interact(k);
        return;
      }
      // start a little somersault on long straight runs
      if (this.state === 'walk' && !this.entering && this.t.rollCd <= 0 && !this.slowed && this.path.length >= 3 && Math.random() < 0.3) {
        this.t.roll = 2.1 / (this.speed * 2.6);
        this.t.rollCd = 4 + Math.random() * 3;
        sfx.whoosh();
      }
      this.moving = true;
    }
    const next = this.path[0];
    const tx = cellX(next.c), tz = cellZ(next.r);
    const p = this.root.position;
    const dx = tx - p.x, dz = tz - p.z;
    const dist = Math.hypot(dx, dz);
    const sp = this.speed * (this.slowed ? 0.4 : 1) * (this.t.roll > 0 ? 2.6 : 1) * (this.panicking ? 1.35 : 1) * (this.state === 'leaving' ? 1.2 : 1);
    const step = sp * dt;
    this.faceTowards(dx, dz, dt);
    if (dist <= step) {
      p.x = tx; p.z = tz;
      this.cell = { c: next.c, r: next.r };
      this.path.shift();
      this.moving = false;
    } else {
      p.x += (dx / dist) * step;
      p.z += (dz / dist) * step;
    }
  }

  faceTowards(dx, dz, dt) {
    if (Math.abs(dx) + Math.abs(dz) < 1e-4) return;
    const target = shortAngle(this.root.rotation.y, Math.atan2(dx, dz));
    this.root.rotation.y += (target - this.root.rotation.y) * Math.min(1, dt * 14);
  }

  angleTo(c, r) {
    return shortAngle(this.root.rotation.y, Math.atan2(cellX(c) - this.pos.x, cellZ(r) - this.pos.z));
  }

  panicMove(dt) {
    if (!this.panicking) {
      this.panicking = true;
      this.path = [];
      this.m.setFace('hurt');
    }
    if (!this.moving && !this.path.length) {
      const g = this.game.grid;
      const opts = ORTHO.map(([dc, dr]) => ({ c: this.cell.c + dc, r: this.cell.r + dr })).filter((k) => g.free(k.c, k.r));
      if (opts.length) this.path = [opts[Math.floor(Math.random() * opts.length)]];
      else return;
    }
    if (!this.moving) this.moving = true;
    const next = this.path[0];
    const tx = cellX(next.c), tz = cellZ(next.r);
    const p = this.root.position;
    const dx = tx - p.x, dz = tz - p.z;
    const dist = Math.hypot(dx, dz);
    const step = this.speed * 1.35 * (this.slowed ? 0.4 : 1) * dt;
    this.faceTowards(dx, dz, dt);
    if (dist <= step) {
      p.x = tx; p.z = tz;
      this.cell = { ...next };
      this.path.shift();
      this.moving = false;
    } else {
      p.x += (dx / dist) * step;
      p.z += (dz / dist) * step;
    }
  }

  // ------------------------------------------------------------ actions

  interact(k) {
    this.path = [];
    if (k.plant) return this.swing(k, () => this.game.hitPlant(k.plant));
    const pot = k.pot;
    if (Math.random() < this.impatience) this.swing(k, () => { if (pot.state === 'idle') this.game.breakPot(pot, 'slash'); });
    else this.lift(pot);
  }

  newTimeline() {
    this.tl = gsap.timeline({
      onComplete: () => {
        this.tl = null;
        if (this.state === 'action') this.state = 'idle';
      },
    });
    return this.tl;
  }

  lift(pot) {
    this.state = 'action';
    this.game.liftPot(pot, this);
    sfx.heroGrunt();
    const m = this.m;
    const arms = [m.arms[0].rotation, m.arms[1].rotation];
    const tl = this.newTimeline();
    tl.to(this.root.rotation, { y: this.angleTo(pot.c, pot.r), duration: 0.12 });
    tl.to(m.body.position, { y: -0.12, duration: 0.12 }, '<');
    tl.to(arms, { x: -1.3, z: 0, duration: 0.12 }, '<');
    tl.call(() => {
      this.held = pot;
      m.hold.attach(pot.mesh);
    });
    tl.to(pot.mesh.position, { x: 0, y: 0, z: 0, duration: 0.28, ease: 'back.out(2)' });
    tl.to(pot.mesh.rotation, { x: 0, y: 0, z: 0, duration: 0.28 }, '<');
    tl.to(m.body.position, { y: 0, duration: 0.2 }, '<');
    tl.to(arms, { x: -2.9, duration: 0.2 }, '<');
    tl.call(() => this.game.onLifted(pot, this));
    tl.to({}, { duration: 0.25 });
    tl.call(() => this.pickThrow());
    tl.to(this.root.rotation, { y: () => this.throwAngle, duration: 0.2 });
    tl.to(arms, { x: -3.5, duration: 0.12 });
    tl.call(() => this.throwHeld());
    tl.to(arms, { x: -1.0, duration: 0.12 });
    tl.to(arms, { x: 0, duration: 0.22 });
  }

  pickThrow() {
    const g = this.game.grid;
    const cands = [];
    for (const [dc, dr] of ALL8) {
      for (const dist of [2, 3]) {
        let c = this.cell.c + dc * dist, r = this.cell.r + dr * dist;
        c = Math.max(0, Math.min(g.cols - 1, c));
        r = Math.max(1, Math.min(g.rows - 1, r));
        if (c === this.cell.c && r === this.cell.r) continue;
        const k = g.get(c, r);
        cands.push({ c, r, pot: !!(k && k.pot && k.pot.state === 'idle') });
      }
    }
    const hits = cands.filter((k) => k.pot);
    const pick = hits.length && Math.random() < 0.5 ? hits[Math.floor(Math.random() * hits.length)] : cands[Math.floor(Math.random() * cands.length)];
    this.throwTarget = pick;
    this.throwAngle = this.angleTo(pick.c, pick.r);
  }

  throwHeld() {
    const pot = this.held;
    this.held = null;
    if (!pot || pot.state !== 'held') return;
    this.game.throwPot(pot, this.throwTarget);
    sfx.whoosh();
  }

  swing(k, onHit) {
    this.state = 'action';
    sfx.heroGrunt();
    const m = this.m;
    const arm = m.arms[1].rotation;
    const tl = this.newTimeline();
    tl.to(this.root.rotation, { y: this.angleTo(k.c, k.r), duration: 0.12 });
    tl.to(arm, { x: -2.6, z: -0.3, duration: 0.16 });
    tl.to(m.body.rotation, { y: 0.5, duration: 0.16 }, '<');
    tl.to(arm, { x: 0.4, z: 0.2, duration: 0.1, ease: 'power3.in' });
    tl.to(m.body.rotation, { y: -0.6, duration: 0.1 }, '<');
    tl.call(() => { sfx.whoosh(); onHit(); });
    tl.to(arm, { x: 0, z: 0, duration: 0.25 });
    tl.to(m.body.rotation, { y: 0, duration: 0.25 }, '<');
  }

  bonk() {
    this.say('Oof!');
    this.stun(0.6, 'dizzy');
  }

  interrupt() {
    if (this.tl) { this.tl.kill(); this.tl = null; }
    const m = this.m;
    gsap.to([m.arms[0].rotation, m.arms[1].rotation], { x: 0, z: 0, duration: 0.2 });
    gsap.to(m.body.position, { y: 0, duration: 0.2 });
    gsap.to(m.body.rotation, { y: 0, duration: 0.2 });
    if (this.state === 'action') this.state = 'idle';
  }

  // the held pot falls at his feet when he gets interrupted
  dropHeld() {
    const pot = this.held;
    this.held = null;
    if (pot && pot.state === 'held') this.game.dropPot(pot, this);
  }

  // ------------------------------------------------------------ status

  stun(dur, kind = 'dizzy') {
    if (!this.active) return;
    this.interrupt();
    this.dropHeld();
    this.t.stun = Math.max(this.t.stun, dur);
    this.disable = kind;
    this.m.setFace(kind === 'zap' ? 'zap' : 'hurt');
  }

  sleep(dur) {
    if (!this.active) return;
    this.interrupt();
    this.dropHeld();
    this.t.sleep = Math.max(this.t.sleep, dur);
    this.t.sleepImmune = dur + 1.8;
    this.disable = 'sleep';
    this.m.setFace('sleep');
    this.say('...zzz');
  }

  stick(dur) {
    if (!this.active) return;
    this.interrupt();
    this.dropHeld();
    this.t.stuck = Math.max(this.t.stuck, dur);
    this.disable = 'stuck';
    this.m.setFace('angry');
  }

  panic(dur) {
    if (!this.active) return;
    if (this.state === 'action') { this.interrupt(); this.dropHeld(); }
    this.t.panic = Math.max(this.t.panic, dur);
  }

  recover() {
    this.disable = null;
    this.state = 'idle';
    this.t.idle = 0.2;
    this.m.setFace('grin');
    const b = this.m.body;
    gsap.to(b.position, { x: 0, y: 0, z: 0, duration: 0.2 });
    gsap.to(b.rotation, { x: 0, z: 0, duration: 0.2 });
    gsap.to(this.m.head.rotation, { x: 0, z: 0, duration: 0.2 });
  }

  damage(amount, kind) {
    if (!this.alive || this.state === 'outside') return 0;
    if (this.t.sleep > 0) amount *= 2;
    amount = Math.round(amount * 4) / 4;
    this.hp = Math.max(0, this.hp - amount);
    sfx.hurt();
    gsap.killTweensOf(this.flashK);
    this.flashK.k = 1;
    gsap.to(this.flashK, {
      k: 0, duration: 0.35,
      onUpdate: () => { for (const m of this.mats) m.emissive.setRGB(this.flashK.k * 0.9, this.flashK.k * 0.1, this.flashK.k * 0.1); },
    });
    if (!this.disable && this.state !== 'victory') {
      this.m.setFace('hurt');
      this.t.face = 0.5;
    }
    this.game.onHeroDamaged(amount, kind);
    if (this.hp <= 0) this.die();
    return amount;
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  knockback(fromX, fromZ, dist = 0.25) {
    if (!this.active || this.state === 'action') return;
    const dx = this.pos.x - fromX, dz = this.pos.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    gsap.to(this.m.body.position, { x: (dx / d) * dist, z: (dz / d) * dist, duration: 0.1, yoyo: true, repeat: 1 });
  }

  die() {
    this.interrupt();
    this.dropHeld();
    this.state = 'dead';
    this.m.setFace('ko');
    sfx.heroLaugh();
    const b = this.m.body;
    const tl = gsap.timeline();
    tl.to(this.root.rotation, { y: this.root.rotation.y + Math.PI * 4, duration: 0.9, ease: 'power2.out' });
    tl.to(b.position, { y: 0.5, duration: 0.3, yoyo: true, repeat: 1, ease: 'power2.out' }, 0);
    tl.to(b.rotation, { x: -1.45, duration: 0.3, ease: 'bounce.out' });
    tl.to(b.position, { y: 0.12, z: -0.3, duration: 0.3, ease: 'bounce.out' }, '<');
    tl.call(() => {
      this.koStars = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.game.starTex, transparent: true, depthWrite: false }));
        s.scale.setScalar(0.22);
        this.koStars.add(s);
      }
      this.koStars.position.set(0, 0.35, -1.0);
      this.root.add(this.koStars);
    });
  }

  victory() {
    this.interrupt();
    this.state = 'victory';
    this.m.setFace('crazy');
    sfx.heroLaugh();
    const m = this.m;
    gsap.to([m.arms[0].rotation, m.arms[1].rotation], { x: -3, duration: 0.2 });
    gsap.to(m.body.position, { y: 0.35, duration: 0.25, yoyo: true, repeat: -1, ease: 'power2.out' });
    this.say('Ha ha! Treasure!!');
  }

  leave() {
    if (!this.active && this.state !== 'disabled') return;
    this.interrupt();
    this.dropHeld();
    this.t.stun = this.t.sleep = this.t.stuck = this.t.panic = 0;
    this.disable = null;
    this.panicking = false;
    this.m.setFace('grin');
    const g = this.game.grid;
    const flow = g.flow(this.cell.c, Math.max(0, this.cell.r), 0, 0);
    const path = g.pathTo(flow, g.door.c, g.door.r) || [];
    path.push({ c: g.door.c, r: -1 });
    this.path = path;
    this.moving = false;
    this.state = 'leaving';
    gsap.to(this.m.body.position, { x: 0, y: 0, z: 0, duration: 0.2 });
    gsap.to(this.m.body.rotation, { x: 0, y: 0, z: 0, duration: 0.2 });
  }

  say(text) { this.game.say(this, text); }

  // ------------------------------------------------------------ procedural animation

  animate(dt) {
    const m = this.m;
    const st = this.state;
    m.hatTip.rotation.z = Math.sin(this.time * 3) * 0.25;
    m.tick(dt);
    if (this.t.face <= 0 && !this.disable && (st === 'walk' || st === 'idle') && !this.panicking && this._faceHurt) {
      m.setFace('grin');
    }
    this._faceHurt = this.t.face > 0;
    if (this.koStars) {
      this.koStars.children.forEach((s, i) => {
        const a = this.time * 4 + (i / 3) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.25, 0.2 + Math.sin(a * 2) * 0.03, Math.sin(a) * 0.25);
      });
    }
    if (st === 'action' || st === 'dead' || st === 'victory') return;
    const L = m.legs, A = m.arms, b = m.body;

    if (st === 'disabled') {
      if (this.disable === 'zap') {
        b.position.x = (Math.random() - 0.5) * 0.08;
        b.position.z = (Math.random() - 0.5) * 0.08;
        A[0].rotation.z = -1.2 + Math.random() * 0.4;
        A[1].rotation.z = 1.2 - Math.random() * 0.4;
        const on = Math.floor(this.time * 20) % 2;
        for (const mat of this.mats) mat.emissive.setRGB(on * 0.6, on * 0.6, on * 0.2);
      } else if (this.disable === 'sleep') {
        b.position.y += (-0.28 - b.position.y) * Math.min(1, dt * 8);
        b.rotation.x += (0.2 - b.rotation.x) * Math.min(1, dt * 8);
        m.head.rotation.x = 0.35 + Math.sin(this.time * 1.5) * 0.08;
        L[0].rotation.x = L[1].rotation.x = -1.4;
        A[0].rotation.x = A[1].rotation.x = 0.2;
        if (Math.floor(this.time * 1.2) !== Math.floor((this.time - dt) * 1.2)) {
          this.game.fx.puffs(new THREE.Vector3(this.pos.x, 1.2, this.pos.z), 0xd8c8ff, 1, 0.25, 1.2, 0.6, 0.1);
          sfx.snore();
        }
      } else if (this.disable === 'stuck') {
        b.rotation.z = Math.sin(this.time * 18) * 0.15;
        A[0].rotation.x = -1.5 + Math.sin(this.time * 16) * 0.5;
        A[1].rotation.x = -1.5 - Math.sin(this.time * 16) * 0.5;
        L[0].rotation.x = L[1].rotation.x = 0;
      } else {
        // dizzy
        m.head.rotation.z = Math.sin(this.time * 9) * 0.25;
        b.rotation.z = Math.sin(this.time * 6) * 0.1;
        if (Math.random() < dt * 6) this.game.fx.stars(new THREE.Vector3(this.pos.x, 1.3, this.pos.z), 1);
      }
      return;
    }
    if (this.mats.size && this.flashK.k <= 0) for (const mat of this.mats) mat.emissive.setRGB(0, 0, 0);

    if (this.panicking) {
      this.phase += dt * 18;
      A[0].rotation.x = -2.8 + Math.sin(this.phase) * 0.6;
      A[1].rotation.x = -2.8 - Math.sin(this.phase) * 0.6;
      A[0].rotation.z = Math.sin(this.phase * 0.7) * 0.5;
      A[1].rotation.z = -Math.sin(this.phase * 0.7) * 0.5;
      L[0].rotation.x = Math.sin(this.phase) * 0.9;
      L[1].rotation.x = -Math.sin(this.phase) * 0.9;
      m.head.rotation.y = Math.sin(this.phase * 0.5) * 0.4;
      b.position.y = Math.abs(Math.sin(this.phase)) * 0.06;
      return;
    }
    m.head.rotation.y = 0;
    if (this.t.roll > 0) {
      b.rotation.x += dt * 16;
      b.position.y = 0.25 - Math.abs(Math.cos(b.rotation.x / 2)) * 0.15;
      L[0].rotation.x = L[1].rotation.x = -1.6;
      A[0].rotation.x = A[1].rotation.x = -1.2;
      return;
    }
    b.rotation.x = 0;
    if (this.moving) {
      this.phase += dt * this.speed * (this.slowed ? 4 : 9);
      const s = Math.sin(this.phase);
      L[0].rotation.x = s * 0.7;
      L[1].rotation.x = -s * 0.7;
      A[0].rotation.x = -s * 0.6;
      A[1].rotation.x = s * 0.6;
      A[0].rotation.z = A[1].rotation.z = 0;
      b.position.y = Math.abs(Math.cos(this.phase)) * 0.05;
    } else {
      const s = Math.sin(this.time * 2.5);
      L[0].rotation.x += (0 - L[0].rotation.x) * Math.min(1, dt * 10);
      L[1].rotation.x += (0 - L[1].rotation.x) * Math.min(1, dt * 10);
      A[0].rotation.x += (s * 0.08 - A[0].rotation.x) * Math.min(1, dt * 10);
      A[1].rotation.x += (-s * 0.08 - A[1].rotation.x) * Math.min(1, dt * 10);
      b.position.y = 0.01 + s * 0.01;
    }
  }
}
