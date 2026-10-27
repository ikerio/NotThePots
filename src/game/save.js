import { RECIPES, STARTER } from './recipes.js';

const KEY = 'not-the-pots-save-v1';

function fresh() {
  const recipes = {};
  for (const id of STARTER) recipes[id] = { quality: 0.45, match: 0, profile: null, crafted: false };
  return { unlocked: 1, stars: {}, recipes, newRecipe: null, sound: true };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch (e) { /* storage unavailable: play without saving */ }
  return fresh();
}

export const save = {
  get data() { return state; },
  write() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  },
  reset() { state = fresh(); this.write(); },
  known(id) { return id === 'merch' || !!state.recipes[id]; },
  knownHazards() { return Object.keys(RECIPES).filter((id) => id !== 'merch' && state.recipes[id]); },
  learn(id) {
    if (!state.recipes[id]) state.recipes[id] = { quality: 0.3, match: 0, profile: null, crafted: false };
    state.newRecipe = id;
    this.write();
  },
  recordCraft(id, match, quality, profile) {
    const r = state.recipes[id];
    if (!r) return false;
    const better = quality >= r.quality || !r.crafted;
    if (better) Object.assign(r, { quality, match, profile, crafted: true });
    if (state.newRecipe === id) state.newRecipe = null;
    this.write();
    return better;
  },
  winLevel(id, stars) {
    state.stars[id] = Math.max(state.stars[id] || 0, stars);
    state.unlocked = Math.max(state.unlocked, id + 1);
    this.write();
  },
};
