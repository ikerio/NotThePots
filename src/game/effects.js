import * as THREE from 'three';
import { tex } from '../render/textures.js';
import { lam } from '../models/models.js';

const shardGeo = new THREE.TetrahedronGeometry(0.06);
const sparkGeo = new THREE.BoxGeometry(0.03, 0.03, 0.03);
const ballGeo = new THREE.IcosahedronGeometry(1, 1);
const ringGeo = new THREE.RingGeometry(0.8, 1, 16);

// Simple particle bag: every particle is a mesh or sprite with velocity,
// gravity, floor bounce and fade.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.bolts = [];
  }

  add(obj, o) {
    this.scene.add(obj);
    this.parts.push({
      obj, vel: o.vel || new THREE.Vector3(), life: o.life || 1, max: o.life || 1,
      grav: o.grav ?? 9, bounce: o.bounce ?? 0.35, spin: o.spin || null,
      fade: o.fade ?? true, grow: o.grow || 0, drag: o.drag || 0, floor: o.floor ?? 0.02,
      base: obj.scale.x,
    });
  }

  shards(pos, color, count = 10, power = 1) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(shardGeo, lam(color, { flatShading: true, transparent: true }));
      m.position.copy(pos);
      m.scale.setScalar(0.6 + Math.random() * 1.2);
      const a = Math.random() * Math.PI * 2;
      const s = (1.2 + Math.random() * 2.2) * power;
      this.add(m, {
        vel: new THREE.Vector3(Math.cos(a) * s, 2 + Math.random() * 3 * power, Math.sin(a) * s),
        life: 1.2 + Math.random() * 0.6,
        spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, 0),
      });
    }
  }

  sparks(pos, color = 0xffe070, count = 12, speed = 3) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.copy(pos);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      this.add(m, { vel: v, life: 0.4 + Math.random() * 0.4, grav: 6, bounce: 0.2 });
    }
  }

  puffs(pos, color = 0xffffff, count = 6, size = 0.6, life = 0.9, rise = 0.8, spread = 0.4) {
    for (let i = 0; i < count; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.puff(), color, transparent: true, depthWrite: false }));
      sp.position.set(pos.x + (Math.random() - 0.5) * spread, pos.y + Math.random() * 0.2, pos.z + (Math.random() - 0.5) * spread);
      sp.scale.setScalar(size * (0.6 + Math.random() * 0.6));
      this.add(sp, {
        vel: new THREE.Vector3((Math.random() - 0.5) * spread * 2, rise * (0.5 + Math.random()), (Math.random() - 0.5) * spread * 2),
        life: life * (0.7 + Math.random() * 0.6), grav: 0, grow: 1.2, drag: 2, floor: -10,
      });
    }
  }

  stars(pos, count = 6) {
    for (let i = 0; i < count; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.star(), transparent: true, depthWrite: false }));
      sp.position.copy(pos);
      sp.scale.setScalar(0.25);
      const a = (i / count) * Math.PI * 2;
      this.add(sp, { vel: new THREE.Vector3(Math.cos(a) * 2, 2.5, Math.sin(a) * 2), life: 0.7, grav: 6, floor: -10 });
    }
  }

  ring(pos, color, radius, life = 0.5) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.05, pos.z);
    m.scale.setScalar(0.1);
    this.add(m, { life, grav: 0, floor: -10, grow: radius / life });
  }

  explosion(pos, radius) {
    const ball = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true }));
    ball.position.copy(pos);
    ball.scale.setScalar(0.2);
    this.add(ball, { life: 0.35, grav: 0, floor: -10, grow: radius * 2.6 });
    const core = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true }));
    core.position.copy(pos);
    core.scale.setScalar(0.1);
    this.add(core, { life: 0.2, grav: 0, floor: -10, grow: radius * 3 });
    this.puffs(pos, 0x5a4a40, 10, 0.9, 1.2, 1.4, radius);
    this.puffs(pos, 0xff8a30, 6, 0.7, 0.5, 1.0, radius * 0.6);
    this.sparks(pos, 0xffd060, 20, 5);
    this.ring(pos, 0xffc060, radius, 0.4);
  }

  bolt(from, to, color = 0xfff27a, life = 0.35) {
    const pts = [];
    const seg = 7;
    for (let i = 0; i <= seg; i++) pts.push(new THREE.Vector3());
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true }));
    this.scene.add(line);
    this.bolts.push({ line, from: from.clone(), to: to.clone(), life, max: life, t: 0 });
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      const o = p.obj;
      if (p.life <= 0) {
        this.scene.remove(o);
        o.material.dispose();
        this.parts.splice(i, 1);
        continue;
      }
      p.vel.y -= p.grav * dt;
      if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      o.position.addScaledVector(p.vel, dt);
      if (o.position.y < p.floor) {
        o.position.y = p.floor;
        p.vel.y = -p.vel.y * p.bounce;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
        if (p.spin) p.spin.multiplyScalar(0.5);
      }
      if (p.spin) { o.rotation.x += p.spin.x * dt; o.rotation.y += p.spin.y * dt; }
      if (p.grow) o.scale.setScalar(o.scale.x + p.grow * dt);
      if (p.fade) o.material.opacity = Math.min(1, (p.life / p.max) * 2);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      b.t += dt;
      if (b.life <= 0) {
        this.scene.remove(b.line);
        b.line.geometry.dispose();
        b.line.material.dispose();
        this.bolts.splice(i, 1);
        continue;
      }
      if (b.t > 0.04) {
        b.t = 0;
        const pos = b.line.geometry.attributes.position;
        for (let k = 0; k < pos.count; k++) {
          const f = k / (pos.count - 1);
          const j = k === 0 || k === pos.count - 1 ? 0 : 0.18;
          pos.setXYZ(k,
            b.from.x + (b.to.x - b.from.x) * f + (Math.random() - 0.5) * j,
            b.from.y + (b.to.y - b.from.y) * f + (Math.random() - 0.5) * j,
            b.from.z + (b.to.z - b.from.z) * f + (Math.random() - 0.5) * j);
        }
        pos.needsUpdate = true;
      }
      b.line.material.opacity = b.life / b.max;
    }
  }

  clear() {
    for (const p of this.parts) { this.scene.remove(p.obj); p.obj.material.dispose(); }
    for (const b of this.bolts) this.scene.remove(b.line);
    this.parts = [];
    this.bolts = [];
  }
}
