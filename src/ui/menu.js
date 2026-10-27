import * as THREE from 'three';
import gsap from 'gsap';
import { buildShop, isoCamera, placeIso, fitIso } from '../game/shop.js';
import { buildHero, potMesh } from '../models/models.js';
import { cellX, cellZ } from '../game/grid.js';
import { LEVELS } from '../game/levels.js';
import { RECIPES, HAZARDS, gradeOf } from '../game/recipes.js';
import { save } from '../game/save.js';
import { iconCanvas } from './icons.js';
import { sfx } from '../audio.js';

// Title, calendar and workshop menus share one living diorama in the background.
export class MenuScreen {
  constructor(app, mode = 'title') {
    this.app = app;
    this.time = 0;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x150c07);
    this.scene.fog = new THREE.Fog(0x150c07, 44, 66);
    const shop = (this.shop = buildShop(LEVELS[0].layout));
    this.scene.add(shop.group);
    this.cam = isoCamera();
    this.cam.userData.zoom = 1.25;
    this.cam.userData.target.set(-0.6, 0.4, 0.2);
    this.hero = buildHero();
    this.hero.root.position.set(cellX(5), 0, cellZ(5));
    this.hero.root.rotation.y = 0.5;
    this.scene.add(this.hero.root);
    for (const [id, c, r] of [['merch', 3, 3], ['merch', 7, 4], ['bomb', 4, 3], ['snapper', 8, 5], ['merch', 6, 7], ['zap', 2, 6], ['glue', 7, 6]]) {
      const p = potMesh(id, save.data.recipes[id] && save.data.recipes[id].profile);
      p.position.set(cellX(c), 0, cellZ(r));
      p.rotation.y = c * 1.3;
      this.scene.add(p);
    }
    const shopMerchant = shop.merchant;
    gsap.to(shopMerchant.body.position, { y: 0.04, duration: 0.8, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    shopMerchant.setFace('happy');
    this.danceTl = gsap.timeline({ repeat: -1 });
    const h = this.hero;
    this.danceTl
      .to(h.body.position, { y: 0.25, duration: 0.25, ease: 'power2.out' })
      .to(h.body.position, { y: 0, duration: 0.25, ease: 'power2.in' })
      .to(h.arms[0].rotation, { x: -2.8, duration: 0.25 }, 0)
      .to(h.arms[1].rotation, { x: -0.5, duration: 0.25 }, 0)
      .to(h.root.rotation, { y: '+=1.2', duration: 0.5 }, 0)
      .to(h.body.position, { y: 0.25, duration: 0.25, ease: 'power2.out' })
      .to(h.body.position, { y: 0, duration: 0.25, ease: 'power2.in' })
      .to(h.arms[0].rotation, { x: -0.5, duration: 0.25 }, 0.5)
      .to(h.arms[1].rotation, { x: -2.8, duration: 0.25 }, 0.5)
      .to(h.root.rotation, { y: '-=1.2', duration: 0.5 }, 0.5);
    h.setFace('crazy');

    this.ui = document.createElement('div');
    this.ui.className = 'menu';
    document.getElementById('ui').appendChild(this.ui);
    this.setMode(mode);
  }

  setMode(mode) {
    this.mode = mode;
    const ui = this.ui;
    gsap.killTweensOf(ui.querySelectorAll('*'));
    ui.innerHTML = '';
    ui.className = `menu menu-${mode}`;
    const zoom = mode === 'title' ? 1.25 : 1.0;
    gsap.to(this.cam.userData, { zoom, duration: 0.8, ease: 'power2.inOut' });
    gsap.to(this.cam.userData.target, mode === 'title' ? { x: -0.6, y: 0.4, z: 0.2, duration: 0.8 } : { x: 0.4, y: 0.2, z: 0.6, duration: 0.8 });
    if (mode === 'title') this.buildTitle();
    else if (mode === 'calendar') this.buildCalendar();
    else if (mode === 'workshop') this.buildWorkshop();
  }

  buildTitle() {
    const word = (w) => [...w].map((ch) => `<span class="ch">${ch}</span>`).join('');
    this.ui.innerHTML = `
      <div class="title-wrap">
        <div class="logo">
          <div class="logo-row small">${word('NOT')}</div>
          <div class="logo-row small">${word('THE')}</div>
          <div class="logo-row big">${word('POTS!')}</div>
        </div>
        <div class="subtitle">A shopkeeper's revenge</div>
        <div class="menu-buttons">
          <button class="btn btn-go play">Open the Shop</button>
          <button class="btn workshop">Pottery Workshop</button>
          <button class="btn howto">How to Play</button>
        </div>
      </div>
      <div class="corner">
        <button class="chip icon-btn mute">${save.data.sound === false ? 'Sound: Off' : 'Sound: On'}</button>
      </div>
      <div class="howto-modal hidden">
        <div class="panel howto-panel">
          <h2>How to Play</h2>
          <ol>
            <li><b>You are Mortimer</b>, a potter. Petey, a lunatic in green tights, smashes pots for loot.</li>
            <li><b>Place your merchandise</b> before opening. If every piece breaks, you're bankrupt.</li>
            <li><b>Guard it with trap pots</b>: Boom Pots, Snapper plants and more. Petey grabs the closest pot he can reach, so put traps in his way.</li>
            <li>Spend <b>clay</b> to drop more traps during the day. Click clay lumps from broken traps to collect them, and snatch any hearts before Petey eats them.</li>
            <li><b>Survive until closing time</b>, or knock Petey out, to win the day and a new recipe.</li>
            <li>At the <b>Pottery Workshop</b>, shape each recipe on the wheel with your hands (webcam) or the mouse. The closer the match, the stronger the trap.</li>
          </ol>
          <button class="btn btn-go close-howto">Got it!</button>
        </div>
      </div>`;
    const $ = (s) => this.ui.querySelector(s);
    $('.play').onclick = () => { sfx.click(); this.setMode('calendar'); };
    $('.workshop').onclick = () => { sfx.click(); this.setMode('workshop'); };
    $('.howto').onclick = () => {
      sfx.click();
      $('.howto-modal').classList.remove('hidden');
      gsap.fromTo($('.howto-panel'), { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2)' });
    };
    $('.close-howto').onclick = () => { sfx.click(); $('.howto-modal').classList.add('hidden'); };
    $('.mute').onclick = (e) => {
      const off = !(save.data.sound === false);
      save.data.sound = !off;
      save.write();
      sfx.setMuted(off);
      e.target.textContent = off ? 'Sound: Off' : 'Sound: On';
    };
    const chars = this.ui.querySelectorAll('.logo .ch');
    gsap.fromTo(chars, { y: -300, rotate: () => (Math.random() - 0.5) * 90, opacity: 0 }, { y: 0, rotate: 0, opacity: 1, duration: 0.9, stagger: 0.06, ease: 'bounce.out' });
    gsap.to(chars, { y: -8, duration: 0.6, stagger: { each: 0.08, repeat: -1, yoyo: true }, ease: 'sine.inOut', delay: 1.6 });
    gsap.from(this.ui.querySelector('.subtitle'), { opacity: 0, y: 20, delay: 0.9, duration: 0.5 });
    gsap.from(this.ui.querySelectorAll('.menu-buttons .btn'), { y: 40, opacity: 0, stagger: 0.1, delay: 1.1, duration: 0.5, ease: 'back.out(2)' });
  }

  buildCalendar() {
    const d = save.data;
    this.ui.innerHTML = `
      <div class="screen-panel">
        <div class="screen-head">
          <h1>Mortimer's Calendar</h1>
          <p>Petey drops by every day. Keep at least one piece of stock in one piece.</p>
        </div>
        <div class="days"></div>
        <div class="screen-buttons">
          <button class="btn back">Back</button>
          <button class="btn workshop">Pottery Workshop</button>
        </div>
      </div>`;
    const days = this.ui.querySelector('.days');
    LEVELS.forEach((L, i) => {
      const locked = L.id > d.unlocked;
      const stars = d.stars[L.id] || 0;
      const card = document.createElement('button');
      card.className = `day-card ${locked ? 'locked' : ''} ${stars ? 'done' : ''}`;
      card.innerHTML = `
        <div class="day-top">DAY ${L.id}</div>
        <div class="day-title">${locked ? '???' : L.name}</div>
        <div class="day-stars">${[0, 1, 2].map((k) => `<span class="${k < stars ? 'on' : ''}">★</span>`).join('')}</div>
        <div class="day-info">${locked ? 'Locked' : `Stock: ${L.merch} · Petey: ${L.heroHP}♥ · ${L.duration}s`}</div>
        <div class="day-reward"></div>`;
      if (!locked && L.reward) {
        const rw = card.querySelector('.day-reward');
        const known = save.known(L.reward);
        rw.innerHTML = `<span>${known ? 'Earned' : 'Reward'}:</span>`;
        const ic = iconCanvas(L.reward, null, 32, known ? {} : { outline: '#f3d36b' });
        rw.appendChild(ic);
        rw.insertAdjacentHTML('beforeend', `<span>${known ? RECIPES[L.reward].short : '???'}</span>`);
      } else if (!locked) {
        card.querySelector('.day-reward').innerHTML = '<span>The finale!</span>';
      }
      if (!locked) card.onclick = () => { sfx.click(); this.app.startLevel(i); };
      card.onmouseenter = () => !locked && sfx.hover();
      days.appendChild(card);
    });
    const $ = (s) => this.ui.querySelector(s);
    $('.back').onclick = () => { sfx.click(); this.setMode('title'); };
    $('.workshop').onclick = () => { sfx.click(); this.setMode('workshop'); };
    gsap.from($('.screen-head'), { y: -40, opacity: 0, duration: 0.4 });
    gsap.from(days.children, { y: 80, opacity: 0, rotate: () => (Math.random() - 0.5) * 20, stagger: 0.07, duration: 0.5, ease: 'back.out(1.8)' });
  }

  buildWorkshop() {
    const d = save.data;
    this.ui.innerHTML = `
      <div class="screen-panel">
        <div class="screen-head">
          <h1>Pottery Workshop</h1>
          <p>Shape each recipe on the wheel. The closer you match the silhouette, the nastier the trap.</p>
        </div>
        <div class="recipes"></div>
        <div class="screen-buttons">
          <button class="btn back">Back</button>
          <button class="btn btn-go cal">To the Calendar</button>
        </div>
      </div>`;
    const wrap = this.ui.querySelector('.recipes');
    HAZARDS.forEach((id) => {
      const r = RECIPES[id];
      const data = d.recipes[id];
      const card = document.createElement('button');
      const isNew = d.newRecipe === id;
      card.className = `recipe-card ${data ? '' : 'locked'} ${isNew ? 'new' : ''}`;
      card.style.setProperty('--accent', r.color);
      const unlockDay = LEVELS.find((L) => L.reward === id);
      card.innerHTML = `
        ${isNew ? '<div class="new-badge">NEW!</div>' : ''}
        <div class="rc-art"></div>
        <div class="rc-name">${data ? r.name : '???'}</div>
        <div class="rc-desc">${data ? r.effect : `Win Day ${unlockDay ? unlockDay.id : '?'} to learn`}</div>
        <div class="rc-grade">${data ? (data.crafted ? `<span class="grade g-${gradeOf(data.match)}">${gradeOf(data.match)}</span> ${Math.round(data.match * 100)}% match` : '<span class="grade g-none">–</span> Not shaped yet') : ''}</div>
        ${data ? '<div class="rc-cta">Shape at the wheel ›</div>' : ''}`;
      card.querySelector('.rc-art').appendChild(iconCanvas(id, data && data.profile, 96, data ? {} : { outline: 'rgba(255,240,200,0.5)', dash: [4, 3] }));
      if (data) card.onclick = () => { sfx.click(); this.app.toWheel(id); };
      card.onmouseenter = () => data && sfx.hover();
      wrap.appendChild(card);
    });
    const $ = (s) => this.ui.querySelector(s);
    $('.back').onclick = () => { sfx.click(); this.setMode('title'); };
    $('.cal').onclick = () => { sfx.click(); this.setMode('calendar'); };
    gsap.from($('.screen-head'), { y: -40, opacity: 0, duration: 0.4 });
    gsap.from(wrap.children, { y: 80, opacity: 0, stagger: 0.07, duration: 0.5, ease: 'back.out(1.8)' });
    const nb = this.ui.querySelector('.new-badge');
    if (nb) gsap.to(nb, { scale: 1.15, duration: 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  }

  update(dt) {
    this.time += dt;
    const c = this.cam;
    const a = Math.PI / 4 + Math.sin(this.time * 0.15) * 0.12;
    c.userData.dir.set(Math.sin(a), 1.12, Math.cos(a)).normalize();
    fitIso(c, this.app.renderer.aspect);
    placeIso(c);
    this.hero.hatTip.rotation.z = Math.sin(this.time * 4) * 0.3;
    this.hero.tick(dt);
    this.shop.merchant.tick(dt);
    for (const l of this.shop.lights) l.intensity = 6 + Math.sin(this.time * 9 + l.id) * 0.4;
  }

  render() {
    this.app.renderer.render(this.scene, this.cam);
  }

  dispose() {
    this.danceTl.kill();
    this.ui.remove();
  }
}
