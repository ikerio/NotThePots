import * as THREE from 'three';
import gsap from 'gsap';
import { RECIPES, gradeOf } from '../game/recipes.js';
import { save } from '../game/save.js';
import { iconCanvas, HEART_SVG } from './icons.js';
import { sfx } from '../audio.js';

const tmp = new THREE.Vector3();

export class Hud {
  constructor(game) {
    this.game = game;
    const L = game.level;
    const root = (this.root = document.createElement('div'));
    root.className = 'hud';
    root.innerHTML = `
      <div class="hud-top">
        <div class="chip day-chip"><div class="day-num">DAY ${L.id}</div><div class="day-name">${L.name}</div></div>
        <div class="hero-bar">
          <div class="hero-name">PETEY <span>the "Hero"</span></div>
          <div class="hearts"></div>
        </div>
        <div class="top-right">
          <div class="chip clock"><div class="dial"></div><span class="time">--</span></div>
          <div class="chip stock"></div>
          <button class="chip icon-btn pause-btn" title="Pause (P)">II</button>
        </div>
      </div>
      <div class="banner"><div class="banner-main"></div><div class="banner-sub"></div></div>
      <div class="prep">
        <div class="prep-text"></div>
        <button class="btn btn-go open-btn" disabled>Open the Shop!</button>
      </div>
      <div class="tray">
        <div class="clay-chip"><div class="clay-lump"></div><div><div class="clay-num">0</div><div class="clay-label">CLAY</div></div></div>
        <div class="cards"></div>
      </div>
      <div class="tooltip"></div>
      <div class="bubbles"></div>
      <div class="floaters"></div>
      <div class="pause-menu hidden">
        <div class="panel">
          <h2>Paused</h2>
          <button class="btn resume">Resume</button>
          <button class="btn restart">Restart Day</button>
          <button class="btn quit">Back to Calendar</button>
        </div>
      </div>`;
    document.getElementById('ui').appendChild(root);
    this.$ = (s) => root.querySelector(s);
    this.hearts = this.$('.hearts');
    this.bubbles = new Map();
    this.cardEls = new Map();
    this.buildHearts();
    this.buildStock();
    this.buildCards();
    this.$('.open-btn').onclick = () => { sfx.click(); game.startWave(); };
    this.$('.pause-btn').onclick = () => game.app.togglePause();
    this.$('.resume').onclick = () => game.app.togglePause();
    this.$('.restart').onclick = () => game.app.restartLevel();
    this.$('.quit').onclick = () => game.app.toCalendar();
    gsap.from(this.$('.hud-top'), { y: -80, duration: 0.6, ease: 'back.out(1.6)' });
    gsap.from(this.$('.tray'), { y: 140, duration: 0.6, delay: 0.1, ease: 'back.out(1.6)' });
    this.setPrep();
  }

  destroy() {
    this.root.remove();
  }

  // ------------------------------------------------------------ hero hearts

  buildHearts() {
    const n = Math.ceil(this.game.hero.maxHp);
    this.hearts.innerHTML = '';
    this.heartEls = [];
    for (let i = 0; i < n; i++) {
      const h = document.createElement('div');
      h.className = 'heart';
      h.innerHTML = `<div class="heart-bg">${HEART_SVG}</div><div class="heart-fill">${HEART_SVG}</div>`;
      this.hearts.appendChild(h);
      this.heartEls.push(h);
    }
    this.lastHp = this.game.hero.hp;
    this.setHeroHP(this.game.hero.hp);
  }

  setHeroHP(hp) {
    this.heartEls.forEach((h, i) => {
      const f = Math.max(0, Math.min(1, hp - i));
      h.querySelector('.heart-fill').style.clipPath = `inset(0 ${100 - f * 100}% 0 0)`;
    });
    if (hp < this.lastHp) {
      const idx = Math.min(this.heartEls.length - 1, Math.floor(hp));
      const el = this.heartEls[idx];
      if (el) gsap.fromTo(el, { scale: 1.6, rotate: -15 }, { scale: 1, rotate: 0, duration: 0.4, ease: 'back.out(3)' });
      gsap.fromTo(this.hearts, { x: -6 }, { x: 0, duration: 0.3, ease: 'elastic.out(1, 0.3)' });
    } else if (hp > this.lastHp) {
      gsap.fromTo(this.hearts, { scale: 1.15 }, { scale: 1, duration: 0.3 });
    }
    this.lastHp = hp;
  }

  // ------------------------------------------------------------ merchandise

  buildStock() {
    const el = this.$('.stock');
    el.innerHTML = '';
    this.stockEls = [];
    for (let i = 0; i < this.game.merchTotal; i++) {
      const c = iconCanvas('merch', null, 32);
      c.className = 'stock-icon empty';
      el.appendChild(c);
      this.stockEls.push(c);
    }
  }

  setStock(placed, left) {
    this.stockEls.forEach((c, i) => {
      const cls = i < left ? 'stock-icon' : i < placed ? 'stock-icon broken' : 'stock-icon empty';
      if (c.className !== cls) {
        c.className = cls;
        if (cls.includes('broken')) gsap.fromTo(c, { y: -10, rotate: 30 }, { y: 0, rotate: 0, duration: 0.5, ease: 'bounce.out' });
        else if (cls === 'stock-icon') gsap.fromTo(c, { scale: 0.3 }, { scale: 1, duration: 0.4, ease: 'back.out(3)' });
      }
    });
  }

  // ------------------------------------------------------------ cards

  buildCards() {
    const wrap = this.$('.cards');
    wrap.innerHTML = '';
    const ids = this.game.phase === 'prep' ? ['merch', ...this.game.hazards] : this.game.hazards;
    ids.forEach((id, i) => {
      const r = RECIPES[id];
      const data = save.data.recipes[id];
      const card = document.createElement('button');
      card.className = 'card';
      card.style.setProperty('--accent', r.color);
      const grade = id === 'merch' ? '' : `<div class="grade g-${data.crafted ? gradeOf(data.match) : 'none'}">${data.crafted ? gradeOf(data.match) : '–'}</div>`;
      card.innerHTML = `
        <div class="card-key">${i + 1}</div>
        ${grade}
        <div class="card-art"></div>
        <div class="card-name">${r.short}</div>
        <div class="card-cost">${id === 'merch' ? '<span class="merch-count"></span>' : `<span class="mini-lump"></span>${r.cost}`}</div>
        <div class="card-cd"></div>`;
      card.querySelector('.card-art').appendChild(iconCanvas(id, data && data.profile, 64));
      card.onclick = () => this.game.select(id);
      card.onmouseenter = () => { sfx.hover(); this.showTip(card, id); };
      card.onmouseleave = () => this.hideTip();
      wrap.appendChild(card);
      this.cardEls.set(id, card);
      gsap.from(card, { y: 60, opacity: 0, duration: 0.4, delay: 0.2 + i * 0.05, ease: 'back.out(2)' });
    });
  }

  showTip(card, id) {
    const r = RECIPES[id];
    const data = save.data.recipes[id];
    const tip = this.$('.tooltip');
    const q = id === 'merch' ? '' : `<div class="tip-q">Craft quality: <b>${data.crafted ? Math.round(data.match * 100) + '% match' : 'unshaped (weak)'}</b></div>`;
    tip.innerHTML = `<div class="tip-name" style="color:${r.color}">${r.name}</div><div class="tip-desc">${r.desc}</div>${r.effect ? `<div class="tip-fx">${r.effect}</div>` : ''}${q}`;
    const b = card.getBoundingClientRect();
    tip.style.left = `${b.left + b.width / 2}px`;
    tip.style.top = `${b.top - 10}px`;
    tip.classList.add('show');
  }

  hideTip() { this.$('.tooltip').classList.remove('show'); }

  updateCards() {
    const g = this.game;
    for (const [id, card] of this.cardEls) {
      const r = RECIPES[id];
      const cd = g.cooldowns[id] || 0;
      const frac = r.cooldown ? cd / r.cooldown : 0;
      card.querySelector('.card-cd').style.height = `${frac * 100}%`;
      const afford = id === 'merch' ? g.merchToPlace > 0 : g.clay >= r.cost && cd <= 0;
      card.classList.toggle('disabled', !afford);
      card.classList.toggle('selected', g.selected === id);
      if (id === 'merch') card.querySelector('.merch-count').textContent = `${g.merchToPlace} left`;
    }
  }

  setClay(n, pulse) {
    const el = this.$('.clay-num');
    el.textContent = Math.floor(n);
    if (pulse) gsap.fromTo(this.$('.clay-chip'), { scale: 1.2 }, { scale: 1, duration: 0.35, ease: 'back.out(3)' });
  }

  clayScreenPos() {
    const b = this.$('.clay-lump').getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }

  // ------------------------------------------------------------ phases

  setPrep() {
    const g = this.game;
    const t = this.$('.prep-text');
    if (g.merchToPlace > 0) {
      t.innerHTML = `Place your <b>merchandise</b> (${g.merchToPlace} left) — then guard it with hazard pots.<div class="tip-line">${g.level.tip}</div>`;
    } else {
      t.innerHTML = `Stock is out! Spend your clay on traps, then open up.<div class="tip-line">Click a placed pot to pick it back up.</div>`;
    }
    this.$('.open-btn').disabled = g.merchToPlace > 0;
  }

  toWave() {
    const p = this.$('.prep');
    gsap.to(p, { y: -40, opacity: 0, duration: 0.3, onComplete: () => p.remove() });
    this.cardEls.clear();
    this.buildCards();
  }

  toEnd() {
    gsap.to(this.$('.tray'), { y: 160, duration: 0.5, ease: 'back.in(1.5)' });
    this.hideTip();
  }

  setTime(rem, total) {
    const s = Math.max(0, Math.ceil(rem));
    this.$('.time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const f = Math.max(0, rem / total);
    this.$('.dial').style.background = `conic-gradient(#ffd75a ${f * 360}deg, #3a2414 0deg)`;
    this.$('.clock').classList.toggle('urgent', rem < 10 && rem > 0);
  }

  banner(main, sub = '', hold = 1.6, color = null) {
    const b = this.$('.banner');
    const m = this.$('.banner-main');
    m.textContent = main;
    m.style.color = color || '';
    this.$('.banner-sub').textContent = sub;
    gsap.killTweensOf([b, m]);
    const tl = gsap.timeline();
    tl.set(b, { opacity: 1 });
    tl.fromTo(m, { scale: 3, opacity: 0, rotate: -8 }, { scale: 1, opacity: 1, rotate: 0, duration: 0.5, ease: 'back.out(2)' });
    tl.fromTo(this.$('.banner-sub'), { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 }, '-=0.2');
    if (hold > 0) tl.to(b, { opacity: 0, duration: 0.3, delay: hold });
    return tl;
  }

  // ------------------------------------------------------------ world-anchored text

  project(v) {
    tmp.copy(v).project(this.game.cam);
    return { x: (tmp.x * 0.5 + 0.5) * window.innerWidth, y: (-tmp.y * 0.5 + 0.5) * window.innerHeight };
  }

  say(who, text, getPos, dur = 2.2) {
    let b = this.bubbles.get(who);
    if (b) { b.el.remove(); b.tween && b.tween.kill(); }
    const el = document.createElement('div');
    el.className = 'bubble-anchor';
    const inner = document.createElement('div');
    inner.className = `bubble bubble-${who}`;
    inner.textContent = text;
    el.appendChild(inner);
    this.$('.bubbles').appendChild(el);
    b = { el, getPos, t: dur };
    this.bubbles.set(who, b);
    this.placeBubble(b);
    gsap.fromTo(inner, { scale: 0.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(3)' });
    b.tween = gsap.to(inner, { opacity: 0, duration: 0.25, delay: dur, onComplete: () => { el.remove(); if (this.bubbles.get(who) === b) this.bubbles.delete(who); } });
  }

  placeBubble(b) {
    const p = this.project(b.getPos());
    b.el.style.left = `${Math.max(130, Math.min(window.innerWidth - 130, p.x))}px`;
    b.el.style.top = `${Math.max(130, p.y)}px`;
  }

  float(text, worldPos, cls = '') {
    const el = document.createElement('div');
    el.className = `floater ${cls}`;
    el.textContent = text;
    const p = this.project(worldPos);
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    this.$('.floaters').appendChild(el);
    const long = cls === 'warn';
    gsap.fromTo(el, { y: 0, scale: 0.4 }, { y: -50, scale: 1, duration: long ? 1.6 : 0.9, ease: 'power2.out' });
    gsap.to(el, { opacity: 0, duration: 0.3, delay: long ? 2.2 : 0.7, onComplete: () => el.remove() });
  }

  flyToClay(worldPos, n) {
    const p = this.project(worldPos);
    const t = this.clayScreenPos();
    const el = document.createElement('div');
    el.className = 'fly-lump';
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    this.$('.floaters').appendChild(el);
    gsap.to(el, {
      left: t.x, top: t.y, duration: 0.55, ease: 'power2.in',
      onComplete: () => { el.remove(); this.game.addClay(n); },
    });
    gsap.fromTo(el, { scale: 1.4 }, { scale: 0.6, duration: 0.55 });
  }

  setPaused(p) {
    this.$('.pause-menu').classList.toggle('hidden', !p);
  }

  update() {
    for (const [, b] of this.bubbles) this.placeBubble(b);
    this.updateCards();
  }
}
