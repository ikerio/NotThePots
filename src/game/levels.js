// Shop layouts are 11 columns (x) by 9 rows (z). Row 0 hugs the back wall,
// column 0 hugs the left wall. Legend:
//   .  floor      r  rug        D  door (hero enters here)
//   S  shelf      M  merchant   C  counter
//   B  barrel     X  crates     P  pillar     T  display table

export const LEVELS = [
  {
    id: 1, name: 'Opening Day', merch: 3, heroHP: 3, speed: 1.55, impatience: 0.1,
    duration: 70, startClay: 16, regen: 2.4, reward: 'zap',
    intro: "Ooh, a pot shop! Don't mind me~",
    tip: 'Petey always grabs the nearest pot he can reach. Put hazard pots in his way!',
    layout: [
      'SS.SSD.SS.S',
      'MC.........',
      'MC.........',
      'MC...rrr...',
      'MC...rrr...',
      '...........',
      '..B......X.',
      '...........',
      '...........',
    ],
  },
  {
    id: 2, name: 'Rainy Tuesday', merch: 4, heroHP: 4, speed: 1.7, impatience: 0.16,
    duration: 85, startClay: 18, regen: 2.4, reward: 'snooze',
    intro: 'Is it raining in here, or is it just my HEROIC SPIRIT?!',
    tip: 'Pillars and furniture block his path. Tuck your merchandise into corners and plug the gaps.',
    layout: [
      'SSS.SDS.S.S',
      'MC.........',
      'MC..P...P..',
      'MC.........',
      'MC....T....',
      '...........',
      '..P.....P..',
      '...........',
      'B.........X',
    ],
  },
  {
    id: 3, name: 'Festival Rush', merch: 4, heroHP: 6, speed: 1.85, impatience: 0.22,
    duration: 95, startClay: 20, regen: 2.3, reward: 'glue',
    intro: 'Smashing pots is a festival tradition. Probably!',
    tip: 'Sleeping heroes take double damage. Snooze first, then hit him with everything!',
    layout: [
      'SS.SS.SDS.S',
      'MC.........',
      'MC.X.......',
      'MC....rrr..',
      'MC.B..rrr.P',
      '...........',
      '.....T.....',
      '..X........',
      '...........',
    ],
  },
  {
    id: 4, name: 'Return of Petey', merch: 5, heroHP: 10, speed: 1.95, impatience: 0.28,
    duration: 100, startClay: 23, regen: 2.2, reward: 'hive', rollSmash: true,
    intro: "I'M BAAAACK! And I've been practicing my roll!",
    tip: 'Petey now smashes pots he rolls into. Glue stops him from rolling.',
    layout: [
      'S.SSDSS.SSS',
      'MC.........',
      'MC..P..P...',
      'MC.........',
      'MC..P..P...',
      '...........',
      '......B....',
      '..T......X.',
      '...........',
    ],
  },
  {
    id: 5, name: 'The Grand Sale', merch: 5, heroHP: 14, speed: 2.1, impatience: 0.34,
    duration: 110, startClay: 26, regen: 2.1, reward: null, rollSmash: true,
    intro: 'Grand sale?! More like GRAND SMASH!',
    tip: 'Everything you have. Every pot you can shape. Protect the stock!',
    layout: [
      'SSS.SD.SSSS',
      'MC.........',
      'MC.T.....T.',
      'MC...rrr...',
      'MC...rrr...',
      '...P...P...',
      '...........',
      '.X.......B.',
      '...........',
    ],
  },
];

export const COLS = 11;
export const ROWS = 9;
