import * as THREE from 'three';
import { tex, potTexture, heroFace, merchantFace } from '../render/textures.js';
import { RECIPES, profileAt } from '../game/recipes.js';

// All models are built in code the way N64 artists built them: a few hundred
// smooth-shaded polygons each, rounded organic forms (lathes, deformed spheres,
// tapered limbs) and small painted textures for faces and fabric.

export function lam(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function lathe(points, segs = 12) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), segs);
}

// move every vertex through fn(v) then rebuild smooth normals
function deform(geo, fn) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    fn(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function tube(points, radius, segs = 16, radial = 6) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), segs, radius, radial, false);
}

export function blobShadow(size = 0.6, opacity = 1) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex.shadow(), transparent: true, depthWrite: false, opacity }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  m.renderOrder = 1;
  return m;
}

// ---------------------------------------------------------------- pots

export const POT_SCALE = 0.42;

export function potGeometry(profile, scale = POT_SCALE, segments = 14, samples = 12) {
  const pts = [new THREE.Vector2(0.001, 0)];
  const H = profile.h * scale;
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const r = profileAt(profile, t * profile.h) * scale;
    pts.push(new THREE.Vector2(Math.max(0.02, r), t * H));
  }
  const outer = pts.length;
  const rim = pts[pts.length - 1].x;
  const lip = Math.min(0.02, rim * 0.25);
  const wall = Math.min(0.035, rim * 0.35);
  const depth = Math.min(H * 0.3, 0.16);
  pts.push(new THREE.Vector2(rim + lip * 0.6, H + 0.008));
  pts.push(new THREE.Vector2(rim - wall * 0.4, H + 0.016));
  pts.push(new THREE.Vector2(rim - wall, H));
  pts.push(new THREE.Vector2(rim - wall, H - depth));
  pts.push(new THREE.Vector2(0.001, H - depth));
  const geo = new THREE.LatheGeometry(pts, segments);
  // baked shading: dark inside the mouth, a little darker toward the foot
  const n = geo.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const j = v % pts.length;
    const t = Math.min(1, pts[j].y / Math.max(0.01, H));
    const k = j >= outer + 2 ? 0.28 : j === 0 ? 0.55 : 0.72 + 0.28 * Math.min(1, t * 1.6);
    colors[v * 3] = colors[v * 3 + 1] = colors[v * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.userData.height = H;
  geo.userData.radius = pts.reduce((m, p) => Math.max(m, p.x), 0);
  return geo;
}

export function potMesh(recipeId, profile) {
  const recipe = RECIPES[recipeId];
  const geo = potGeometry(profile || recipe.profile);
  const mat = new THREE.MeshPhongMaterial({ map: potTexture(recipe), vertexColors: true, side: THREE.DoubleSide, shininess: 22, specular: 0x3a3a3a });
  const group = new THREE.Group();
  const body = new THREE.Mesh(geo, mat);
  group.add(body);
  const sh = blobShadow(geo.userData.radius * 2.6);
  group.add(sh);
  const H = geo.userData.height;
  group.userData = { body, shadow: sh, height: H, radius: geo.userData.radius };
  if (recipeId === 'bomb') {
    const fuse = mesh(tube([[0, 0, 0], [0.01, 0.04, 0], [0.03, 0.08, 0.01], [0.05, 0.1, 0.02]], 0.01, 8, 5), lam(0xd8c8a0), 0, H - 0.01, 0);
    group.add(fuse);
    group.userData.fuse = fuse;
  }
  if (recipeId === 'snapper') {
    for (const s of [-1, 1]) {
      const leaf = mesh(leafGeometry(0.16, 0.06), lam(0xffffff, { map: tex.leaf(), side: THREE.DoubleSide }), s * 0.02, H - 0.02, 0);
      leaf.rotation.set(-0.3, s * 0.5, s * -0.7);
      group.add(leaf);
    }
  }
  if (recipeId === 'merch') {
    // a little shine so the hero (and you) know it's the good stuff
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.star(), color: 0xfff2a0, transparent: true, depthWrite: false }));
    glint.scale.setScalar(0.2);
    glint.position.set(0.12, H * 0.7, 0.12);
    group.add(glint);
    group.userData.glint = glint;
  }
  return group;
}

// a pointed leaf with a gentle curl
function leafGeometry(len, wid) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(wid, len * 0.4, 0, len);
  s.quadraticCurveTo(-wid, len * 0.4, 0, 0);
  const geo = new THREE.ShapeGeometry(s, 6);
  const uv = geo.attributes.uv;
  const p = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / (wid * 2) + 0.5, p.getY(i) / len);
  return deform(geo, (v) => { v.z = (v.y / len) ** 2 * len * 0.45 - Math.abs(v.x) * 0.6; });
}

// ---------------------------------------------------------------- character helpers

// A chunky hair lock (or brow, or mustache tuft): a flattened four-sided
// spike hanging down from y=0, curled forward/sideways toward its tip.
function lock(len, w, t, curlZ = 0, curlX = 0) {
  const geo = new THREE.ConeGeometry(w, len, 4, 3);
  geo.rotateX(Math.PI);
  geo.translate(0, -len / 2, 0);
  return deform(geo, (v) => {
    v.z *= t / w;
    const k = -v.y / len;
    v.z += k * k * curlZ;
    v.x += k * k * curlX;
  });
}

function blob(r, sx, sy, sz, ws = 7, hs = 5) {
  const g = new THREE.SphereGeometry(r, ws, hs);
  g.scale(sx, sy, sz);
  return g;
}

// Vertex-color shading baked into a character, like N64 models carried:
// darker toward the feet and on surfaces facing down, brighter up top.
function bakeAO(root, yMin, yMax) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !o.material || o.material.isMeshBasicMaterial || o.userData.noAO) return;
    m.multiplyMatrices(inv, o.matrixWorld);
    nm.getNormalMatrix(m);
    const p = o.geometry.attributes.position;
    const no = o.geometry.attributes.normal;
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      n.fromBufferAttribute(no, i).applyMatrix3(nm).normalize();
      const t = Math.min(1, Math.max(0, (v.y - yMin) / (yMax - yMin)));
      const k = (0.62 + 0.38 * t * t * (3 - 2 * t)) * (0.8 + 0.2 * (n.y * 0.5 + 0.5));
      c[i * 3] = k; c[i * 3 + 1] = k * 0.98; c[i * 3 + 2] = k * 0.95;
    }
    o.geometry.setAttribute('color', new THREE.BufferAttribute(c, 3));
    o.material.vertexColors = true;
  });
}

// texture-swapped blinking, the way N64 faces blinked
function blinker(faceMat, faceFn, start, noBlink) {
  let expr = start, closed = false, t = 2 + Math.random() * 2;
  const apply = () => { faceMat.map = faceFn(expr, closed && !noBlink.includes(expr)); };
  return {
    setFace(e) { expr = e; apply(); },
    tick(dt) {
      t -= dt;
      if (!closed && t <= 0) { closed = true; t = 0.12; apply(); }
      else if (closed && t <= 0) { closed = false; t = 1.6 + Math.random() * 3; apply(); }
    },
  };
}

// ---------------------------------------------------------------- hero

export function buildHero() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const tunic = lam(0xffffff, { map: tex.tunic(), alphaTest: 0.5, side: THREE.DoubleSide });
  const green = lam(0x4aae38);
  const darkGreen = lam(0x2c7222);
  const tights = lam(0x5e8c34);
  const skin = lam(0xf6c8a0);
  const boot = lam(0x8e5628);
  const bootDark = lam(0x6a3c1a);
  const leather = lam(0x5a3214);
  const hairMat = lam(0xffffff, { map: tex.hair() });

  // legs: short and sturdy, with big soft boots
  const legs = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.082, 0.4, 0);
    pivot.add(mesh(new THREE.CylinderGeometry(0.066, 0.052, 0.2, 6), tights, 0, -0.1, 0));
    pivot.add(mesh(new THREE.CylinderGeometry(0.052, 0.044, 0.12, 6), tights, 0, -0.24, 0));
    pivot.add(mesh(new THREE.CylinderGeometry(0.068, 0.056, 0.11, 6), boot, 0, -0.31, 0));
    pivot.add(mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.035, 6), bootDark, 0, -0.25, 0));
    pivot.add(mesh(blob(1, 0.07, 0.052, 0.13), boot, 0, -0.36, 0.045));
    const toe = mesh(new THREE.ConeGeometry(0.036, 0.09, 5), boot, 0, -0.345, 0.165);
    toe.rotation.x = 1.15;
    pivot.add(toe);
    body.add(pivot);
    legs.push(pivot);
  }

  // tunic: an eight-sided lathe, leaf-cut hem from the texture
  body.add(mesh(lathe([[0.275, 0.26], [0.235, 0.32], [0.195, 0.4], [0.17, 0.47], [0.18, 0.55], [0.19, 0.63], [0.175, 0.69], [0.135, 0.74], [0.07, 0.77]], 8), tunic));
  body.add(mesh(lathe([[0.17, 0.455], [0.185, 0.465], [0.185, 0.505], [0.17, 0.515]], 8), leather));
  body.add(mesh(new THREE.BoxGeometry(0.065, 0.055, 0.02), lam(0xf0c840, { emissive: 0x302000 }), 0, 0.485, 0.188));
  const sheath = mesh(new THREE.ConeGeometry(0.032, 0.2, 5), leather, -0.18, 0.4, 0.05);
  sheath.rotation.set(0.2, 0, -0.35);
  body.add(sheath);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leaf = mesh(lock(0.1, 0.05, 0.018, 0.03), darkGreen, Math.sin(a) * 0.095, 0.765, Math.cos(a) * 0.095);
    leaf.rotation.set(Math.cos(a) * 1.1, a, 0, 'YXZ');
    body.add(leaf);
  }

  // arms: puffed sleeves and big mitten hands
  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.185, 0.715, 0);
    pivot.add(mesh(blob(0.07, 1, 0.95, 1, 7, 5), green));
    pivot.add(mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 6), green, 0, -0.07, 0));
    pivot.add(mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.03, 6), darkGreen, 0, -0.135, 0));
    pivot.add(mesh(new THREE.CylinderGeometry(0.044, 0.038, 0.11, 6), skin, 0, -0.195, 0));
    pivot.add(mesh(blob(1, 0.052, 0.06, 0.036), skin, 0, -0.285, 0.006));
    const thumb = mesh(blob(1, 0.019, 0.032, 0.019, 5, 4), skin, -s * 0.042, -0.27, 0.022);
    thumb.rotation.z = s * 0.5;
    pivot.add(thumb);
    body.add(pivot);
    arms.push(pivot);
  }
  const sword = new THREE.Group();
  sword.position.set(0, -0.3, 0.02);
  const grip = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.08, 5), leather);
  grip.rotation.x = Math.PI / 2;
  sword.add(grip);
  sword.add(mesh(new THREE.BoxGeometry(0.12, 0.022, 0.024), lam(0xe0b040, { emissive: 0x201400 }), 0, 0, 0.045));
  const steel = lam(0xe2eaf2, { emissive: 0x1a2028 });
  sword.add(mesh(new THREE.BoxGeometry(0.036, 0.01, 0.22), steel, 0, 0, 0.16));
  const tip = mesh(new THREE.ConeGeometry(0.025, 0.06, 4), steel, 0, 0, 0.3);
  tip.rotation.set(Math.PI / 2, Math.PI / 4, 0);
  tip.scale.set(1, 1, 0.3);
  sword.add(tip);
  arms[1].add(sword);

  // head: big, with a flat face, cheekbones and a pointed chin
  const head = new THREE.Group();
  head.position.set(0, 0.765, 0);
  body.add(head);
  head.add(mesh(new THREE.CylinderGeometry(0.046, 0.052, 0.07, 6), skin, 0, 0.01, 0));
  // everything above the neck tips up a touch so the face reads from the high camera
  const tilt = new THREE.Group();
  tilt.rotation.x = -0.14;
  head.add(tilt);
  const faceMat = lam(0xffffff, { map: heroFace('grin') });
  const R = 0.168;
  const skull = mesh(deform(new THREE.SphereGeometry(R, 12, 10), (v) => {
    if (v.z > 0) v.z *= 0.86;
    if (v.y > -0.04 && v.y < 0.05) v.x *= 1.05;
    if (v.y < 0) {
      const t = -v.y / R;
      v.x *= 1 - t * 0.55;
      v.z *= 1 - t * 0.2;
      if (v.z > 0) v.z += t * 0.025;
    }
    if (v.z < 0) v.z *= 1.06;
    v.y *= 1.04;
  }), faceMat, 0, 0.175, 0);
  tilt.add(skull);
  const nose = mesh(new THREE.ConeGeometry(0.024, 0.05, 4), skin, 0, 0.15, 0.142);
  nose.rotation.set(Math.PI / 2 + 0.25, Math.PI / 4, 0);
  tilt.add(nose);
  for (const s of [-1, 1]) {
    const ear = mesh(blob(1, 0.026, 0.052, 0.036, 6, 5), skin, s * 0.158, 0.17, -0.01);
    ear.rotation.z = s * -0.2;
    tilt.add(ear);
  }
  // hair: a swept cap and chunky locks, wild like he cut it himself
  const cap = mesh(new THREE.SphereGeometry(R * 1.05, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat, 0, 0.18, -0.012);
  cap.rotation.x = -0.74;
  tilt.add(cap);
  const hairLock = (x, y, z, len, rx, rz, curlZ = 0.03, curlX = 0, w = 0.048) => {
    const l = mesh(lock(len, w, 0.02, curlZ, curlX), hairMat, x, y, z);
    l.rotation.set(rx, 0, rz);
    tilt.add(l);
  };
  // bangs fanning over the forehead
  for (const [x, rz, len] of [[-0.11, 0.55, 0.1], [-0.055, 0.25, 0.085], [0, -0.05, 0.08], [0.055, -0.28, 0.085], [0.11, -0.55, 0.1]]) {
    hairLock(x, 0.315, 0.11 - Math.abs(x) * 0.25, len, -0.8, rz, 0.05);
  }
  // sides sweeping down past the ears, and spikes sticking out the back
  for (const s of [-1, 1]) {
    hairLock(s * 0.15, 0.27, 0.03, 0.15, -0.15, s * 0.25, 0.02, s * 0.03);
    hairLock(s * 0.13, 0.25, -0.08, 0.15, -0.2, s * 0.55, -0.02, s * 0.04);
    hairLock(s * 0.07, 0.24, -0.15, 0.16, -2.5, s * -0.5, 0.03);
  }
  hairLock(0, 0.26, -0.16, 0.17, -2.35, 0, 0.03);
  // pointed cap, bent back, with a floppy tip and a feather
  const hat = new THREE.Group();
  hat.position.set(0, 0.268, -0.045);
  hat.rotation.x = -0.6;
  tilt.add(hat);
  const hatMat = lam(0x54ba40);
  const bend = (k) => (v) => { v.z -= v.y * v.y * k; };
  hat.add(mesh(deform(lathe([[0.178, 0], [0.174, 0.035], [0.145, 0.09], [0.105, 0.14], [0.068, 0.17]], 8), bend(1.4)), hatMat));
  hat.add(mesh(lathe([[0.17, -0.012], [0.19, 0], [0.19, 0.025], [0.172, 0.035]], 8), darkGreen));
  const hatTip = new THREE.Group();
  hatTip.position.set(0, 0.165, -0.04);
  hatTip.rotation.x = -0.9;
  hatTip.add(mesh(deform(lathe([[0.069, 0], [0.052, 0.06], [0.03, 0.12], [0.004, 0.19]], 6), bend(2.6)), hatMat));
  hat.add(hatTip);
  const plume = new THREE.Group();
  plume.position.set(0.16, 0.05, 0);
  plume.rotation.set(-0.35, 0, -0.45);
  const featherMat = lam(0xffffff, { map: tex.feather(), alphaTest: 0.4, side: THREE.DoubleSide });
  for (const ry of [Math.PI / 4, -Math.PI / 4]) {
    const f = mesh(new THREE.PlaneGeometry(0.12, 0.27), featherMat, 0, 0.13, 0);
    f.rotation.y = ry;
    f.userData.noAO = true;
    plume.add(f);
  }
  hat.add(plume);

  const hold = new THREE.Group();
  hold.position.set(0, 1.28, 0.04);
  root.add(hold);
  const shadow = blobShadow(0.75);
  root.add(shadow);
  bakeAO(root, 0, 1.15);
  root.scale.setScalar(1.22);

  const face = blinker(faceMat, heroFace, 'grin', ['sleep', 'ko', 'zap']);
  return {
    root, body, head, hat, hatTip, legs, arms, sword, hold, shadow, faceMat, skull,
    setFace: face.setFace, tick: face.tick,
  };
}

// ---------------------------------------------------------------- merchant

export function buildMerchant() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shirt = lam(0xf2e8d0);
  const skin = lam(0xe8ac80);
  const tache = lam(0x4a2a14);
  // a round, well-fed belly: vest, shirt and sash painted on one lathe
  body.add(mesh(lathe([[0.001, 0.04], [0.3, 0.07], [0.45, 0.27], [0.5, 0.5], [0.46, 0.74], [0.34, 0.88], [0.17, 0.96], [0.001, 0.98]], 9), lam(0xffffff, { map: tex.merchantBody() })));
  body.add(mesh(new THREE.CylinderGeometry(0.52, 0.48, 0.42, 9, 1, true, -0.85, 1.7), lam(0xffffff, { map: tex.apron(), side: THREE.DoubleSide }), 0, 0.3, 0));

  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.42, 0.73, 0);
    pivot.add(mesh(blob(0.105, 1, 1, 1, 7, 5), shirt));
    pivot.add(mesh(new THREE.CylinderGeometry(0.092, 0.08, 0.2, 7), shirt, 0, -0.11, 0));
    pivot.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 7), lam(0xd8caa8), 0, -0.225, 0));
    pivot.add(mesh(new THREE.CylinderGeometry(0.07, 0.064, 0.13, 7), skin, 0, -0.31, 0));
    pivot.add(mesh(blob(1, 0.085, 0.095, 0.06), skin, 0, -0.41, 0.01));
    const thumb = mesh(blob(1, 0.028, 0.045, 0.028, 5, 4), skin, -s * 0.07, -0.39, 0.03);
    thumb.rotation.z = s * 0.5;
    pivot.add(thumb);
    pivot.rotation.z = s * 0.32;
    body.add(pivot);
    arms.push(pivot);
  }

  // a huge head with jowls, a bulbous nose and a magnificent mustache
  const head = new THREE.Group();
  head.position.set(0, 0.88, 0);
  body.add(head);
  const faceMat = lam(0xffffff, { map: merchantFace('idle') });
  const R = 0.245;
  head.add(mesh(deform(new THREE.SphereGeometry(R, 12, 10), (v) => {
    if (v.z > 0) v.z *= 0.9;
    if (v.y < 0) { const t = -v.y / R; v.x *= 1 + t * 0.22; v.z *= 1 + t * 0.08; }
    if (v.y > R * 0.5) v.x *= 0.96;
  }), faceMat, 0, 0.22, 0));
  const nose = mesh(blob(0.078, 1.1, 0.95, 1, 8, 6), lam(0xf09a80), 0, 0.185, 0.215);
  head.add(nose);
  head.add(mesh(tube([[-0.2, 0.22, 0.1], [-0.16, 0.15, 0.16], [-0.08, 0.115, 0.215], [0, 0.12, 0.23], [0.08, 0.115, 0.215], [0.16, 0.15, 0.16], [0.2, 0.22, 0.1]], 0.034, 16, 5), tache));
  const bulk = mesh(blob(0.055, 1.8, 0.7, 0.8, 7, 5), tache, 0, 0.12, 0.21);
  head.add(bulk);
  for (const s of [-1, 1]) {
    head.add(mesh(blob(0.035, 1, 1, 1, 6, 5), tache, s * 0.2, 0.23, 0.1));
    const brow = mesh(lock(0.12, 0.04, 0.026, 0.0, 0.02), tache, s * 0.035, 0.32, 0.185);
    brow.rotation.set(-0.3, 0, s * -1.75);
    head.add(brow);
    const ear = mesh(blob(1, 0.032, 0.07, 0.05, 6, 5), skin, s * 0.245, 0.21, -0.01);
    head.add(ear);
    for (const [y, z, rz] of [[0.32, -0.02, 0.5], [0.27, -0.1, 0.7]]) {
      const tuft = mesh(lock(0.09, 0.04, 0.025, 0.0, s * 0.03), lam(0x6a5444), s * 0.22, y, z);
      tuft.rotation.z = s * rz;
      head.add(tuft);
    }
  }
  const fez = new THREE.Group();
  fez.position.set(0, 0.405, -0.02);
  fez.rotation.x = -0.14;
  fez.add(mesh(lathe([[0.14, 0], [0.146, 0.03], [0.122, 0.19], [0.001, 0.195]], 8), lam(0xc0282a)));
  fez.add(mesh(tube([[0, 0.195, 0], [0.04, 0.2, 0], [0.09, 0.16, 0.01], [0.115, 0.09, 0.02]], 0.009, 8, 4), lam(0x1a1a1a)));
  fez.add(mesh(new THREE.ConeGeometry(0.027, 0.075, 5), lam(0x1a1a1a), 0.117, 0.055, 0.02));
  head.add(fez);
  bakeAO(root, 0, 1.55);
  root.scale.setScalar(1.08);

  const face = blinker(faceMat, merchantFace, 'idle', ['cry', 'happy']);
  return { root, body, head, arms, faceMat, setFace: face.setFace, tick: face.tick };
}

// ---------------------------------------------------------------- snapper plant

export function buildPlant() {
  const root = new THREE.Group();
  const potBase = potGeometry(RECIPES.snapper.profile, POT_SCALE * 0.9, 10, 6);
  const pot = new THREE.Mesh(potBase, lam(0xffffff, { map: potTexture(RECIPES.snapper), vertexColors: true, side: THREE.DoubleSide }));
  pot.scale.y = 0.45;
  pot.userData.noAO = true;
  root.add(pot);
  root.add(mesh(new THREE.CircleGeometry(0.2, 10), lam(0x4a2e18), 0, 0.2, 0).rotateX(-Math.PI / 2));
  const neck = new THREE.Group();
  neck.position.y = 0.2;
  root.add(neck);
  neck.add(mesh(tube([[0, 0, 0], [0.035, 0.12, 0.02], [-0.025, 0.26, 0.01], [0, 0.42, 0.03]], 0.04, 10, 6), lam(0xffffff, { map: tex.stem() })));
  const leafMat = lam(0xffffff, { map: tex.leaf(), side: THREE.DoubleSide });
  for (const [a, tilt] of [[0.4, 1.2], [2.6, 1.0], [4.4, 1.3]]) {
    const leaf = mesh(leafGeometry(0.32, 0.11), leafMat, 0, 0.02, 0);
    leaf.rotation.set(tilt, a, 0, 'YXZ');
    neck.add(leaf);
  }
  const headG = new THREE.Group();
  headG.position.set(0, 0.44, 0.03);
  neck.add(headG);
  const red = lam(0xffffff, { map: tex.plantHead() });
  const inside = lam(0x7a1020, { side: THREE.DoubleSide });
  const lipMat = lam(0xe8f0a0);
  const toothMat = lam(0xfffbe8);
  const jaw = (top) => {
    const g = new THREE.Group();
    const r = top ? 0.18 : 0.16;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 10, 5, 0, Math.PI * 2, top ? 0 : Math.PI / 2, Math.PI / 2), red));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.97, 10), inside);
    disc.rotation.x = top ? Math.PI / 2 : -Math.PI / 2;
    g.add(disc);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, 0.024, 5, 10), lipMat);
    lip.rotation.x = Math.PI / 2;
    g.add(lip);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + (top ? 0 : 0.4);
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.065, 4), toothMat);
      t.position.set(Math.sin(a) * r * 0.8, top ? -0.026 : 0.026, Math.cos(a) * r * 0.8);
      if (top) t.rotation.x = Math.PI;
      g.add(t);
    }
    // hinge at the back of the head
    g.children.forEach((c) => (c.position.z += 0.13));
    g.position.z = -0.13;
    return g;
  };
  const upper = jaw(true);
  const lower = jaw(false);
  headG.add(upper, lower);
  // beady eyes on top so it looks back at you
  for (const s of [-1, 1]) {
    const eye = mesh(blob(0.035, 1, 1, 1, 6, 5), lam(0xfffbe8), s * 0.07, 0.15, 0.04);
    eye.add(mesh(blob(0.016, 1, 1, 1, 5, 4), lam(0x101010), 0, 0.01, 0.025));
    upper.children[0].add(eye);
  }
  root.add(blobShadow(0.55));
  bakeAO(root, 0.15, 0.95);
  return { root, neck, head: headG, upper, lower };
}

// ---------------------------------------------------------------- critters & pickups

export function buildBee() {
  const g = new THREE.Group();
  const b = mesh(new THREE.SphereGeometry(0.05, 8, 6), lam(0xffc21a));
  b.scale.z = 1.4;
  g.add(b);
  for (const z of [-0.015, 0.025]) {
    const stripe = mesh(new THREE.CylinderGeometry(0.051, 0.051, 0.015, 8), lam(0x1a1208), 0, 0, z);
    stripe.rotation.x = Math.PI / 2;
    g.add(stripe);
  }
  const wingMat = new THREE.MeshBasicMaterial({ color: 0xeef8ff, transparent: true, opacity: 0.65, side: THREE.DoubleSide });
  const w1 = mesh(new THREE.CircleGeometry(0.045, 8), wingMat, 0.04, 0.045, 0);
  w1.rotation.x = -Math.PI / 2;
  const w2 = w1.clone();
  w2.position.x = -0.04;
  g.add(w1, w2);
  g.userData.wings = [w1, w2];
  return g;
}

let heartGeo = null;
export function heartGeometry() {
  if (heartGeo) return heartGeo;
  const s = new THREE.Shape();
  s.moveTo(0, -0.12);
  s.bezierCurveTo(-0.02, -0.08, -0.14, -0.02, -0.14, 0.05);
  s.bezierCurveTo(-0.14, 0.12, -0.04, 0.14, 0, 0.07);
  s.bezierCurveTo(0.04, 0.14, 0.14, 0.12, 0.14, 0.05);
  s.bezierCurveTo(0.14, -0.02, 0.02, -0.08, 0, -0.12);
  heartGeo = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 2, curveSegments: 6 });
  heartGeo.translate(0, 0, -0.02);
  return heartGeo;
}

export function buildHeart() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(heartGeometry(), new THREE.MeshPhongMaterial({ color: 0xff3048, emissive: 0x401018, shininess: 60 })));
  g.add(blobShadow(0.3));
  return g;
}

export function buildCoin() {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12), new THREE.MeshPhongMaterial({ color: 0xffcc33, emissive: 0x403000, shininess: 80 }));
  c.rotation.x = Math.PI / 2;
  const g = new THREE.Group();
  g.add(c);
  return g;
}

export function buildClayLump() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(deform(new THREE.SphereGeometry(0.15, 10, 8), (v) => {
    const k = 1 + Math.sin(v.x * 40) * 0.08 + Math.cos(v.z * 35) * 0.08;
    v.multiplyScalar(k);
    v.y *= 0.65;
  }), lam(0xd07a42, { emissive: 0x4a2008 }));
  g.add(m);
  const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.star(), color: 0xffe0b0, transparent: true, depthWrite: false }));
  spark.scale.setScalar(0.22);
  spark.position.set(0.1, 0.3, 0);
  g.add(spark);
  g.add(blobShadow(0.42));
  g.userData.lump = m;
  g.userData.spark = spark;
  return g;
}

// ---------------------------------------------------------------- furniture

function bottle(color, x, y, z, kind) {
  const glass = new THREE.MeshPhongMaterial({ color, shininess: 70, specular: 0x666666 });
  const shapes = [
    [[0.05, 0], [0.06, 0.03], [0.06, 0.12], [0.03, 0.16], [0.02, 0.2], [0.025, 0.21]],
    [[0.07, 0], [0.085, 0.05], [0.08, 0.11], [0.05, 0.14], [0.055, 0.155]],
    [[0.04, 0], [0.045, 0.14], [0.02, 0.17], [0.02, 0.22]],
  ];
  const m = mesh(lathe(shapes[kind % 3], 10), glass, x, y, z);
  if (kind % 3 === 1) m.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10), lam(0x8a6a4a), 0, 0.16, 0));
  else m.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 6), lam(0x9a7a50), 0, kind % 3 === 0 ? 0.225 : 0.235, 0));
  return m;
}

export function buildShelf() {
  const g = new THREE.Group();
  const wood = lam(0xffffff, { map: tex.darkWood() });
  const trim = lam(0xffffff, { map: tex.lightWood() });
  g.add(mesh(new THREE.BoxGeometry(0.9, 1.6, 0.05), wood, 0, 0.8, -0.38));
  for (const x of [-0.43, 0.43]) g.add(mesh(new THREE.BoxGeometry(0.06, 1.66, 0.42), wood, x, 0.83, -0.2));
  g.add(mesh(new THREE.BoxGeometry(1.0, 0.08, 0.48), trim, 0, 1.68, -0.18));
  g.add(mesh(new THREE.BoxGeometry(0.92, 0.05, 0.44), trim, 0, 1.62, -0.18));
  g.add(mesh(new THREE.BoxGeometry(0.92, 0.1, 0.44), wood, 0, 0.05, -0.18));
  const colors = [0xd8603a, 0x3a7ad0, 0x6ab04a, 0xe0c04a, 0xa04ad0, 0xe07090, 0x40b0b0];
  for (let i = 0; i < 4; i++) {
    const y = 0.1 + i * 0.4;
    g.add(mesh(new THREE.BoxGeometry(0.86, 0.035, 0.4), trim, 0, y, -0.2));
    if (i === 3) continue;
    for (let k = 0; k < 3; k++) {
      g.add(bottle(colors[(i * 3 + k) % colors.length], -0.27 + k * 0.27, y + 0.02, -0.18, i + k));
    }
  }
  return g;
}

export function buildCounter(length) {
  const g = new THREE.Group();
  const wood = lam(0xffffff, { map: tex.lightWood() });
  const dark = lam(0xffffff, { map: tex.darkWood() });
  g.add(mesh(new THREE.BoxGeometry(0.8, 0.62, length), wood, 0, 0.31, 0));
  g.add(mesh(new THREE.BoxGeometry(0.84, 0.08, length + 0.04), dark, 0, 0.04, 0));
  g.add(mesh(new THREE.BoxGeometry(0.96, 0.07, length + 0.12), dark, 0, 0.655, 0));
  // recessed front panels facing the room (+x)
  const panels = Math.max(1, Math.round(length));
  for (let i = 0; i < panels; i++) {
    const z = -length / 2 + (i + 0.5) * (length / panels);
    g.add(mesh(new THREE.BoxGeometry(0.02, 0.36, length / panels - 0.18), dark, 0.405, 0.33, z));
  }
  // a till and a bell
  const till = mesh(new THREE.BoxGeometry(0.3, 0.2, 0.34), lam(0x9a7a4a), 0, 0.79, length * 0.25);
  till.add(mesh(new THREE.BoxGeometry(0.22, 0.08, 0.3), lam(0x6a5030), 0.04, 0.12, 0));
  g.add(till);
  const bell = mesh(lathe([[0.09, 0], [0.085, 0.02], [0.06, 0.06], [0.02, 0.09], [0.001, 0.095]], 12), new THREE.MeshPhongMaterial({ color: 0xe8c040, shininess: 90, specular: 0xffffff }), 0.1, 0.69, -length * 0.3);
  g.add(bell);
  return g;
}

export function buildBarrel() {
  const g = new THREE.Group();
  const b = mesh(lathe([[0.25, 0], [0.29, 0.18], [0.31, 0.38], [0.29, 0.58], [0.25, 0.76]], 14), lam(0xffffff, { map: tex.barrel() }));
  g.add(b);
  const iron = new THREE.MeshPhongMaterial({ color: 0x5a5f66, shininess: 40 });
  for (const [y, r] of [[0.09, 0.275], [0.38, 0.312], [0.67, 0.275]]) {
    const band = mesh(new THREE.TorusGeometry(r, 0.014, 4, 18), iron, 0, y, 0);
    band.rotation.x = Math.PI / 2;
    g.add(band);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.02, 14), lam(0x5a3416), 0, 0.73, 0));
  for (let i = 0; i < 6; i++) {
    const apple = mesh(new THREE.SphereGeometry(0.07, 8, 6), lam(i % 2 ? 0xd8342a : 0x9ac83a), Math.cos(i * 1.3) * 0.13, 0.78 + (i % 3) * 0.02, Math.sin(i * 1.3) * 0.13);
    apple.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.04, 4), lam(0x4a2a10), 0, 0.07, 0));
    g.add(apple);
  }
  g.add(blobShadow(0.9));
  return g;
}

export function buildCrate() {
  const g = new THREE.Group();
  const m = lam(0xffffff, { map: tex.crate() });
  const crate = (s, x, y, z, ry) => {
    const c = mesh(new THREE.BoxGeometry(s, s * 0.88, s), m, x, y + s * 0.44, z);
    c.rotation.y = ry;
    g.add(c);
  };
  crate(0.8, 0, 0, 0, 0);
  crate(0.46, 0.08, 0.7, -0.05, 0.4);
  g.add(blobShadow(1.1));
  return g;
}

export function buildPillar() {
  const g = new THREE.Group();
  const st = lam(0xffffff, { map: tex.stone() });
  g.add(mesh(lathe([[0.4, 0], [0.4, 0.12], [0.34, 0.16], [0.31, 0.24], [0.28, 2.25], [0.32, 2.33], [0.38, 2.4], [0.38, 2.6], [0.001, 2.6]], 12), st));
  g.add(blobShadow(1.2));
  return g;
}

export function buildTable() {
  const g = new THREE.Group();
  const w = lam(0xffffff, { map: tex.lightWood() });
  g.add(mesh(new THREE.BoxGeometry(0.88, 0.06, 0.88), w, 0, 0.5, 0));
  const legGeo = lathe([[0.04, 0], [0.05, 0.05], [0.03, 0.12], [0.045, 0.24], [0.03, 0.38], [0.04, 0.47]], 8);
  for (const [x, z] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]]) g.add(mesh(legGeo, w, x, 0, z));
  g.add(mesh(new THREE.BoxGeometry(0.72, 0.012, 0.72), lam(0x2e5a9a), 0, 0.535, 0));
  g.add(bottle(0xe8b04a, -0.15, 0.54, 0.1, 1));
  g.add(mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshPhongMaterial({ color: 0x7ad0e0, emissive: 0x103040, shininess: 90 }), 0.15, 0.64, -0.1));
  g.add(blobShadow(1.1));
  return g;
}

export function buildLantern() {
  const g = new THREE.Group();
  const iron = lam(0x2e2620);
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.3), iron, 0, 0.12, -0.15));
  g.add(mesh(lathe([[0.1, 0], [0.12, 0.02], [0.001, 0.12]], 8), iron, 0, 0.04, 0));
  g.add(mesh(lathe([[0.06, -0.2], [0.09, -0.16], [0.09, -0.04], [0.07, 0]], 8), new THREE.MeshBasicMaterial({ color: 0xffd27a }), 0, 0.04, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.03, 8), iron, 0, -0.17, 0));
  return g;
}
