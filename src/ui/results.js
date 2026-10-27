import gsap from 'gsap';
import { LEVELS } from '../game/levels.js';
import { RECIPES } from '../game/recipes.js';
import { iconCanvas } from './icons.js';
import { sfx } from '../audio.js';

export class ResultsPanel {
  constructor(app, res) {
    this.app = app;
    const L = LEVELS[res.levelIndex];
    const last = res.levelIndex === LEVELS.length - 1;
    const head = res.win ? (last ? 'THE SHOP IS SAVED!' : `DAY ${L.id} SURVIVED!`) : 'BANKRUPT!';
    const why = {
      ko: 'You knocked Petey out cold.',
      time: 'You held out until closing time.',
      broke: 'Petey smashed every piece of stock.',
    }[res.reason];
    const el = (this.el = document.createElement('div'));
    el.className = `results ${res.win ? 'win' : 'lose'}`;
    el.innerHTML = `
      <div class="panel res-card">
        <div class="res-head">${head}</div>
        <div class="res-why">${why}</div>
        <div class="res-stars">${[0, 1, 2].map(() => '<span>★</span>').join('')}</div>
        <div class="res-lines">
          <div><span>Merchandise saved</span><b>${res.merchLeft} / ${res.merchTotal}</b></div>
          <div><span>Damage dealt to Petey</span><b>${res.damage.toFixed(2).replace(/\.?0+$/, '')}</b></div>
          <div><span>Traps sprung</span><b>${res.traps}</b></div>
          <div><span>Coins Petey pocketed</span><b>${res.loot}</b></div>
        </div>
        ${res.reward ? `
        <div class="reward">
          <div class="reward-kicker">NEW RECIPE LEARNED</div>
          <div class="reward-card">
            <div class="reward-face back">?</div>
            <div class="reward-face front"><div class="reward-art"></div><div class="reward-name">${RECIPES[res.reward].name}</div><div class="reward-fx">${RECIPES[res.reward].effect}</div></div>
          </div>
        </div>` : ''}
        ${last && res.win ? '<div class="finale">Mortimer\'s pots are safe... until the sequel. Thanks for playing!</div>' : ''}
        <div class="res-buttons"></div>
      </div>`;
    document.getElementById('ui').appendChild(el);
    const btns = el.querySelector('.res-buttons');
    const add = (label, fn, go) => {
      const b = document.createElement('button');
      b.className = `btn ${go ? 'btn-go' : ''}`;
      b.textContent = label;
      b.onclick = () => { sfx.click(); fn(); };
      btns.appendChild(b);
    };
    if (res.win) {
      if (res.reward) add('Shape it at the Wheel', () => app.toWheel(res.reward), true);
      if (!last) add(`Next: Day ${L.id + 1}`, () => app.startLevel(res.levelIndex + 1), !res.reward);
      add('Replay', () => app.startLevel(res.levelIndex));
    } else {
      add('Try Again', () => app.startLevel(res.levelIndex), true);
      add('Pottery Workshop', () => app.toWorkshop());
    }
    add('Calendar', () => app.toCalendar());
    if (res.reward) el.querySelector('.reward-art').appendChild(iconCanvas(res.reward, null, 80));

    const tl = gsap.timeline();
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.3 });
    tl.fromTo(el.querySelector('.res-card'), { y: 200, rotate: -6 }, { y: 0, rotate: 0, duration: 0.6, ease: 'back.out(1.6)' }, 0);
    tl.from(el.querySelector('.res-head'), { scale: 2.5, opacity: 0, duration: 0.4, ease: 'back.out(2)' }, 0.3);
    const stars = el.querySelectorAll('.res-stars span');
    stars.forEach((s, i) => {
      if (i < res.stars) {
        tl.call(() => { s.classList.add('on'); sfx.coin(); }, null, 0.7 + i * 0.25);
        tl.fromTo(s, { scale: 3, rotate: -90 }, { scale: 1, rotate: 0, duration: 0.35, ease: 'back.out(3)' }, 0.7 + i * 0.25);
      }
    });
    tl.from(el.querySelectorAll('.res-lines > div'), { x: -40, opacity: 0, stagger: 0.08, duration: 0.3 }, 0.6);
    if (res.reward) {
      const card = el.querySelector('.reward-card');
      tl.from(el.querySelector('.reward'), { scale: 0.5, opacity: 0, duration: 0.4, ease: 'back.out(2)' }, 1.4);
      tl.to(card, { rotateY: 180, duration: 0.7, ease: 'back.out(1.5)', onStart: () => sfx.whoosh(), onComplete: () => sfx.fanfare() }, 1.9);
    } else if (res.win) {
      tl.call(() => sfx.fanfare(), null, 0.7);
    } else {
      tl.call(() => sfx.sad(), null, 0.5);
    }
    tl.from(btns.children, { y: 30, opacity: 0, stagger: 0.08, duration: 0.3, ease: 'back.out(2)' }, res.reward ? 2.4 : 1.2);
  }

  destroy() {
    this.el.remove();
  }
}
