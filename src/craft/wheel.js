import * as THREE from 'three';
import gsap from 'gsap';
import { RECIPES, PROFILE_N, WHEEL_MAX_R, WHEEL_MAX_H, matchScore, gradeOf, qualityOf, power, profileAt } from '../game/recipes.js';
import { tex, potTexture } from '../render/textures.js';
import { lam, buildShelf, potMesh } from '../models/models.js';
import { save } from '../game/save.js';
import { sfx } from '../audio.js';
import { HandTracker, HAND_BONES } from './hands.js';
import { drawPotIcon } from '../ui/icons.js';

const TIME_LIMIT = 45;
const START = { h: 0.85, r: 0.5 };

// Maps the (mirrored) webcam frame onto the space around the clay.
function handToWorld(p, out) {
  return out.set((p.x - 0.5) * 3.6, (1 - p.y) * 2.4 - 0.25, -p.z * 2.5);
}

function clayGeometry(prof, segments = 16) {
  const pts = [new THREE.Vector2(0.001, 0)];
  for (let i = 0; i < PROFILE_N; i++) pts.push(new THREE.Vector2(Math.max(0.03, prof.r[i]), (i / (PROFILE_N - 1)) * prof.h));
  const rim = prof.r[PROFILE_N - 1];
  const wall = Math.min(0.09, rim * 0.4);
  const depth = Math.min(prof.h * 0.35, 0.4);
  pts.push(new THREE.Vector2(rim - wall * 0.5, prof.h + 0.02));
  pts.push(new THREE.Vector2(rim - wall, prof.h));
  pts.push(new THREE.Vector2(rim - wall, prof.h - depth));
  pts.push(new THREE.Vector2(0.001, prof.h - depth));
  return new THREE.LatheGeometry(pts, segments);
}

function silhouettePoints(prof, z = 0.01) {
  const pts = [];
  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    const y = (i / steps) * prof.h;
    pts.push(new THREE.Vector3(profileAt(prof, y), y, z));
  }
  for (let i = steps; i >= 0; i--) {
    const y = (i / steps) * prof.h;
    pts.push(new THREE.Vector3(-profileAt(prof, y), y, z));
  }
  return pts;
}

export class CraftScreen {
  constructor(app, recipeId) {
    this.app = app;
    this.recipe = RECIPES[recipeId];
    this.id = recipeId;
    this.target = this.recipe.profile;
    this.profile = { h: START.h, r: new Array(PROFILE_N).fill(START.r) };
    for (let i = 0; i < PROFILE_N; i++) this.profile.r[i] = START.r * (1 - 0.15 * Math.pow(i / (PROFILE_N - 1), 3));
    this.state = 'choose';
    this.timeLeft = TIME_LIMIT;
    this.spin = 0;
    this.spinSpeed = 9;
    this.tools = [];
    this.mouse = { down: false, pull: false, x: 0, y: 0, active: false };
    this.touchT = 0;
    this.time = 0;

    this.buildScene();
    this.buildUI();
    if (app.handMode === 'hands') this.startHands();
    else if (app.handMode === 'mouse') this.startMouse();
    else this.showChooser();
  }

  // ------------------------------------------------------------ scene

  buildScene() {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x1d120b);
    s.fog = new THREE.Fog(0x1d120b, 8, 16);
    this.cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    this.camTarget = new THREE.Vector3(0, 0.8, 0);
    this.cam.position.set(0, 1.9, 5.6);
    this.cam.lookAt(this.camTarget);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), lam(0xffffff, { map: (() => { const t = tex.floor().clone(); t.repeat.set(7, 5); t.needsUpdate = true; return t; })() }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.62;
    s.add(floor);
    const wallT = tex.wall().clone();
    wallT.repeat.set(7, 2);
    wallT.needsUpdate = true;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.5), lam(0xffffff, { map: wallT }));
    wall.position.set(0, 1.6, -2.6);
    s.add(wall);
    for (const x of [-3.2, -2.2, 2.2, 3.2]) {
      const sh = buildShelf();
      sh.position.set(x, -0.62, -2.15);
      s.add(sh);
    }
    // finished pots for decoration
    ['bomb', 'zap', 'snooze', 'glue'].forEach((id, i) => {
      const p = potMesh(id);
      p.position.set(-1.7 + i * 1.1 + (i > 1 ? 0.6 : -0.6), -0.62, -2.0);
      p.scale.setScalar(1.3);
      s.add(p);
    });

    // wheel
    const wheel = (this.wheel = new THREE.Group());
    s.add(wheel);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.15, 0.5, 10), lam(0xffffff, { map: tex.darkWood() }));
    base.position.y = -0.37;
    const pan = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.38, 0.22, 16, 1, true), lam(0xffffff, { map: tex.lightWood(), side: THREE.DoubleSide }));
    pan.position.y = -0.05;
    const head = (this.head = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.09, 16), lam(0xffffff, { map: tex.stone() })));
    head.position.y = -0.045;
    wheel.add(base, pan, head);
    for (let i = 0; i < 4; i++) {
      const notch = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.3), lam(0x5a4a3a));
      notch.position.set(Math.sin((i * Math.PI) / 2) * 0.95, 0.005, Math.cos((i * Math.PI) / 2) * 0.95);
      notch.rotation.y = (i * Math.PI) / 2;
      head.add(notch);
    }

    // clay
    this.clayMat = new THREE.MeshPhongMaterial({ color: 0xffffff, map: tex.clayWet(), shininess: 40, specular: 0x6a4030, side: THREE.DoubleSide });
    this.clay = new THREE.Mesh(clayGeometry(this.profile), this.clayMat);
    s.add(this.clay);

    // target ghost + outline
    const ghostGeo = clayGeometry(this.target, 24);
    this.ghost = new THREE.Mesh(ghostGeo, new THREE.MeshBasicMaterial({ color: this.recipe.color, transparent: true, opacity: 0.1, depthWrite: false }));
    s.add(this.ghost);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(silhouettePoints(this.target, 0));
    this.outline = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: this.recipe.color, dashSize: 0.06, gapSize: 0.04, transparent: true, opacity: 0.9, depthTest: false }));
    this.outline.computeLineDistances();
    this.outline.renderOrder = 5;
    s.add(this.outline);

    // kiln off to the right
    const kiln = (this.kiln = new THREE.Group());
    kiln.position.set(3.4, -0.62, -0.4);
    const brick = lam(0xffffff, { map: tex.stone() });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 1.4), brick);
    body.position.y = 0.9;
    kiln.add(body);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), brick);
    dome.position.y = 1.8;
    dome.scale.set(1, 0.6, 0.88);
    kiln.add(dome);
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.9, 6), brick);
    chimney.position.set(0.35, 2.4, -0.2);
    kiln.add(chimney);
    this.kilnGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ color: 0x401000 }));
    this.kilnGlow.position.set(0, 0.95, 0.71);
    kiln.add(this.kilnGlow);
    this.kilnDoor = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.08), lam(0x4a4a50));
    this.kilnDoor.position.set(0, 0.95 + 1.05, 0.76);
    kiln.add(this.kilnDoor);
    this.kilnLight = new THREE.PointLight(0xff6a20, 0, 5, 1.5);
    this.kilnLight.position.set(0, 1.0, 1.3);
    kiln.add(this.kilnLight);
    s.add(kiln);

    // lights
    s.add(new THREE.HemisphereLight(0xffe2c0, 0x3a2414, 1.3));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.0);
    key.position.set(-3, 5, 4);
    s.add(key);
    const rim = new THREE.DirectionalLight(0x9ab8ff, 0.8);
    rim.position.set(4, 2, -3);
    s.add(rim);
    const lamp = new THREE.PointLight(0xffb060, 5, 6, 1.4);
    lamp.position.set(0, 2.4, 1.4);
    s.add(lamp);

    // fingertip markers
    this.markers = [];
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }));
      m.renderOrder = 6;
      m.visible = false;
      s.add(m);
      this.markers.push(m);
    }
    // low-poly 3D hands driven by landmarks
    this.handRigs = [0, 1].map(() => this.buildHandRig());

    this.resize();
    this.offResize = this.app.renderer.onResize(() => this.resize());
  }

  buildHandRig() {
    const g = new THREE.Group();
    const skin = lam(0xe8b48a);
    const clayStain = lam(0xa86a44);
    const joints = [];
    for (let i = 0; i < 21; i++) {
      const tip = [4, 8, 12, 16, 20].includes(i);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(i === 0 ? 0.07 : 0.042, 0), tip ? clayStain : skin);
      g.add(m);
      joints.push(m);
    }
    const bones = HAND_BONES.map(() => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 1, 5), skin);
      g.add(m);
      return m;
    });
    const palm = new THREE.Mesh(new THREE.BufferGeometry(), skin);
    palm.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3 * 3), 3));
    g.add(palm);
    g.visible = false;
    this.scene.add(g);
    return { g, joints, bones, palm, pts: Array.from({ length: 21 }, () => new THREE.Vector3()) };
  }

  updateHandRig(rig, hand) {
    if (!hand) { rig.g.visible = false; return; }
    rig.g.visible = true;
    hand.pts.forEach((p, i) => handToWorld(p, rig.pts[i]));
    rig.joints.forEach((j, i) => j.position.copy(rig.pts[i]));
    const up = new THREE.Vector3(0, 1, 0);
    HAND_BONES.forEach(([a, b], i) => {
      const m = rig.bones[i];
      const pa = rig.pts[a], pb = rig.pts[b];
      const d = pa.distanceTo(pb);
      m.position.copy(pa).add(pb).multiplyScalar(0.5);
      m.scale.set(1, d, 1);
      m.quaternion.setFromUnitVectors(up, pb.clone().sub(pa).normalize());
    });
    const P = rig.pts;
    const tri = [0, 5, 9, 0, 9, 13, 0, 13, 17, 0, 17, 5];
    const arr = rig.palm.geometry.attributes.position;
    tri.forEach((k, i) => arr.setXYZ(i, P[k].x, P[k].y, P[k].z));
    arr.needsUpdate = true;
    rig.palm.geometry.computeVertexNormals();
    rig.palm.material.side = THREE.DoubleSide;
  }

  resize() {
    this.cam.aspect = this.app.renderer.aspect;
    this.cam.fov = this.cam.aspect < 1.2 ? 44 : 32;
    this.cam.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ UI

  buildUI() {
    const r = this.recipe;
    const el = (this.ui = document.createElement('div'));
    el.className = 'craft';
    el.innerHTML = `
      <div class="craft-sheet panel">
        <div class="sheet-kicker">RECIPE</div>
        <div class="sheet-name" style="color:${r.color}">${r.name}</div>
        <canvas class="sheet-art" width="200" height="200"></canvas>
        <div class="sheet-legend"><span class="lg-target"></span>Target <span class="lg-you"></span>Your clay</div>
        <div class="sheet-desc">${r.desc}</div>
      </div>
      <div class="craft-top">
        <div class="match"><div class="match-num">0%</div><div class="match-label">MATCH</div><div class="match-grade g-D">D</div></div>
        <div class="timebar"><div class="timefill"></div></div>
      </div>
      <div class="cam-box panel">
        <div class="cam-view"><canvas class="cam-canvas" width="320" height="240"></canvas></div>
        <div class="cam-status">Starting...</div>
      </div>
      <div class="craft-bottom">
        <div class="craft-hint"></div>
        <button class="btn reset-btn" title="Start over with a fresh lump (R)">Reset</button>
        <button class="btn btn-go fire-btn">Fire in the Kiln!</button>
        <button class="btn btn-ghost back-btn">Back</button>
      </div>
      <div class="craft-chooser hidden">
        <div class="panel chooser-panel">
          <h2>How do you want to shape clay?</h2>
          <p>The wheel spins on its own. Push the clay in with your fingertips, pinch to pull it out, and shape it to match the dashed outline.</p>
          <div class="chooser-row">
            <button class="btn btn-go choose-hands">Use my hands (webcam)</button>
            <button class="btn choose-mouse">Use the mouse</button>
          </div>
          <p class="fine">Hand tracking runs locally in your browser. Nothing is uploaded.</p>
        </div>
      </div>
      <div class="craft-result hidden">
        <div class="stamp"></div>
        <div class="panel result-panel">
          <div class="res-title"></div>
          <div class="res-stats"></div>
          <div class="res-row">
            <button class="btn again-btn">Shape Again</button>
            <button class="btn btn-go done-btn">Done</button>
          </div>
        </div>
      </div>`;
    document.getElementById('ui').appendChild(el);
    this.$ = (s) => el.querySelector(s);
    this.sheet = this.$('.sheet-art');
    this.camCanvas = this.$('.cam-canvas');
    this.$('.fire-btn').onclick = () => this.fire();
    this.$('.reset-btn').onclick = () => this.resetClay();
    this.$('.back-btn').onclick = () => { sfx.click(); this.app.toWorkshop(); };
    this.$('.choose-hands').onclick = () => { sfx.click(); this.app.handMode = 'hands'; this.$('.craft-chooser').classList.add('hidden'); this.startHands(); };
    this.$('.choose-mouse').onclick = () => { sfx.click(); this.app.handMode = 'mouse'; this.$('.craft-chooser').classList.add('hidden'); this.startMouse(); };
    this.$('.again-btn').onclick = () => { sfx.click(); this.app.toWheel(this.id); };
    this.$('.done-btn').onclick = () => { sfx.click(); this.app.toWorkshop(); };
    this.drawSheet();
    gsap.from(this.$('.craft-sheet'), { x: -300, duration: 0.6, ease: 'back.out(1.4)' });
    gsap.from(this.$('.cam-box'), { x: 300, duration: 0.6, ease: 'back.out(1.4)' });
    gsap.from(this.$('.craft-top'), { y: -100, duration: 0.6, ease: 'back.out(1.4)' });

    const cv = this.app.canvas;
    this.onDown = (e) => {
      if (this.app.handMode !== 'mouse' || this.state !== 'shape') return;
      this.mouse.down = true;
      this.mouse.pull = e.button === 2 || e.shiftKey;
      this.onMove(e);
    };
    this.onUp = () => { this.mouse.down = false; };
    this.onMove = (e) => {
      const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.cam);
      const hit = new THREE.Vector3();
      if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit)) {
        this.mouse.x = hit.x;
        this.mouse.y = hit.y;
        this.mouse.active = true;
      }
      if (e.shiftKey !== undefined && this.mouse.down) this.mouse.pull = e.buttons === 2 || e.shiftKey;
    };
    this.onCtx = (e) => e.preventDefault();
    this.onKey = (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && this.state === 'shape') { e.preventDefault(); this.fire(); }
      if ((e.key === 'r' || e.key === 'R') && this.state === 'shape') this.resetClay();
    };
    cv.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    cv.addEventListener('pointermove', this.onMove);
    cv.addEventListener('contextmenu', this.onCtx);
    window.addEventListener('keydown', this.onKey);
  }

  showChooser() {
    this.$('.craft-chooser').classList.remove('hidden');
    gsap.from(this.$('.chooser-panel'), { scale: 0.6, opacity: 0, duration: 0.4, ease: 'back.out(2)' });
    this.$('.cam-status').textContent = 'Choose a control mode';
  }

  async startHands() {
    this.state = 'loading';
    this.$('.cam-status').textContent = 'Waking up the camera...';
    this.$('.craft-hint').innerHTML = 'Hold both hands up so the camera can see them. <b>Point</b> to push clay in, <b>pinch</b> to pull it out or up.';
    this.tracker = new HandTracker();
    try {
      await this.tracker.init();
      if (this.disposed) { this.tracker.stop(); return; }
      this.$('.cam-view').prepend(this.tracker.video);
      this.$('.cam-status').textContent = 'Show me your hands!';
      this.beginShaping();
    } catch (err) {
      console.warn('Hand tracking unavailable', err);
      if (this.tracker) this.tracker.stop();
      this.tracker = null;
      if (this.disposed) return;
      this.app.handMode = 'mouse';
      this.$('.cam-status').textContent = 'Camera unavailable — using the mouse instead.';
      this.startMouse();
    }
  }

  startMouse() {
    this.$('.craft-hint').innerHTML = '<b>Left-drag</b> on the clay to push it in. <b>Right-drag</b> (or Shift) to pull it out or stretch it up. <b>Enter</b> to fire.';
    if (!this.tracker) this.$('.cam-box').classList.add('mouse-mode');
    this.$('.cam-status').textContent = this.$('.cam-status').textContent.includes('unavailable') ? this.$('.cam-status').textContent : 'Mouse mode';
    this.beginShaping();
  }

  beginShaping() {
    this.state = 'shape';
    sfx.wheel();
    gsap.fromTo(this.clay.scale, { x: 1.3, y: 0.6, z: 1.3 }, { x: 1, y: 1, z: 1, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
  }

  // ------------------------------------------------------------ shaping

  resetClay() {
    if (this.state !== 'shape') return;
    sfx.squish();
    this.profile.h = START.h;
    for (let i = 0; i < PROFILE_N; i++) this.profile.r[i] = START.r * (1 - 0.15 * Math.pow(i / (PROFILE_N - 1), 3));
    gsap.fromTo(this.clay.scale, { x: 1.3, y: 0.6, z: 1.3 }, { x: 1, y: 1, z: 1, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
  }

  gatherTools() {
    this.tools.length = 0;
    if (this.tracker) {
      const hands = this.tracker.detect();
      const tmp = new THREE.Vector3();
      this.hands = hands;
      for (const h of hands) {
        const tip = handToWorld(h.pts[8], tmp.clone());
        if (h.pinch) {
          const t2 = handToWorld(h.pts[4], tmp.clone());
          tip.add(t2).multiplyScalar(0.5);
        }
        this.tools.push({ x: tip.x, y: tip.y, pull: h.pinch });
      }
      const n = hands.length;
      this.$('.cam-status').textContent = n === 0 ? 'Show me your hands!' : n === 1 ? 'One hand — try both!' : 'Both hands — shape away!';
    } else if (this.app.handMode === 'mouse' && this.mouse.down) {
      this.tools.push({ x: this.mouse.x, y: this.mouse.y, pull: this.mouse.pull });
    }
  }

  shape(dt) {
    const P = this.profile;
    const sigma = 0.13;
    let touching = false;
    for (const t of this.tools) {
      const d = Math.abs(t.x);
      const y = t.y;
      // top of the pot: press down or pinch up
      const rTop = P.r[PROFILE_N - 1];
      if (t.pull && y > P.h - 0.04 && y < P.h + 0.35 && d < rTop + 0.3) {
        // pinch the rim and lift: the clay stretches up and thins out
        const nh = Math.max(0.35, Math.min(WHEEL_MAX_H, P.h + (y - P.h) * Math.min(1, dt * 3)));
        const k = Math.sqrt(P.h / nh);
        for (let i = 0; i < PROFILE_N; i++) P.r[i] = Math.max(0.08, P.r[i] * (1 + (k - 1) * 0.5));
        P.h = nh;
        touching = true;
        continue;
      }
      if (!t.pull && y > P.h + 0.02 && y < P.h + 0.22 && d < rTop * 0.85) {
        // press down on the top: the clay squashes and spreads a little
        const nh = Math.max(0.35, P.h - Math.min(0.02, (P.h + 0.22 - y) * dt * 1.5));
        for (let i = 0; i < PROFILE_N; i++) P.r[i] = Math.min(WHEEL_MAX_R, P.r[i] * (1 + (P.h - nh) * 0.2));
        P.h = nh;
        touching = true;
        continue;
      }
      if (y < -0.1 || y > P.h + 0.1) continue;
      for (let i = 0; i < PROFILE_N; i++) {
        const yi = (i / (PROFILE_N - 1)) * P.h;
        const w = Math.exp(-(((yi - y) / sigma) ** 2));
        if (w < 0.02) continue;
        const r = P.r[i];
        if (!t.pull && d < r) {
          P.r[i] += (d - r) * w * Math.min(1, dt * 7);
          touching = true;
        } else if (t.pull && Math.abs(d - r) < 0.4) {
          P.r[i] += (d - r) * w * Math.min(1, dt * 5);
          touching = true;
        }
      }
    }
    // the clay relaxes into a smooth curve
    const sm = Math.min(1, dt * 2.2);
    const copy = P.r.slice();
    for (let i = 1; i < PROFILE_N - 1; i++) P.r[i] += ((copy[i - 1] + copy[i + 1]) / 2 - copy[i]) * sm;
    for (let i = 0; i < PROFILE_N; i++) P.r[i] = Math.max(i === 0 ? 0.15 : 0.08, Math.min(WHEEL_MAX_R, P.r[i]));
    if (touching) {
      this.touchT += dt;
      if (this.touchT > 0.12) {
        this.touchT = 0;
        sfx.squish();
        const t = this.tools[0];
        if (t) this.splash(t.x, t.y);
      }
    }
    return touching;
  }

  splash(x, y) {
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.025, 0), lam(0xa66a45));
      m.position.set(x, y, 0.1);
      this.scene.add(m);
      const vx = Math.sign(x || 1) * (0.5 + Math.random());
      gsap.to(m.position, { x: x + vx * 0.6, y: y - 0.8, z: 0.4 + Math.random() * 0.5, duration: 0.6, ease: 'power1.in', onComplete: () => this.scene.remove(m) });
    }
  }

  drawSheet() {
    const c = this.sheet;
    drawPotIcon(c, this.id, this.target, { maxH: WHEEL_MAX_H * 1.05 });
    drawPotIcon(c, this.id, this.profile, { maxH: WHEEL_MAX_H * 1.05, outline: '#ffffff', lineWidth: 3, dash: [6, 4], keep: true });
  }

  // ------------------------------------------------------------ firing

  fire() {
    if (this.state !== 'shape') return;
    this.state = 'firing';
    sfx.click();
    const match = matchScore(this.profile, this.target);
    const quality = qualityOf(match);
    const grade = gradeOf(match);
    const profile = { h: this.profile.h, r: this.profile.r.map((v) => Math.round(v * 1000) / 1000) };
    const improved = save.recordCraft(this.id, match, quality, profile);
    this.final = { match, quality, grade, improved };
    if (this.tracker) { this.tracker.stop(); }
    this.handRigs.forEach((r) => (r.g.visible = false));
    this.markers.forEach((m) => (m.visible = false));
    gsap.to(this.$('.craft-bottom'), { y: 120, opacity: 0, duration: 0.3 });
    gsap.to(this.$('.cam-box'), { x: 340, duration: 0.4 });
    gsap.to(this.outline.material, { opacity: 0, duration: 0.3 });
    gsap.to(this.ghost.material, { opacity: 0, duration: 0.3 });

    const glazed = new THREE.MeshPhongMaterial({ map: potTexture(this.recipe), shininess: 24, specular: 0x5a5a5a, side: THREE.DoubleSide });
    const tl = gsap.timeline();
    tl.to(this, { spinSpeed: 0, duration: 0.8, ease: 'power2.out' });
    tl.to(this.cam.position, { x: 2.2, y: 1.9, z: 5.0, duration: 1.0, ease: 'power2.inOut' }, 0.2);
    tl.to(this.camTarget, { x: 2.0, y: 0.6, duration: 1.0, ease: 'power2.inOut' }, 0.2);
    tl.to(this.clay.position, { y: 0.5, duration: 0.35, ease: 'power2.out' }, 0.6);
    tl.to(this.clay.position, { x: this.kiln.position.x, z: this.kiln.position.z + 0.2, duration: 0.6, ease: 'power2.inOut' }, 0.95);
    tl.to(this.clay.position, { y: -0.3, duration: 0.3 }, 1.4);
    tl.to(this.clay.scale, { x: 0.8, y: 0.8, z: 0.8, duration: 0.3 }, 1.4);
    tl.to(this.kilnDoor.position, { y: 0.95, duration: 0.25, ease: 'bounce.out' }, 1.7);
    tl.call(() => sfx.kiln(), null, 1.8);
    tl.to(this.kilnLight, { intensity: 14, duration: 0.4, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 1.8);
    tl.to(this.kilnGlow.material.color, { r: 1, g: 0.55, b: 0.15, duration: 0.4, yoyo: true, repeat: 3 }, 1.8);
    tl.call(() => { this.clay.material = glazed; }, null, 3.2);
    tl.to(this.kilnDoor.position, { y: 2.0, duration: 0.3, ease: 'power2.out' }, 3.4);
    tl.to(this.clay.position, { y: 0.25, x: 0, z: 0, duration: 0.6, ease: 'back.out(1.5)' }, 3.6);
    tl.to(this.clay.scale, { x: 1, y: 1, z: 1, duration: 0.6 }, 3.6);
    tl.to(this.cam.position, { x: 0.9, y: 1.7, z: 5.4, duration: 0.8, ease: 'power2.inOut' }, 3.5);
    tl.to(this.camTarget, { x: 0.9, y: 0.85, duration: 0.8, ease: 'power2.inOut' }, 3.5);
    tl.call(() => { this.spinSpeed = 1.2; this.showResult(); }, null, 4.3);
  }

  showResult() {
    const { match, grade, quality, improved } = this.final;
    const box = this.$('.craft-result');
    box.classList.remove('hidden');
    const stamp = this.$('.stamp');
    stamp.textContent = grade;
    stamp.className = `stamp g-${grade}`;
    const lines = {
      S: 'A masterpiece. Petey stands no chance.',
      A: 'Excellent work! That pot means business.',
      B: 'Solid craftsmanship.',
      C: 'It holds together... mostly.',
      D: "Er. It's a pot. Technically.",
    };
    this.$('.res-title').textContent = lines[grade];
    this.$('.res-stats').innerHTML = `
      <div><span>Shape match</span><b>${Math.round(match * 100)}%</b></div>
      <div><span>Trap power</span><b>x${power(quality).toFixed(2)}</b></div>
      <div class="${improved ? 'up' : ''}"><span>Your ${this.recipe.short} pots</span><b>${improved ? 'Upgraded!' : 'Kept your better one'}</b></div>`;
    const tl = gsap.timeline();
    tl.fromTo(stamp, { scale: 5, rotate: -30, opacity: 0 }, { scale: 1, rotate: -12, opacity: 1, duration: 0.35, ease: 'power4.in' });
    tl.call(() => { sfx.stamp(); this.app.renderer.flash.value = 0.25; gsap.to(this.app.renderer.flash, { value: 0, duration: 0.3 }); });
    tl.fromTo(stamp, { x: -6 }, { x: 0, duration: 0.3, ease: 'elastic.out(1, 0.3)' });
    tl.fromTo(this.$('.result-panel'), { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'back.out(2)' }, '-=0.1');
    tl.from(this.$('.res-stats').children, { x: -30, opacity: 0, stagger: 0.08, duration: 0.3 }, '-=0.2');
    if (grade === 'S' || grade === 'A') sfx.fanfare();
  }

  // ------------------------------------------------------------ frame

  update(dt) {
    this.time += dt;
    this.spin += dt * this.spinSpeed;
    this.head.rotation.y = this.spin;
    this.clay.rotation.y = this.spin;
    if (this.state === 'shape') {
      this.gatherTools();
      const touching = this.shape(dt);
      this.spinSpeed += ((touching ? 6.5 : 9) - this.spinSpeed) * Math.min(1, dt * 4);
      this.clay.geometry.dispose();
      this.clay.geometry = clayGeometry(this.profile);
      this.timeLeft -= dt;
      const match = matchScore(this.profile, this.target);
      const pct = Math.round(match * 100);
      this.$('.match-num').textContent = `${pct}%`;
      const grade = gradeOf(match);
      const gEl = this.$('.match-grade');
      if (gEl.textContent !== grade) {
        gEl.textContent = grade;
        gEl.className = `match-grade g-${grade}`;
        gsap.fromTo(gEl, { scale: 1.8 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' });
      }
      this.$('.timefill').style.width = `${Math.max(0, this.timeLeft / TIME_LIMIT) * 100}%`;
      this.$('.timebar').classList.toggle('urgent', this.timeLeft < 8);
      this.drawSheet();
      if (this.timeLeft <= 0) this.fire();
      if (Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) sfx.wheel();
    }
    // fingertip markers + hand rigs
    const hands = this.state === 'shape' && this.tracker ? this.hands || [] : [];
    this.handRigs.forEach((rig, i) => this.updateHandRig(rig, hands[i]));
    this.markers.forEach((m, i) => {
      let t = this.state === 'shape' ? this.tools[i] : null;
      if (!t && i === 0 && this.app.handMode === 'mouse' && this.state === 'shape' && this.mouse.active) t = { x: this.mouse.x, y: this.mouse.y, pull: this.mouse.pull && this.mouse.down, hover: !this.mouse.down };
      m.visible = !!t;
      if (t) {
        m.position.set(t.x, t.y, 0.05);
        m.material.color.set(t.hover ? 0xffffff : t.pull ? 0x7cd0ff : 0xffb040);
        m.scale.setScalar(t.hover ? 0.7 : 1 + Math.sin(this.time * 12) * 0.1);
      }
    });
    if (this.tracker && this.state === 'shape') this.drawCam(hands);
    this.cam.lookAt(this.camTarget);
  }

  drawCam(hands) {
    const c = this.camCanvas;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    for (const h of hands) {
      g.strokeStyle = h.pinch ? '#7cd0ff' : '#ffb040';
      g.lineWidth = 3;
      for (const [a, b] of HAND_BONES) {
        g.beginPath();
        g.moveTo(h.pts[a].x * c.width, h.pts[a].y * c.height);
        g.lineTo(h.pts[b].x * c.width, h.pts[b].y * c.height);
        g.stroke();
      }
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(h.pts[8].x * c.width, h.pts[8].y * c.height, 5, 0, Math.PI * 2);
      g.fill();
    }
  }

  render() {
    this.app.renderer.render(this.scene, this.cam);
  }

  dispose() {
    this.disposed = true;
    if (this.tracker) this.tracker.stop();
    const cv = this.app.canvas;
    cv.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    cv.removeEventListener('pointermove', this.onMove);
    cv.removeEventListener('contextmenu', this.onCtx);
    window.removeEventListener('keydown', this.onKey);
    this.offResize();
    this.ui.remove();
  }
}
