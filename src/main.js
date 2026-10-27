import gsap from 'gsap';
import './style.css';
import { N64Renderer } from './render/n64.js';
import { MenuScreen } from './ui/menu.js';
import { ResultsPanel } from './ui/results.js';
import { Game } from './game/game.js';
import { CraftScreen } from './craft/wheel.js';
import { save } from './game/save.js';
import { sfx, music } from './audio.js';

class App {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.renderer = new N64Renderer(this.canvas);
    this.iris = document.querySelector('#iris .hole');
    this.screen = null;
    this.results = null;
    this.handMode = null;
    this.busy = false;
    this.last = performance.now();
    sfx.setMuted(save.data.sound === false);
    const unlock = () => {
      sfx.unlock();
      if (!this.musicOn) { this.musicOn = true; music.start(); }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen instanceof Game && !this.screen.paused && this.screen.phase === 'wave') this.togglePause();
    });
    this.screen = new MenuScreen(this, 'title');
    gsap.fromTo(this.iris, { width: 0, height: 0 }, { width: '260vmax', height: '260vmax', duration: 0.9, ease: 'power2.out' });
    requestAnimationFrame(this.loop);
    window.__app = this;
  }

  loop = (t) => {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    if (this.screen) {
      this.screen.update(dt);
      this.screen.render();
    }
    requestAnimationFrame(this.loop);
  };

  async transition(make) {
    if (this.busy) return;
    this.busy = true;
    gsap.globalTimeline.resume();
    gsap.globalTimeline.timeScale(1);
    sfx.whoosh();
    await gsap.to(this.iris, { width: 0, height: 0, duration: 0.45, ease: 'power2.in' });
    if (this.results) { this.results.destroy(); this.results = null; }
    if (this.screen) this.screen.dispose();
    this.screen = null;
    try {
      this.screen = make();
    } finally {
      await gsap.to(this.iris, { width: '260vmax', height: '260vmax', duration: 0.55, ease: 'power2.out' });
      this.busy = false;
    }
  }

  menu(mode) {
    if (this.screen instanceof MenuScreen && !this.busy) { this.screen.setMode(mode); return; }
    this.transition(() => new MenuScreen(this, mode));
  }

  toTitle() { this.menu('title'); }
  toCalendar() { this.menu('calendar'); }
  toWorkshop() { this.menu('workshop'); }
  toWheel(id) { this.transition(() => new CraftScreen(this, id)); }

  startLevel(i) { this.transition(() => new Game(this, i)); }

  restartLevel() {
    if (this.screen instanceof Game) this.startLevel(this.screen.levelIndex);
  }

  showResults(res) {
    if (this.results) this.results.destroy();
    this.results = new ResultsPanel(this, res);
  }

  togglePause() {
    const g = this.screen;
    if (!(g instanceof Game) || this.busy) return;
    if (g.phase === 'end' && !g.paused) return;
    const p = !g.paused;
    g.setPaused(p);
    if (p) gsap.globalTimeline.pause();
    else gsap.globalTimeline.resume();
    sfx.click();
  }
}

new App();
