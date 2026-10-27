import * as THREE from 'three';
import gsap from 'gsap';
import { LEVELS } from './levels.js';
import { RECIPES, power } from './recipes.js';
import { Grid, cellX, cellZ, toCell } from './grid.js';
import { buildShop, isoCamera, placeIso, fitIso } from './shop.js';
import { Effects } from './effects.js';
import { Hero } from './hero.js';
import { potMesh, buildPlant, buildBee, buildHeart, buildCoin, buildClayLump, lam } from '../models/models.js';
import { tex } from '../render/textures.js';
import { save } from './save.js';
import { sfx, music } from '../audio.js';
import { Hud } from '../ui/hud.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const xzDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const MERCH_CRIES = ['MY STOCK!', 'Noooo!', 'That was an antique!', 'You owe me 40 coins!', 'My grandmother made that!'];
const MERCH_CHEERS = ['Ha-HA!', 'Serves you right!', 'Gotcha!', 'Who\'s smashing now?', 'Store policy!'];
const HERO_PAIN = ['Ow!', 'Yowch!', 'Hey!', 'No fair!', 'Ack!'];

export class Game {
  constructor(app, levelIndex) {
    this.app = app;
    this.levelIndex = levelIndex;
    this.level = LEVELS[levelIndex];
    const L = this.level;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x150c07);
    this.scene.fog = new THREE.Fog(0x150c07, 44, 66);
    this.shop = buildShop(L.layout);
    this.scene.add(this.shop.group);
    this.merchant = this.shop.merchant;
    this.cam = isoCamera();
    fitIso(this.cam, app.renderer.aspect);
    this.grid = new Grid(L.layout);
    this.fx = new Effects(this.scene);
    this.starTex = tex.star();

    this.pots = [];
    this.plants = [];
    this.clouds = [];
    this.puddles = [];
    this.swarms = [];
    this.pickups = [];
    this.potId = 0;

    this.clay = L.startClay;
    this.clayTimer = 0;
    this.merchTotal = L.merch;
    this.merchToPlace = L.merch;
    this.merchLeft = 0;
    this.hazards = save.knownHazards();
    this.cooldowns = {};
    this.selected = null;
    this.phase = 'prep';
    this.remaining = L.duration;
    this.elapsed = 0;
    this.timeScale = 1;
    this.paused = false;
    this.disposed = false;
    this.stats = { damage: 0, traps: 0 };
    this.shakeAmt = 0;
    this.shakeVec = new THREE.Vector3();
    this.cheerCd = 0;
    this.merchantMoodT = 0;
    this.time = 0;

    this.hero = new Hero(this, L);
    this.scene.add(this.hero.root);

    // placement helpers
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(-9, -9);
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hoverCell = null;
    this.highlight = new THREE.Mesh(
      new THREE.PlaneGeometry(0.94, 0.94),
      new THREE.MeshBasicMaterial({ color: 0x7cff7c, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.position.y = 0.02;
    this.highlight.visible = false;
    this.scene.add(this.highlight);
    this.ghost = null;

    this.sunA = this.shop.sun.color.clone();
    this.sunB = new THREE.Color(0xff8a40);
    this.hemiA = this.shop.hemi.color.clone();
    this.hemiB = new THREE.Color(0xffb48a);

    this.hud = new Hud(this);
    this.hud.setClay(this.clay);
    this.hud.setTime(this.remaining, L.duration);
    this.hud.setStock(0, 0);
    this.bindInput();
    this.select('merch');
    this.merchantIdle();
    gsap.delayedCall(0.6, () => this.say(this.merchant, 'Place my fine wares, quickly!'));
  }

  // ------------------------------------------------------------ input

  bindInput() {
    const cv = this.app.canvas;
    this.onMove = (e) => {
      this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.updateHover();
    };
    this.onDown = (e) => {
      if (this.paused || this.phase === 'end') return;
      this.onMove(e);
      if (e.button === 2) { this.select(null); return; }
      if (e.button !== 0) return;
      if (this.tryCollect()) return;
      const c = this.hoverCell;
      if (!c) return;
      const k = this.grid.get(c.c, c.r);
      if (this.phase === 'prep' && k && k.pot) { this.removePot(k.pot); return; }
      if (this.selected) this.tryPlace(this.selected, c.c, c.r);
    };
    this.onCtx = (e) => e.preventDefault();
    this.onKey = (e) => {
      if (e.key === 'Escape') { if (this.selected) this.select(null); else this.app.togglePause(); return; }
      if (e.key === 'p' || e.key === 'P') { this.app.togglePause(); return; }
      if (this.paused) return;
      const n = parseInt(e.key, 10);
      if (n >= 1) {
        const ids = this.phase === 'prep' ? ['merch', ...this.hazards] : this.hazards;
        if (ids[n - 1]) this.select(ids[n - 1]);
      }
      if (e.key === 'Enter' && this.phase === 'prep' && this.merchToPlace === 0) this.startWave();
    };
    cv.addEventListener('pointermove', this.onMove);
    cv.addEventListener('pointerdown', this.onDown);
    cv.addEventListener('contextmenu', this.onCtx);
    window.addEventListener('keydown', this.onKey);
  }

  updateHover() {
    this.ray.setFromCamera(this.mouse, this.cam);
    const hit = new THREE.Vector3();
    this.hoverCell = null;
    if (this.ray.ray.intersectPlane(this.floorPlane, hit)) {
      const c = toCell(hit.x, hit.z);
      if (this.grid.inside(c.c, c.r)) this.hoverCell = c;
    }
    this.refreshGhost();
  }

  refreshGhost() {
    const c = this.hoverCell;
    const showing = !!(c && this.selected && this.phase !== 'end');
    this.highlight.visible = showing;
    if (this.ghost) this.ghost.visible = showing;
    if (!showing) {
      if (c && this.phase === 'prep' && this.grid.get(c.c, c.r).pot) {
        this.highlight.visible = true;
        this.highlight.position.set(cellX(c.c), 0.02, cellZ(c.r));
        this.highlight.material.color.set(0xffd060);
      }
      return;
    }
    const ok = this.canPlace(this.selected, c.c, c.r) === true;
    this.highlight.position.set(cellX(c.c), 0.02, cellZ(c.r));
    this.highlight.material.color.set(ok ? 0x7cff7c : 0xff5050);
    if (this.ghost) this.ghost.position.set(cellX(c.c), 0, cellZ(c.r));
  }

  select(id) {
    if (this.phase === 'end') return;
    if (id === 'merch' && (this.phase !== 'prep' || this.merchToPlace <= 0)) id = null;
    if (id && this.selected === id) id = null;
    this.selected = id;
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
    if (id) {
      const data = save.data.recipes[id];
      this.ghost = potMesh(id, data && data.profile);
      this.ghost.traverse((o) => {
        if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; o.material.depthWrite = false; }
      });
      this.scene.add(this.ghost);
      sfx.click();
    }
    this.refreshGhost();
  }

  canPlace(id, c, r) {
    if (this.phase === 'end') return 'closed';
    if (!this.grid.placeable(c, r)) return 'blocked';
    if (id === 'merch') return this.phase === 'prep' && this.merchToPlace > 0 ? true : 'no stock';
    const rec = RECIPES[id];
    if (this.clay < rec.cost) return 'Not enough clay!';
    if ((this.cooldowns[id] || 0) > 0) return 'Still drying...';
    if (this.phase === 'wave') {
      const h = this.hero;
      if (h.cell.c === c && h.cell.r === r) return 'blocked';
      if (h.moving && h.path[0] && h.path[0].c === c && h.path[0].r === r) return 'blocked';
    }
    return true;
  }

  tryPlace(id, c, r) {
    const ok = this.canPlace(id, c, r);
    if (ok !== true) {
      sfx.deny();
      if (typeof ok === 'string' && ok.length > 8) this.hud.float(ok, new THREE.Vector3(cellX(c), 0.6, cellZ(r)), 'warn');
      return;
    }
    if (id === 'merch') {
      this.merchToPlace--;
      this.merchLeft++;
      this.hud.setStock(this.merchTotal - this.merchToPlace, this.merchLeft);
      this.hud.setPrep();
      if (this.merchToPlace === 0) {
        this.select(this.hazards[0] || null);
        this.say(this.merchant, 'Now, a few... surprises.');
      }
    } else {
      this.clay -= RECIPES[id].cost;
      this.hud.setClay(this.clay);
      if (this.phase === 'wave') this.cooldowns[id] = RECIPES[id].cooldown;
    }
    this.createPot(id, c, r);
    sfx.place();
    this.refreshGhost();
  }

  removePot(pot) {
    this.grid.setPot(pot.c, pot.r, null);
    this.pots = this.pots.filter((p) => p !== pot);
    gsap.to(pot.mesh.scale, { x: 0, y: 0, z: 0, duration: 0.15, onComplete: () => this.scene.remove(pot.mesh) });
    if (pot.type === 'merch') {
      this.merchToPlace++;
      this.merchLeft--;
      this.hud.setStock(this.merchTotal - this.merchToPlace, this.merchLeft);
      this.hud.setPrep();
    } else {
      this.clay += RECIPES[pot.type].cost;
      this.hud.setClay(this.clay, true);
    }
    sfx.pop();
  }

  tryCollect() {
    this.ray.setFromCamera(this.mouse, this.cam);
    const targets = this.pickups.filter((p) => p.alive && p.collider).map((p) => p.collider);
    if (!targets.length) return false;
    const hits = this.ray.intersectObjects(targets, false);
    if (!hits.length) return false;
    const p = this.pickups.find((k) => k.collider === hits[0].object);
    if (!p) return false;
    if (p.kind === 'clay') this.collectClay(p);
    else if (p.kind === 'heart') this.snatchHeart(p);
    return true;
  }

  // ------------------------------------------------------------ pots

  createPot(type, c, r) {
    const data = save.data.recipes[type];
    const mesh = potMesh(type, data && data.profile);
    mesh.position.set(cellX(c), 0, cellZ(r));
    mesh.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(mesh);
    const pot = { id: ++this.potId, type, c, r, q: data ? data.quality : 0, mesh, state: 'idle', fuse: -1 };
    this.grid.setPot(c, r, pot);
    this.pots.push(pot);
    const body = mesh.userData.body;
    gsap.fromTo(body.position, { y: 1.4 }, { y: 0, duration: 0.35, ease: 'bounce.out' });
    gsap.fromTo(body.scale, { x: 0.7, y: 1.4, z: 0.7 }, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'elastic.out(1.2, 0.4)', delay: 0.2 });
    this.fx.puffs(new THREE.Vector3(cellX(c), 0.05, cellZ(r)), 0xe8d0b0, 4, 0.35, 0.5, 0.3, 0.5);
    return pot;
  }

  potWorldPos(pot) {
    return pot.mesh.getWorldPosition(new THREE.Vector3());
  }

  detachPot(pot) {
    gsap.killTweensOf(pot.mesh.position);
    gsap.killTweensOf(pot.mesh.rotation);
    if (pot.flight) { pot.flight.kill(); pot.flight = null; }
    if (pot.mesh.parent) pot.mesh.parent.remove(pot.mesh);
    this.pots = this.pots.filter((p) => p !== pot);
  }

  liftPot(pot, hero) {
    this.grid.setPot(pot.c, pot.r, null);
    pot.state = 'held';
    if (pot.type === 'merch') {
      this.merchantReact('shock');
      this.say(this.merchant, pick(['Put that DOWN!', 'Careful with that!', 'Not the good one!']));
    }
  }

  // hazards that spring the moment Petey picks them up
  onLifted(pot, hero) {
    if (this.disposed || pot.state !== 'held') return;
    const q = pot.q, P = power(q);
    if (pot.type === 'merch') return;
    if (pot.type === 'bomb') {
      pot.fuse = 1.0 - 0.55 * q;
      sfx.fuse();
      hero.say('Huh? Is it... ticking?');
      return;
    }
    const pos = this.potWorldPos(pot);
    hero.held = null;
    this.consume(pot, pos);
    this.stats.traps++;
    switch (pot.type) {
      case 'zap': this.zapHero(q); break;
      case 'snapper': this.plantAmbush(pot, pos, q); break;
      case 'snooze': this.spawnCloud(new THREE.Vector3(hero.pos.x, 0, hero.pos.z), q); break;
      case 'glue':
        hero.stick(2.2 * P);
        hero.say('Ew! Sticky!');
        this.spawnPuddle(new THREE.Vector3(hero.pos.x, 0, hero.pos.z), q, false);
        this.merchantReact('cheer');
        break;
      case 'hive': this.spawnSwarm(pos, q); hero.say('BEES?! WHY BEES?!'); break;
    }
  }

  consume(pot, pos) {
    pot.state = 'gone';
    this.detachPot(pot);
    this.fx.shards(pos, RECIPES[pot.type].glaze, 10);
    sfx.shatter();
    this.spawnClay(new THREE.Vector3(cellX(pot.c), 0, cellZ(pot.r)));
  }

  throwPot(pot, target) {
    if (this.disposed) return;
    pot.state = 'flying';
    this.scene.attach(pot.mesh);
    const from = pot.mesh.position.clone();
    const k = this.grid.get(target.c, target.r);
    const landY = k && k.solid ? 0.7 : 0.1;
    const to = new THREE.Vector3(cellX(target.c), landY, cellZ(target.r));
    const o = { t: 0 };
    const spin = (Math.random() - 0.5) * 12;
    pot.flight = gsap.to(o, {
      t: 1, duration: 0.42 + from.distanceTo(to) * 0.03, ease: 'none',
      onUpdate: () => {
        pot.mesh.position.lerpVectors(from, to, o.t);
        pot.mesh.position.y += Math.sin(o.t * Math.PI) * 0.9;
        pot.mesh.rotation.x = o.t * spin;
      },
      onComplete: () => { pot.flight = null; this.potLanded(pot, target); },
    });
  }

  dropPot(pot, hero) {
    if (this.disposed) return;
    if (pot.type === 'merch' && this.setDown(pot, hero)) return;
    pot.state = 'flying';
    this.scene.attach(pot.mesh);
    const to = new THREE.Vector3(hero.pos.x + Math.sin(hero.root.rotation.y) * 0.3, 0.05, hero.pos.z + Math.cos(hero.root.rotation.y) * 0.3);
    pot.flight = gsap.to(pot.mesh.position, {
      x: to.x, y: to.y, z: to.z, duration: 0.25, ease: 'power2.in',
      onComplete: () => { pot.flight = null; this.breakPot(pot, 'drop', to); },
    });
  }

  // a stunned hero fumbles your merchandise onto the floor in one piece
  setDown(pot, hero) {
    const order = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    const cell = order.map(([dc, dr]) => ({ c: hero.cell.c + dc, r: hero.cell.r + dr })).find((k) => this.grid.placeable(k.c, k.r));
    if (!cell) return false;
    pot.state = 'idle';
    pot.c = cell.c;
    pot.r = cell.r;
    this.grid.setPot(cell.c, cell.r, pot);
    this.scene.attach(pot.mesh);
    const from = pot.mesh.position.clone();
    const tx = cellX(cell.c), tz = cellZ(cell.r);
    const o = { t: 0 };
    gsap.to(o, {
      t: 1, duration: 0.45, ease: 'none',
      onUpdate: () => {
        pot.mesh.position.set(from.x + (tx - from.x) * o.t, from.y * (1 - o.t) + Math.sin(o.t * Math.PI) * 0.4, from.z + (tz - from.z) * o.t);
        pot.mesh.rotation.set(0, pot.mesh.rotation.y, (1 - o.t) * 0.6);
      },
      onComplete: () => {
        sfx.place();
        gsap.fromTo(pot.mesh.scale, { x: 1.2, y: 0.8, z: 1.2 }, { x: 1, y: 1, z: 1, duration: 0.4, ease: 'elastic.out(1.2, 0.4)' });
      },
    });
    this.merchantReact('cheer');
    this.say(this.merchant, 'Phew! Nice save!');
    this.hud.float('SAVED!', new THREE.Vector3(tx, 1.0, tz), 'heal');
    return true;
  }

  potLanded(pot, target) {
    if (this.disposed || pot.state !== 'flying') return;
    const k = this.grid.get(target.c, target.r);
    if (k && k.pot && k.pot.state === 'idle') {
      const other = k.pot;
      gsap.delayedCall(0.05, () => this.breakPot(other, 'hit'));
    }
    if (k && k.plant) this.hitPlant(k.plant);
    this.breakPot(pot, 'throw', pot.mesh.position.clone());
  }

  breakPot(pot, cause, at) {
    if (this.disposed || pot.state === 'gone') return;
    const pos = at ? at.clone() : this.potWorldPos(pot);
    pos.y = Math.max(pos.y, 0.15);
    if (pot.state === 'idle') this.grid.setPot(pot.c, pot.r, null);
    if (this.hero.held === pot) this.hero.held = null;
    pot.state = 'gone';
    this.detachPot(pot);
    this.fx.shards(pos, RECIPES[pot.type].glaze, pot.type === 'merch' ? 14 : 10);
    sfx.shatter();
    if (pot.type === 'merch') {
      this.loseMerch(pos);
    } else {
      this.stats.traps++;
      this.trigger(pot, pos);
      this.spawnClay(new THREE.Vector3(pos.x, 0, pos.z));
    }
  }

  trigger(pot, pos) {
    const q = pot.q;
    switch (pot.type) {
      case 'bomb': this.explode(pos, q); break;
      case 'snapper': this.spawnPlantNear(pos, q, null); break;
      case 'zap': this.zapBurst(pos, q); break;
      case 'snooze': this.spawnCloud(pos, q); break;
      case 'glue': this.spawnPuddle(pos, q, true); break;
      case 'hive': this.spawnSwarm(pos, q); break;
    }
  }

  loseMerch(pos) {
    this.merchLeft--;
    this.hud.setStock(this.merchTotal, this.merchLeft);
    this.merchantReact('cry');
    this.say(this.merchant, pick(MERCH_CRIES));
    this.spawnCoins(pos, 6);
    if (Math.random() < 0.4) this.spawnHeart(pos);
    this.shake(0.12);
    if (this.merchLeft <= 0 && this.phase === 'wave') this.lose();
  }

  // ------------------------------------------------------------ hazard effects

  explode(pos, q) {
    const P = power(q);
    const R = 1.3 + 0.4 * q;
    this.fx.explosion(pos, R);
    sfx.boom();
    this.shake(0.45);
    this.flash(0.55, 0xffc070);
    const h = this.hero;
    const d = xzDist(h.pos, pos);
    if (h.active && d < R) {
      const dmg = (d < 0.9 ? 2 : 1) * P;
      h.damage(dmg, 'boom');
      h.knockback(pos.x, pos.z, 0.4);
      h.stun(0.7, 'dizzy');
      h.say(pick(['KABOOM?!', 'My eyebrows!', 'Ow ow ow!']));
    }
    for (const p of [...this.pots]) {
      // blasts chain into other traps but spare the merchandise
      if (p.state !== 'idle' || p.type === 'merch') continue;
      if (Math.hypot(cellX(p.c) - pos.x, cellZ(p.r) - pos.z) < R) gsap.delayedCall(0.12, () => this.breakPot(p, 'blast'));
    }
  }

  tickFuses(dt) {
    for (const pot of [...this.pots]) {
      if (pot.fuse < 0 || pot.state === 'gone') continue;
      pot.fuse -= dt;
      const fp = pot.mesh.userData.fuse ? pot.mesh.userData.fuse.getWorldPosition(new THREE.Vector3()) : this.potWorldPos(pot);
      if (Math.random() < dt * 30) this.fx.sparks(fp, 0xffd040, 1, 1.5);
      if (pot.fuse <= 0) {
        pot.fuse = -1;
        const pos = this.potWorldPos(pot);
        if (pot.state === 'held') {
          this.hero.held = null;
          this.hero.interrupt();
          pot.state = 'gone';
          this.detachPot(pot);
          this.fx.shards(pos, RECIPES.bomb.glaze, 10);
          this.stats.traps++;
          this.explode(pos, pot.q);
          this.spawnClay(new THREE.Vector3(this.hero.pos.x, 0, this.hero.pos.z));
        } else {
          this.breakPot(pot, 'fuse', pos);
        }
      }
    }
  }

  zapHero(q) {
    const P = power(q);
    const h = this.hero;
    if (!h.active) return;
    const chest = new THREE.Vector3(h.pos.x, 0.8, h.pos.z);
    for (let i = 0; i < 4; i++) {
      this.fx.bolt(new THREE.Vector3(h.pos.x + (Math.random() - 0.5) * 1.5, 2.6, h.pos.z + (Math.random() - 0.5) * 1.5), chest, 0xfff27a, 0.5);
    }
    this.fx.sparks(chest, 0xfff27a, 18, 3);
    sfx.zap();
    this.flash(0.35, 0xfff6a0);
    h.damage(1 * P, 'zap');
    h.stun(2.2 * P, 'zap');
    h.say('BZZZZT!!');
    this.merchantReact('cheer');
  }

  zapBurst(pos, q) {
    const R = 1.6 + 0.3 * q;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.fx.bolt(pos, new THREE.Vector3(pos.x + Math.cos(a) * R, 0.2, pos.z + Math.sin(a) * R), 0xfff27a, 0.4);
    }
    this.fx.sparks(pos, 0xfff27a, 14, 3);
    sfx.zap();
    if (this.hero.active && xzDist(this.hero.pos, pos) < R) this.zapHero(q);
  }

  plantAmbush(pot, pos, q) {
    const P = power(q);
    const h = this.hero;
    const m = buildPlant();
    m.root.position.copy(pos);
    m.root.position.y = 1.0;
    m.root.scale.setScalar(0.1);
    this.scene.add(m.root);
    gsap.to(m.root.scale, { x: 1, y: 1, z: 1, duration: 0.3, ease: 'back.out(3)' });
    h.damage(1 * P, 'bite');
    h.stun(1.0 + 0.6 * q, 'dizzy');
    h.say('AAAH! GET IT OFF!');
    this.merchantReact('cheer');
    const tl = gsap.timeline();
    for (let i = 0; i < 3; i++) {
      tl.to(m.upper.rotation, { x: -0.9, duration: 0.09 });
      tl.to(m.upper.rotation, { x: 0, duration: 0.07, onComplete: () => sfx.bite() });
    }
    tl.call(() => this.spawnPlantNear(new THREE.Vector3(cellX(pot.c), 0, cellZ(pot.r)), q, m));
  }

  spawnPlantNear(pos, q, model) {
    if (this.disposed) return;
    const start = toCell(pos.x, pos.z);
    let cell = null;
    const order = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    for (const [dc, dr] of order) {
      const c = start.c + dc, r = start.r + dr;
      const h = this.hero.cell;
      if (this.grid.free(c, r) && !(h.c === c && h.r === r) && this.grid.get(c, r).ch !== 'D') { cell = { c, r }; break; }
    }
    if (!cell) {
      if (model) gsap.to(model.root.scale, { x: 0, y: 0, z: 0, duration: 0.2, onComplete: () => this.scene.remove(model.root) });
      return;
    }
    const m = model || buildPlant();
    const plant = { c: cell.c, r: cell.r, q, P: power(q), hp: 2 + Math.round(q * 2), m, alive: true, bite: model ? 1.0 : 0.35, seed: Math.random() * 10 };
    this.grid.setPlant(cell.c, cell.r, plant);
    this.plants.push(plant);
    const tx = cellX(cell.c), tz = cellZ(cell.r);
    if (model) {
      const from = m.root.position.clone();
      const o = { t: 0 };
      gsap.to(o, {
        t: 1, duration: 0.4, ease: 'none',
        onUpdate: () => {
          m.root.position.set(from.x + (tx - from.x) * o.t, from.y + (0 - from.y) * o.t + Math.sin(o.t * Math.PI) * 0.8, from.z + (tz - from.z) * o.t);
        },
        onComplete: () => { sfx.place(); this.fx.puffs(new THREE.Vector3(tx, 0.05, tz), 0xb0e090, 4, 0.3, 0.5, 0.3, 0.4); },
      });
    } else {
      m.root.position.set(tx, 0, tz);
      this.scene.add(m.root);
      gsap.fromTo(m.root.scale, { x: 0.1, y: 0.1, z: 0.1 }, { x: 1, y: 1, z: 1, duration: 0.6, ease: 'elastic.out(1.2, 0.4)' });
      sfx.pop();
    }
  }

  updatePlants(dt) {
    const h = this.hero;
    for (const p of this.plants) {
      if (!p.alive) continue;
      const m = p.m;
      const dx = h.pos.x - m.root.position.x, dz = h.pos.z - m.root.position.z;
      const target = Math.atan2(dx, dz);
      let d = target - m.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      m.root.rotation.y += d * Math.min(1, dt * 6);
      m.neck.rotation.z = Math.sin(this.time * 2 + p.seed) * 0.12;
      if (!p.biting) m.upper.rotation.x = -0.15 - Math.abs(Math.sin(this.time * 3 + p.seed)) * 0.2;
      const dist = Math.hypot(dx, dz);
      if (h.active && dist <= 1.6) {
        p.bite -= dt;
        if (p.bite <= 0) this.plantBite(p);
      }
    }
  }

  plantBite(p) {
    p.bite = 1.1;
    p.biting = true;
    const m = p.m;
    const tl = gsap.timeline({ onComplete: () => { p.biting = false; } });
    tl.to(m.neck.rotation, { x: 0.7, duration: 0.12, ease: 'power2.in' });
    tl.to(m.upper.rotation, { x: -1.0, duration: 0.1 }, 0);
    tl.to(m.upper.rotation, { x: 0, duration: 0.06 });
    tl.call(() => {
      if (!p.alive) return;
      sfx.bite();
      const h = this.hero;
      if (!h.active) return;
      h.damage(0.5 * p.P, 'bite');
      this.fx.sparks(new THREE.Vector3(h.pos.x, 0.7, h.pos.z), 0xff6060, 5, 2);
      if (Math.random() < 0.4) h.say(pick(HERO_PAIN));
      const ortho = Math.abs(p.c - h.cell.c) + Math.abs(p.r - h.cell.r) === 1;
      if (ortho && Math.random() < 0.55) h.nemesis = p;
    });
    tl.to(m.neck.rotation, { x: 0, duration: 0.25 });
  }

  hitPlant(p) {
    if (!p.alive) return;
    p.hp--;
    this.fx.shards(new THREE.Vector3(cellX(p.c), 0.6, cellZ(p.r)), 0x4fae38, 5, 0.6);
    gsap.fromTo(p.m.root.scale, { x: 1.3, y: 0.7, z: 1.3 }, { x: 1, y: 1, z: 1, duration: 0.4, ease: 'elastic.out(1, 0.4)' });
    sfx.squish();
    if (p.hp <= 0) {
      p.alive = false;
      this.grid.setPlant(p.c, p.r, null);
      this.plants = this.plants.filter((k) => k !== p);
      gsap.to(p.m.root.scale, { x: 0, y: 0, z: 0, duration: 0.3, delay: 0.1, ease: 'back.in(2)', onComplete: () => this.scene.remove(p.m.root) });
      this.fx.puffs(new THREE.Vector3(cellX(p.c), 0.4, cellZ(p.r)), 0x9ad070, 6, 0.4, 0.7, 0.6, 0.4);
      this.hero.say('Take that, weed!');
      if (this.hero.nemesis === p) this.hero.nemesis = null;
    }
  }

  spawnCloud(pos, q) {
    const R = 1.3 + 0.5 * q;
    const life = 5 + 3 * q;
    const g = new THREE.Group();
    g.position.set(pos.x, 0, pos.z);
    const sprites = [];
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.puff(), color: 0xc6a6ff, transparent: true, opacity: 0, depthWrite: false }));
      s.scale.setScalar(R * (0.8 + Math.random() * 0.5));
      s.userData = { a: Math.random() * Math.PI * 2, r: Math.random() * R * 0.6, y: 0.3 + Math.random() * 0.8, sp: 0.3 + Math.random() * 0.5 };
      g.add(s);
      sprites.push(s);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 14), new THREE.MeshBasicMaterial({ color: 0x9a7ae0, transparent: true, opacity: 0, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.02;
    g.add(disc);
    this.scene.add(g);
    const cloud = { pos: g.position, R, life, max: life, q, g, sprites, disc, fade: { k: 0 } };
    gsap.to(cloud.fade, { k: 1, duration: 0.5 });
    this.clouds.push(cloud);
    sfx.puff();
  }

  updateClouds(dt) {
    const h = this.hero;
    for (const c of [...this.clouds]) {
      c.life -= dt;
      const k = c.fade.k * Math.min(1, c.life);
      for (const s of c.sprites) {
        const u = s.userData;
        u.a += u.sp * dt;
        s.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(this.time + u.a) * 0.1, Math.sin(u.a) * u.r);
        s.material.opacity = 0.42 * k;
      }
      c.disc.material.opacity = 0.22 * k;
      if (h.active && h.t.sleep <= 0 && h.t.sleepImmune <= 0 && xzDist(h.pos, c.pos) < c.R) {
        h.sleep(3.2 * power(c.q));
        this.merchantReact('cheer');
        this.say(this.merchant, 'Sweet dreams, vandal.');
      }
      if (c.life <= 0) {
        this.scene.remove(c.g);
        this.clouds = this.clouds.filter((x) => x !== c);
      }
    }
  }

  spawnPuddle(pos, q, stickInside) {
    const R = 1.0 + 0.35 * q;
    const life = 8 + 4 * q;
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(R, 10), lam(0xffc83a, { emissive: 0x3a2400, transparent: true, opacity: 0.9, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.016, pos.z);
    mesh.scale.setScalar(0.1);
    this.scene.add(mesh);
    gsap.to(mesh.scale, { x: 1, y: 1, z: 1, duration: 0.4, ease: 'back.out(2)' });
    this.puddles.push({ pos: mesh.position, R, life, max: life, mesh });
    this.fx.sparks(new THREE.Vector3(pos.x, 0.2, pos.z), 0xffd050, 10, 2);
    sfx.splat();
    const h = this.hero;
    if (stickInside && h.active && xzDist(h.pos, pos) < R) {
      h.stick(1.5 * power(q));
      h.say('Ugh, my boots!');
    }
  }

  updatePuddles(dt) {
    for (const p of [...this.puddles]) {
      p.life -= dt;
      p.mesh.material.opacity = 0.9 * Math.min(1, p.life);
      if (Math.random() < dt * 2) this.fx.puffs(new THREE.Vector3(p.pos.x + (Math.random() - 0.5) * p.R, 0.05, p.pos.z + (Math.random() - 0.5) * p.R), 0xffe08a, 1, 0.15, 0.6, 0.3, 0.05);
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.puddles = this.puddles.filter((x) => x !== p);
      }
    }
    const h = this.hero;
    h.slowed = this.puddles.some((p) => xzDist(h.pos, p.pos) < p.R);
  }

  spawnSwarm(pos, q) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.position.y = Math.max(0.6, pos.y);
    const bees = [];
    for (let i = 0; i < 8; i++) {
      const b = buildBee();
      b.userData.ph = Math.random() * 10;
      b.userData.rad = 0.2 + Math.random() * 0.3;
      g.add(b);
      bees.push(b);
    }
    this.scene.add(g);
    const life = 6 + 4 * q;
    this.swarms.push({ g, bees, life, P: power(q), acc: 0, buzz: 0 });
    sfx.buzz();
    this.merchantReact('cheer');
  }

  updateSwarms(dt) {
    const h = this.hero;
    for (const s of [...this.swarms]) {
      s.life -= dt;
      const target = new THREE.Vector3(h.pos.x, 0.9, h.pos.z);
      const d = s.g.position.distanceTo(target);
      if (h.active && s.life > 0) {
        const step = Math.min(d, 3.0 * dt);
        if (d > 0.01) s.g.position.addScaledVector(target.sub(s.g.position).normalize(), step);
        if (d < 0.9) {
          h.panic(0.5);
          s.acc += 0.4 * s.P * dt;
          if (s.acc >= 0.25) { s.acc -= 0.25; h.damage(0.25, 'sting'); }
        }
      } else {
        s.g.position.y += dt * 1.5;
      }
      s.buzz -= dt;
      if (s.buzz <= 0) { sfx.buzz(); s.buzz = 0.7; }
      for (const b of s.bees) {
        const u = b.userData;
        u.ph += dt * 9;
        b.position.set(Math.cos(u.ph) * u.rad, Math.sin(u.ph * 1.7) * 0.2, Math.sin(u.ph * 1.3) * u.rad);
        b.rotation.y = u.ph;
        for (const w of b.userData.wings) w.scale.y = 0.4 + Math.abs(Math.sin(u.ph * 6));
      }
      if (s.life < 0) {
        s.g.scale.setScalar(Math.max(0, 1 + s.life));
        if (s.life < -1) {
          this.scene.remove(s.g);
          this.swarms = this.swarms.filter((x) => x !== s);
        }
      }
    }
  }

  // ------------------------------------------------------------ pickups

  addPickup(kind, g, pos, life, extra = {}) {
    const collider = new THREE.Mesh(new THREE.SphereGeometry(0.38, 6, 4), new THREE.MeshBasicMaterial({ visible: false }));
    collider.position.y = 0.2;
    g.add(collider);
    g.position.set(pos.x, 0, pos.z);
    this.scene.add(g);
    const cell = toCell(pos.x, pos.z);
    const p = { kind, g, life, max: life, alive: true, collider, c: cell.c, r: cell.r, seed: Math.random() * 10, ...extra };
    this.pickups.push(p);
    return p;
  }

  spawnClay(pos) {
    const g = buildClayLump();
    const a = Math.random() * Math.PI * 2;
    const tx = pos.x + Math.cos(a) * 0.3, tz = pos.z + Math.sin(a) * 0.3;
    const p = this.addPickup('clay', g, pos, 9, { value: 3 });
    if (this.levelIndex === 0 && !this.hintClay) {
      this.hintClay = true;
      gsap.delayedCall(0.5, () => this.hud.float('Click the clay to collect it!', new THREE.Vector3(tx, 0.8, tz), 'warn'));
    }
    const lump = g.userData.lump;
    gsap.fromTo(lump.position, { y: 0.5 }, { y: 0.1, duration: 0.5, ease: 'bounce.out' });
    gsap.to(g.position, { x: tx, z: tz, duration: 0.5 });
    p.c = toCell(tx, tz).c;
    p.r = toCell(tx, tz).r;
  }

  spawnHeart(pos) {
    const g = buildHeart();
    const p = this.addPickup('heart', g, pos, 8);
    if (this.levelIndex === 0 && !this.hintHeart) {
      this.hintHeart = true;
      gsap.delayedCall(0.4, () => this.hud.float('Snatch the heart before Petey eats it!', new THREE.Vector3(pos.x, 1.0, pos.z), 'warn'));
    }
    gsap.fromTo(g.children[0].position, { y: 0.9 }, { y: 0.3, duration: 0.6, ease: 'bounce.out' });
    return p;
  }

  spawnCoins(pos, n) {
    for (let i = 0; i < n; i++) {
      const c = buildCoin();
      c.position.set(pos.x, 0.3, pos.z);
      this.scene.add(c);
      const a = Math.random() * Math.PI * 2;
      const r = 0.4 + Math.random() * 0.6;
      const tl = gsap.timeline({ onComplete: () => this.scene.remove(c) });
      tl.to(c.position, { x: pos.x + Math.cos(a) * r, z: pos.z + Math.sin(a) * r, duration: 0.5 }, 0);
      tl.to(c.position, { y: 0.9, duration: 0.25, ease: 'power2.out' }, 0);
      tl.to(c.position, { y: 0.08, duration: 0.25, ease: 'bounce.out' }, 0.25);
      tl.to(c.rotation, { y: Math.PI * 6, duration: 1.2 }, 0);
      tl.to(c.position, {
        x: () => this.hero.pos.x, y: 0.8, z: () => this.hero.pos.z, duration: 0.3, delay: 0.25 + i * 0.05, ease: 'power2.in',
        onComplete: () => { this.hero.loot++; if (i === 0) sfx.coin(); },
      });
    }
  }

  collectClay(p) {
    p.alive = false;
    this.pickups = this.pickups.filter((x) => x !== p);
    const wp = p.g.position.clone();
    wp.y = 0.3;
    this.scene.remove(p.g);
    sfx.clay();
    this.hud.flyToClay(wp, p.value);
  }

  addClay(n) {
    if (this.disposed) return;
    this.clay += n;
    this.hud.setClay(this.clay, true);
  }

  snatchHeart(p) {
    p.alive = false;
    this.pickups = this.pickups.filter((x) => x !== p);
    sfx.heart();
    const to = this.merchant.root.position.clone();
    gsap.to(p.g.position, { x: to.x, y: 1.2, z: to.z, duration: 0.5, ease: 'power2.in', onComplete: () => this.scene.remove(p.g) });
    this.say(this.merchant, 'Mine, thank you!');
    this.hud.float('+1', new THREE.Vector3(to.x, 1.6, to.z), 'clay');
    this.addClay(1);
  }

  updatePickups(dt) {
    const h = this.hero;
    for (const p of [...this.pickups]) {
      if (!p.alive) continue;
      p.life -= dt;
      const body = p.g.children[0];
      body.rotation.y += dt * 2.5;
      if (p.g.userData.spark) p.g.userData.spark.material.opacity = 0.5 + 0.5 * Math.sin(this.time * 8 + p.seed);
      if (p.kind === 'heart') body.position.y = 0.3 + Math.sin(this.time * 3 + p.seed) * 0.06;
      p.g.visible = p.life > 2 || Math.floor(p.life * 8) % 2 === 0;
      if (p.kind === 'heart' && h.active && xzDist(h.pos, p.g.position) < 0.5) {
        p.alive = false;
        this.pickups = this.pickups.filter((x) => x !== p);
        this.scene.remove(p.g);
        h.heal(1);
        sfx.heart();
        h.say('A heart! Yum!');
        this.hud.setHeroHP(h.hp);
        this.hud.float('+1', new THREE.Vector3(h.pos.x, 1.9, h.pos.z), 'heal');
        continue;
      }
      if (p.life <= 0) {
        p.alive = false;
        this.pickups = this.pickups.filter((x) => x !== p);
        gsap.to(p.g.scale, { x: 0, y: 0, z: 0, duration: 0.2, onComplete: () => this.scene.remove(p.g) });
      }
    }
  }

  // ------------------------------------------------------------ hero hooks

  onHeroDamaged(amount, kind) {
    this.stats.damage += amount;
    const h = this.hero;
    this.hud.setHeroHP(h.hp);
    this.hud.float(`-${amount}`, new THREE.Vector3(h.pos.x, 1.85, h.pos.z), 'dmg');
    if (this.cheerCd <= 0 && kind !== 'sting') {
      this.cheerCd = 3;
      if (Math.random() < 0.5) this.say(this.merchant, pick(MERCH_CHEERS));
      this.merchantReact('cheer');
    }
    if (h.hp <= 0 && this.phase === 'wave') this.winKO();
  }

  say(who, text) {
    if (!who || this.disposed) return;
    if (who === this.hero) {
      this.hud.say('hero', text, () => new THREE.Vector3(this.hero.pos.x, 2.1, this.hero.pos.z));
    } else {
      const p = this.merchant.root.position;
      this.hud.say('merchant', text, () => new THREE.Vector3(p.x, 2.05, p.z));
    }
  }

  // ------------------------------------------------------------ merchant

  merchantIdle() {
    const m = this.merchant;
    gsap.to(m.body.position, { y: 0.03, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  }

  merchantReact(kind) {
    const m = this.merchant;
    if (!m) return;
    this.merchantMoodT = kind === 'cry' ? 2 : 1.4;
    const [L, R] = m.arms;
    gsap.killTweensOf([L.rotation, R.rotation, m.head.rotation]);
    if (kind === 'cry') {
      m.setFace('cry');
      sfx.merchantGasp();
      gsap.to([L.rotation, R.rotation], { x: -2.7, duration: 0.2 });
      gsap.fromTo(m.head.rotation, { z: -0.2 }, { z: 0.2, duration: 0.12, yoyo: true, repeat: 7 });
    } else if (kind === 'shock') {
      m.setFace('shock');
      gsap.to([L.rotation, R.rotation], { x: -1.4, duration: 0.15 });
    } else {
      m.setFace('happy');
      sfx.merchantCheer();
      gsap.to(R.rotation, { x: -3, duration: 0.15 });
      gsap.fromTo(R.rotation, { z: 0 }, { z: 0.4, duration: 0.12, yoyo: true, repeat: 5 });
    }
  }

  updateMerchant(dt) {
    const m = this.merchant;
    if (!m) return;
    m.tick(dt);
    if (this.merchantMoodT > 0) {
      this.merchantMoodT -= dt;
      if (this.merchantMoodT <= 0) {
        m.setFace(this.merchLeft < this.merchTotal - this.merchToPlace ? 'angry' : 'idle');
        gsap.to([m.arms[0].rotation, m.arms[1].rotation], { x: 0, z: 0, duration: 0.3 });
        gsap.to(m.head.rotation, { z: 0, duration: 0.3 });
      }
    }
    if (this.hero.root.visible) {
      const dx = this.hero.pos.x - m.root.position.x, dz = this.hero.pos.z - m.root.position.z;
      const rel = Math.atan2(dx, dz) - m.root.rotation.y;
      const a = Math.max(-0.9, Math.min(0.9, Math.atan2(Math.sin(rel), Math.cos(rel))));
      m.head.rotation.y += (a - m.head.rotation.y) * Math.min(1, dt * 5);
    }
  }

  // ------------------------------------------------------------ flow

  startWave() {
    if (this.phase !== 'prep' || this.merchToPlace > 0) return;
    this.phase = 'wave';
    if (this.selected === 'merch') this.select(null);
    for (const id of this.hazards) this.cooldowns[id] = 0;
    this.hud.toWave();
    this.hud.banner("SHOP'S OPEN!", this.level.name, 1.2);
    sfx.bell();
    music.setTempo(1.08);
    const door = this.shop.doorPivot;
    gsap.to(door.rotation, { y: -1.9, duration: 0.6, ease: 'back.out(2)' });
    gsap.to(this.shop.spill.material, { opacity: 0.35, duration: 0.6 });
    gsap.delayedCall(0.5, () => {
      if (this.disposed) return;
      this.hero.enter();
      this.say(this.merchant, "Welcome to Mortimer's!");
    });
    gsap.delayedCall(1.6, () => this.say(this.hero, this.level.intro));
  }

  winKO() {
    if (this.phase !== 'wave') return;
    this.endLevel(true, 'ko');
    this.timeScale = 0.3;
    gsap.globalTimeline.timeScale(0.3);
    this.hud.banner('K.O.!', 'Petey has been defeated!', 2, '#ffd75a');
    this.say(this.merchant, 'And STAY out!');
    gsap.to(this.cam.userData, { zoom: 1.7, duration: 0.6, ease: 'power2.out' });
    gsap.to(this.cam.userData.target, { x: this.hero.pos.x, y: 0.5, z: this.hero.pos.z, duration: 0.6, ease: 'power2.out' });
    gsap.delayedCall(0.55, () => { this.timeScale = 1; gsap.globalTimeline.timeScale(1); });
    this.merchantReact('cheer');
    gsap.delayedCall(3.0, () => this.finish());
  }

  winTime() {
    if (this.phase !== 'wave') return;
    this.endLevel(true, 'time');
    sfx.bell();
    this.hud.banner('CLOSING TIME!', 'The shop survives another day', 2);
    this.say(this.merchant, "We're closed! OUT!");
    this.hero.leave();
    gsap.delayedCall(0.8, () => this.hero.say('Aww. See you tomorrow!'));
    this.merchantReact('cheer');
    gsap.delayedCall(3.2, () => this.finish());
  }

  lose() {
    if (this.phase !== 'wave') return;
    this.endLevel(false, 'broke');
    this.hero.victory();
    sfx.sad();
    this.hud.banner('SOLD OUT...', 'to a vandal. Every last pot.', 2.2, '#ff7a6a');
    this.merchant.setFace('cry');
    gsap.to(this.cam.userData, { zoom: 1.4, duration: 1.2, ease: 'power2.inOut' });
    gsap.to(this.cam.userData.target, { x: this.hero.pos.x, z: this.hero.pos.z, duration: 1.2, ease: 'power2.inOut' });
    gsap.delayedCall(3.2, () => this.finish());
  }

  endLevel(win, reason) {
    this.phase = 'end';
    this.select(null);
    this.hud.toEnd();
    music.setTempo(1);
    const ratio = this.merchLeft / this.merchTotal;
    const stars = !win ? 0 : ratio >= 1 ? 3 : ratio >= 0.5 ? 2 : 1;
    const reward = win ? this.level.reward : null;
    const isNew = reward && !save.known(reward);
    if (win) {
      save.winLevel(this.level.id, stars);
      if (isNew) save.learn(reward);
    }
    this.result = {
      win, reason, stars, levelIndex: this.levelIndex, merchLeft: this.merchLeft, merchTotal: this.merchTotal,
      damage: this.stats.damage, traps: this.stats.traps, loot: this.hero.loot, reward: isNew ? reward : null,
      timeLeft: Math.max(0, this.remaining),
    };
  }

  finish() {
    if (this.disposed) return;
    this.app.showResults(this.result);
  }

  // ------------------------------------------------------------ frame

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  flash(a, color) {
    const r = this.app.renderer;
    r.flashColor.set(color);
    r.flash.value = a;
    gsap.to(r.flash, { value: 0, duration: 0.35 });
  }

  update(realDt) {
    if (this.paused) return;
    const dt = Math.min(realDt, 0.05) * this.timeScale;
    this.time += dt;
    this.cheerCd -= dt;
    if (this.phase === 'wave') {
      this.remaining -= dt;
      this.elapsed += dt;
      this.clayTimer += dt;
      if (this.clayTimer >= this.level.regen) {
        this.clayTimer -= this.level.regen;
        this.clay++;
        this.hud.setClay(this.clay);
      }
      for (const id in this.cooldowns) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
      this.hud.setTime(this.remaining, this.level.duration);
      if (this.remaining <= 0) this.winTime();
    }
    this.updatePuddles(dt);
    this.hero.update(dt);
    this.tickFuses(dt);
    this.updatePlants(dt);
    this.updateClouds(dt);
    this.updateSwarms(dt);
    this.updatePickups(dt);
    this.updateMerchant(dt);
    for (const pot of this.pots) {
      const gl = pot.mesh.userData.glint;
      if (gl) gl.material.opacity = 0.4 + 0.6 * Math.max(0, Math.sin(this.time * 3 + pot.id));
    }
    if (this.ghost) this.ghost.rotation.y += dt;
    this.fx.update(dt);

    // late-afternoon light creeping in as the day goes on
    const k = Math.min(1, this.elapsed / this.level.duration);
    this.shop.sun.color.lerpColors(this.sunA, this.sunB, k);
    this.shop.hemi.color.lerpColors(this.hemiA, this.hemiB, k * 0.7);
    for (const l of this.shop.lights) l.intensity = 6 + Math.sin(this.time * 9 + l.id) * 0.4 + k * 3;

    this.shakeAmt *= Math.exp(-realDt * 7);
    this.shakeVec.set((Math.random() - 0.5) * this.shakeAmt, (Math.random() - 0.5) * this.shakeAmt, (Math.random() - 0.5) * this.shakeAmt);
    fitIso(this.cam, this.app.renderer.aspect);
    placeIso(this.cam, this.shakeAmt > 0.005 ? this.shakeVec : null);
    this.hud.update();
  }

  render() {
    this.app.renderer.render(this.scene, this.cam);
  }

  setPaused(p) {
    this.paused = p;
    this.hud.setPaused(p);
  }

  dispose() {
    this.disposed = true;
    const cv = this.app.canvas;
    cv.removeEventListener('pointermove', this.onMove);
    cv.removeEventListener('pointerdown', this.onDown);
    cv.removeEventListener('contextmenu', this.onCtx);
    window.removeEventListener('keydown', this.onKey);
    this.hud.destroy();
    this.fx.clear();
    gsap.globalTimeline.timeScale(1);
  }
}
