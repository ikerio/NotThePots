import * as THREE from 'three';
import { tex } from '../render/textures.js';
import {
  lam, buildMerchant, buildShelf, buildCounter, buildBarrel, buildCrate, buildPillar, buildTable, buildLantern,
} from '../models/models.js';
import { COLS, ROWS } from './levels.js';
import { cellX, cellZ } from './grid.js';

const WALL_H = 2.6;

function tiled(t, rx, ry) {
  const c = t.clone();
  c.repeat.set(rx, ry);
  c.needsUpdate = true;
  return c;
}

function plane(w, h, mat, sx = 1, sy = 1) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h, sx, sy), mat);
}

// Bake lighting into vertex colors the way N64 levels were lit: contact
// shadows where surfaces meet, warm pools around lamps, window light.
function bake(meshes, light) {
  const v = new THREE.Vector3();
  for (const m of meshes) {
    m.updateMatrix();
    const p = m.geometry.attributes.position;
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrix);
      const [r, g, b] = light(v);
      c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b;
    }
    m.geometry.setAttribute('color', new THREE.BufferAttribute(c, 3));
    m.material.vertexColors = true;
    m.material.needsUpdate = true;
  }
}

// Builds the cozy shop interior for a layout. The front two walls are cut away
// so the isometric camera can look in, like a diorama.
export function buildShop(layout) {
  const g = new THREE.Group();
  const W = COLS, D = ROWS;
  const x0 = -W / 2, z0 = -D / 2;

  // floor + a darker plinth so the cutaway edge reads as solid
  const baked = [];
  const floor = plane(W, D, lam(0xffffff, { map: tiled(tex.floor(), W / 2, D / 2) }), W * 3, D * 3);
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  baked.push(floor);
  const plinthMat = lam(0xffffff, { map: tiled(tex.stone(), 6, 0.5) });
  const plinthF = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.5, 0.3), plinthMat);
  plinthF.position.set(0.15, -0.25, D / 2 + 0.15);
  const plinthR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, D + 0.3), plinthMat);
  plinthR.position.set(W / 2 + 0.15, -0.25, 0.15);
  g.add(plinthF, plinthR);

  // rugs
  const rugCells = [];
  layout.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === 'r') rugCells.push({ c, r }); }));
  if (rugCells.length) {
    const minC = Math.min(...rugCells.map((k) => k.c)), maxC = Math.max(...rugCells.map((k) => k.c));
    const minR = Math.min(...rugCells.map((k) => k.r)), maxR = Math.max(...rugCells.map((k) => k.r));
    const rug = plane(maxC - minC + 0.9, maxR - minR + 0.9, lam(0xffffff, { map: tex.rug() }), 8, 8);
    baked.push(rug);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set((cellX(minC) + cellX(maxC)) / 2, 0.006, (cellZ(minR) + cellZ(maxR)) / 2);
    g.add(rug);
  }

  // walls
  const wallMat = (len) => lam(0xffffff, { map: tiled(tex.wall(), len / 1.6, (WALL_H - 0.8) / 1.6) });
  const wainMat = (len) => lam(0xffffff, { map: tiled(tex.wainscot(), len / 1.5, 1) });
  const capMat = lam(0xffffff, { map: tex.darkWood() });
  const doorC = layout[0].indexOf('D');
  const doorX = cellX(doorC);

  function backWallSegment(xa, xb) {
    const len = xb - xa;
    if (len <= 0.01) return;
    const cx = (xa + xb) / 2;
    const up = plane(len, WALL_H - 0.8, wallMat(len), Math.ceil(len * 3), 8);
    up.position.set(cx, 0.8 + (WALL_H - 0.8) / 2, z0);
    const low = plane(len, 0.8, wainMat(len), Math.ceil(len * 3), 4);
    low.position.set(cx, 0.4, z0 + 0.002);
    baked.push(up, low);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.3), capMat);
    cap.position.set(cx, WALL_H + 0.06, z0 - 0.1);
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, WALL_H, 0.2), lam(0x3a2414));
    back.position.set(cx, WALL_H / 2, z0 - 0.11);
    g.add(up, low, cap, back);
  }
  backWallSegment(x0 - 0.2, doorX - 0.55);
  backWallSegment(doorX + 0.55, W / 2);
  // wall above the door
  const lintel = plane(1.1, WALL_H - 1.7, wallMat(1.1), 4, 4);
  baked.push(lintel);
  lintel.position.set(doorX, 1.7 + (WALL_H - 1.7) / 2, z0);
  const lintelBack = new THREE.Mesh(new THREE.BoxGeometry(1.1, WALL_H - 1.7, 0.2), lam(0x3a2414));
  lintelBack.position.set(doorX, 1.7 + (WALL_H - 1.7) / 2, z0 - 0.11);
  const lintelCap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.3), capMat);
  lintelCap.position.set(doorX, WALL_H + 0.06, z0 - 0.1);
  g.add(lintel, lintelBack, lintelCap);
  // stone door frame
  const stoneMat = lam(0xffffff, { map: tex.stone() });
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.8, 0.3), stoneMat);
    post.position.set(doorX + s * 0.58, 0.9, z0 + 0.02);
    g.add(post);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.16, 0.3), stoneMat);
  head.position.set(doorX, 1.78, z0 + 0.02);
  g.add(head);
  // bright outdoors through the doorway
  const outside = plane(1.4, 2.2, new THREE.MeshBasicMaterial({ map: tex.doorway() }));
  outside.position.set(doorX, 1.0, z0 - 0.6);
  g.add(outside);
  // the door, hinged on its left edge
  const doorPivot = new THREE.Group();
  doorPivot.position.set(doorX - 0.5, 0, z0 - 0.02);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.7, 0.08), lam(0xffffff, { map: tex.door() }));
  door.position.set(0.5, 0.85, 0);
  doorPivot.add(door);
  g.add(doorPivot);
  // a warm patch of daylight spilling in from the door
  const spill = plane(1.8, 3.0, new THREE.MeshBasicMaterial({ map: tex.lightSpill(), color: 0xffe8b0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(doorX, 0.01, z0 + 1.5);
  g.add(spill);

  // left wall
  const leftLen = D;
  const lup = plane(leftLen, WALL_H - 0.8, wallMat(leftLen), leftLen * 3, 8);
  lup.rotation.y = Math.PI / 2;
  lup.position.set(x0, 0.8 + (WALL_H - 0.8) / 2, 0);
  const llow = plane(leftLen, 0.8, wainMat(leftLen), leftLen * 3, 4);
  baked.push(lup, llow);
  llow.rotation.y = Math.PI / 2;
  llow.position.set(x0 + 0.002, 0.4, 0);
  const lcap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, leftLen + 0.4), capMat);
  lcap.position.set(x0 - 0.1, WALL_H + 0.06, -0.2);
  const lback = new THREE.Mesh(new THREE.BoxGeometry(0.2, WALL_H, leftLen + 0.4), lam(0x3a2414));
  lback.position.set(x0 - 0.11, WALL_H / 2, -0.2);
  g.add(lup, llow, lcap, lback);

  // windows on the left wall with soft light shafts
  const shafts = [];
  for (const wz of [1.3, 3.3]) {
    const win = plane(0.7, 1.0, new THREE.MeshBasicMaterial({ map: tex.window() }));
    win.rotation.y = Math.PI / 2;
    win.position.set(x0 + 0.01, 1.6, wz);
    g.add(win);
    const shaft = plane(0.8, 3.2, new THREE.MeshBasicMaterial({ map: tex.lightSpill(), color: 0xfff0c8, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    shaft.position.set(x0 + 1.1, 0.8, wz + 0.2);
    shaft.rotation.set(0, Math.PI / 2, 0);
    shaft.rotateX(-0.9);
    g.add(shaft);
    shafts.push(shaft);
  }

  // timber framing: posts, a chair rail and a beam along each wall
  const timber = lam(0xffffff, { map: tex.darkWood() });
  const post = (x, z, rotY) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, WALL_H, 0.1), timber);
    m.position.set(x, WALL_H / 2, z);
    m.rotation.y = rotY;
    g.add(m);
  };
  post(x0 + 0.06, z0 + 0.06, 0);
  for (const x of [x0 + 3.2, W / 2 - 0.3]) if (Math.abs(x - doorX) > 0.9 && Math.abs(x - doorX - 2.2) > 0.8) post(x, z0 + 0.05, 0);
  for (const z of [z0 + 3.4, D / 2 - 0.4]) post(x0 + 0.05, z, Math.PI / 2);
  for (const [len, x, z, ry] of [[W, 0, z0 + 0.04, 0], [D, x0 + 0.04, 0, Math.PI / 2]]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.06), timber);
    rail.position.set(x, 0.81, z);
    rail.rotation.y = ry;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(len, 0.16, 0.14), timber);
    beam.position.set(x, WALL_H - 0.08, z);
    beam.rotation.y = ry;
    g.add(rail, beam);
  }

  // signs
  const sign1 = plane(1.6, 0.4, lam(0xffffff, { map: tex.sign("MORTIMER'S POTS") }));
  sign1.rotation.y = Math.PI / 2;
  sign1.position.set(x0 + 0.02, 2.2, -1.5);
  const sign2 = plane(1.4, 0.36, lam(0xffffff, { map: tex.sign('NO SMASHING!', '#7a1a12', '#fff2d0') }));
  sign2.position.set(doorX + 2.2, 1.9, z0 + 0.02);
  g.add(sign1, sign2);

  // wall lanterns with warm point lights
  const lights = [];
  for (const [lx, lz, rot] of [[doorX - 1.6, z0 + 0.25, 0], [x0 + 0.25, 2.3, Math.PI / 2], [doorX + 3.4, z0 + 0.25, 0]]) {
    const l = buildLantern();
    l.position.set(lx, 1.85, lz);
    l.rotation.y = rot;
    g.add(l);
    const pl = new THREE.PointLight(0xffa24a, 6, 6, 1.4);
    pl.position.set(lx + (rot ? 0.3 : 0), 1.7, lz + (rot ? 0 : 0.3));
    g.add(pl);
    lights.push(pl);
  }

  // furniture from the layout
  let merchant = null;
  const mCells = [], cCells = [];
  layout.forEach((row, r) => [...row].forEach((ch, c) => {
    const x = cellX(c), z = cellZ(r);
    let o = null;
    if (ch === 'S') {
      o = buildShelf();
      if (c === 0 && r > 0) o.rotation.y = Math.PI / 2;
    } else if (ch === 'B') o = buildBarrel();
    else if (ch === 'X') o = buildCrate();
    else if (ch === 'P') o = buildPillar();
    else if (ch === 'T') o = buildTable();
    else if (ch === 'M') mCells.push({ c, r });
    else if (ch === 'C') cCells.push({ c, r });
    if (o) {
      o.position.set(x, 0, z);
      if (ch === 'B' || ch === 'X') o.rotation.y = ((c * 7 + r * 3) % 5) * 0.3;
      g.add(o);
    }
  }));
  if (cCells.length) {
    const zs = cCells.map((k) => cellZ(k.r));
    const counter = buildCounter(cCells.length);
    counter.position.set(cellX(cCells[0].c), 0, (Math.min(...zs) + Math.max(...zs)) / 2);
    g.add(counter);
  }
  if (mCells.length) {
    merchant = buildMerchant();
    const zs = mCells.map((k) => cellZ(k.r));
    merchant.root.position.set(cellX(mCells[0].c), 0, (Math.min(...zs) + Math.max(...zs)) / 2);
    merchant.root.rotation.y = Math.PI / 2;
    g.add(merchant.root);
  }

  const lamps = [[doorX - 1.6, 1.8, z0 + 0.3], [x0 + 0.3, 1.8, 2.3], [doorX + 3.4, 1.8, z0 + 0.3]];
  const pools = [[x0 + 1.9, 0, 1.6], [x0 + 1.9, 0, 3.6]];
  bake(baked, (v) => {
    const dBack = Math.max(0, v.z - z0), dLeft = Math.max(0, v.x - x0);
    let k = 1;
    if (v.y < 0.05) {
      k -= 0.42 * Math.exp(-dBack / 0.5) + 0.42 * Math.exp(-dLeft / 0.5);
      k -= 0.18 * Math.exp(-(W / 2 - v.x) / 0.9) + 0.18 * Math.exp(-(D / 2 - v.z) / 0.9);
    } else {
      k -= 0.38 * Math.exp(-v.y / 0.3);
      k -= 0.3 * Math.exp(-Math.min(dBack, dLeft) / 0.45);
      k -= 0.3 * Math.max(0, (v.y - 1.6) / 1.0);
    }
    let warm = 0;
    for (const [lx, ly, lz] of lamps) warm += Math.exp(-((v.x - lx) ** 2 + ((v.y - ly) * 1.4) ** 2 + (v.z - lz) ** 2) / 1.6);
    let day = 0;
    for (const [px, , pz] of pools) if (v.y < 0.05) day += Math.exp(-((v.x - px) ** 2 + (v.z - pz) ** 2) / 0.7);
    k = Math.max(0.3, k);
    return [k + warm * 0.5 + day * 0.28, k + warm * 0.32 + day * 0.26, k + warm * 0.12 + day * 0.2];
  });

  // lighting: warm interior, a cool fill from the windows
  const hemi = new THREE.HemisphereLight(0xffe8c8, 0x5a3a24, 1.5);
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.6);
  sun.position.set(-6, 8, 3);
  const fill = new THREE.DirectionalLight(0x9ab8ff, 0.4);
  fill.position.set(6, 4, 8);
  g.add(hemi, sun, fill);

  return { group: g, merchant, doorPivot, spill, lights, hemi, sun, shafts, doorX };
}

export function isoCamera() {
  const cam = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 120);
  const dir = new THREE.Vector3(1, 1.12, 1).normalize();
  cam.userData.dir = dir;
  cam.userData.target = new THREE.Vector3(0.4, 0.2, 0.6);
  cam.userData.zoom = 1;
  placeIso(cam);
  return cam;
}

export function placeIso(cam, shake = null) {
  const t = cam.userData.target;
  cam.position.copy(t).addScaledVector(cam.userData.dir, 40);
  if (shake) cam.position.add(shake);
  cam.lookAt(t.x + (shake ? shake.x : 0), t.y + (shake ? shake.y : 0), t.z + (shake ? shake.z : 0));
}

export function fitIso(cam, aspect) {
  // fit the diorama: roughly 15.5 units wide, 10.5 tall on screen
  const halfH = Math.max(5.6, 15.8 / 2 / aspect) / cam.userData.zoom;
  cam.top = halfH;
  cam.bottom = -halfH;
  cam.left = -halfH * aspect;
  cam.right = halfH * aspect;
  cam.updateProjectionMatrix();
}
