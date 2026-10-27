# Not The Pots!

*A shopkeeper's revenge.* In every adventure game, a hero barges into a shop and smashes all the pots for loot. This time you're the potter.

Petey, a lunatic in green tights, comes in every day to wreck your stock. Place your merchandise, guard it with booby-trapped pots, and survive until closing time (or knock him out cold). Win a day and you learn a new trap recipe, which you shape by hand on a pottery wheel using your webcam.

Built with three.js and GSAP in an N64 / late-90s style. Every model and texture is generated in code.

## Play

```bash
npm install
npm run dev
```

Then open http://localhost:5173. For the webcam pottery wheel, use a Chromium-based browser and allow camera access. You can also shape pots with the mouse.

## How it works

- **Prep:** place your merchandise pots, then spend clay on trap pots. Petey grabs the closest pot he can reach, so put traps in his way.
- **Open the shop:** Petey lifts, throws and slashes pots. Drop more traps as clay comes in, click clay lumps from broken traps to collect them, and snatch hearts before he eats them.
- **Win** by lasting until closing time or knocking Petey out with at least one piece of stock intact.
- **Traps:** Boom Pot, Snapper Pot, Zap Jar, Snooze Gourd, Glue Crock, Hive Pot.
- **Pottery Workshop:** match each recipe's silhouette on the wheel. Point to push clay in, pinch to pull it out or up. A closer match makes a stronger trap, and the pot you shape becomes that trap's model in the shop.

Hand tracking uses MediaPipe and runs entirely in the browser. No video leaves your machine.

## Project layout

- `src/game/` — level data, grid pathfinding, the hero AI, traps and the main game loop
- `src/craft/` — the pottery wheel and webcam hand tracking
- `src/models/` — every character, pot and prop, built from three.js primitives
- `src/render/` — the N64-style renderer and the painted canvas textures
- `src/ui/` — HUD, menus and results screens
