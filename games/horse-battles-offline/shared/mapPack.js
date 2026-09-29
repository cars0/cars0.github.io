// Five hand-designed, curated maps shipped with the game — same data shape a
// player-saved level uses ({name, obstacles, weapons, terrain, horseSpawns}),
// plus `wildcards`/`crownSpawn` for the Level Editor's newer marker types.
// Selectable from the lobby's map dropdown alongside "Random Map" and any of
// the player's own saved levels.

function spawnRing(cx, cy, r, count = 8) {
  const out = new Array(8).fill(null);
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 - Math.PI / 2;
    out[i] = { x: Math.round(cx + Math.cos(ang) * r), y: Math.round(cy + Math.sin(ang) * r) };
  }
  return out;
}

export const MAP_PACK = [
  {
    name: 'Open Range',
    obstacles: [
      { x: 240, y: 240, w: 30, h: 30, type: 'breakable' },
      { x: 630, y: 240, w: 30, h: 30, type: 'breakable' },
      { x: 240, y: 420, w: 30, h: 30, type: 'breakable' },
      { x: 630, y: 420, w: 30, h: 30, type: 'breakable' },
      { x: 435, y: 330, w: 30, h: 30, type: 'solid' }
    ],
    weapons: [
      { type: 'sword', x: 450, y: 200 },
      { type: 'revolver', x: 200, y: 450 },
      { type: 'revolver', x: 700, y: 450 },
      { type: 'bow', x: 450, y: 500 },
      { type: 'burst', x: 320, y: 337 },
      { type: 'rocket', x: 580, y: 337 }
    ],
    terrain: [],
    horseSpawns: spawnRing(450, 337, 260),
    wildcards: [],
    crownSpawn: null
  },
  {
    name: 'Crate Maze',
    obstacles: (() => {
      const list = [];
      // a blocky maze of breakable crates filling the middle third of the arena
      for (let gx = 8; gx <= 20; gx += 2) {
        for (let gy = 6; gy <= 15; gy += 2) {
          if ((gx + gy) % 3 === 0) continue; // leave gaps so it's a maze, not a wall
          list.push({ x: gx * 30, y: gy * 30, w: 30, h: 30, type: 'breakable' });
        }
      }
      // solid pillars at the four inner corners of the maze for cover that never breaks
      list.push({ x: 8 * 30, y: 6 * 30, w: 30, h: 30, type: 'solid' });
      list.push({ x: 20 * 30, y: 6 * 30, w: 30, h: 30, type: 'solid' });
      list.push({ x: 8 * 30, y: 15 * 30, w: 30, h: 30, type: 'solid' });
      list.push({ x: 20 * 30, y: 15 * 30, w: 30, h: 30, type: 'solid' });
      return list;
    })(),
    weapons: [
      { type: 'sword', x: 450, y: 337 },
      { type: 'revolver', x: 150, y: 150 },
      { type: 'revolver', x: 750, y: 150 },
      { type: 'bow', x: 150, y: 550 },
      { type: 'bow', x: 750, y: 550 },
      { type: 'burst', x: 450, y: 150 }
    ],
    terrain: [],
    horseSpawns: spawnRing(450, 337, 300),
    wildcards: [],
    crownSpawn: null
  },
  {
    name: 'Ice Rink',
    obstacles: [
      { x: 100, y: 100, w: 30, h: 30, type: 'solid' },
      { x: 800, y: 100, w: 30, h: 30, type: 'solid' },
      { x: 100, y: 580, w: 30, h: 30, type: 'solid' },
      { x: 800, y: 580, w: 30, h: 30, type: 'solid' }
    ],
    weapons: [
      { type: 'sword', x: 450, y: 337 },
      { type: 'revolver', x: 300, y: 250 },
      { type: 'revolver', x: 600, y: 420 },
      { type: 'bow', x: 300, y: 420 },
      { type: 'rocket', x: 600, y: 250 }
    ],
    terrain: (() => {
      // a big ice sheet across the center of the arena, mud around the outer ring
      // to slow anyone circling the edge instead of skating through the middle
      const list = [];
      for (let gx = 8; gx <= 20; gx++) {
        for (let gy = 6; gy <= 15; gy++) list.push({ x: gx * 30, y: gy * 30, type: 'ice' });
      }
      [[2, 4], [26, 4], [2, 17], [26, 17]].forEach(([gx, gy]) => list.push({ x: gx * 30, y: gy * 30, type: 'mud' }));
      return list;
    })(),
    horseSpawns: spawnRing(450, 337, 280),
    wildcards: [],
    crownSpawn: null
  },
  {
    name: 'Fortress',
    obstacles: (() => {
      const list = [];
      // a solid ring wall with two breakable chokepoint gates, splitting the
      // arena into an outer lane and a contested inner courtyard
      const ringGX = [10, 12, 14, 16, 18], ringGY = [7, 9, 11, 13];
      for (const gx of ringGX) { list.push({ x: gx * 30, y: 7 * 30, w: 30, h: 30, type: 'solid' }); list.push({ x: gx * 30, y: 13 * 30, w: 30, h: 30, type: 'solid' }); }
      for (const gy of ringGY) { list.push({ x: 10 * 30, y: gy * 30, w: 30, h: 30, type: 'solid' }); list.push({ x: 18 * 30, y: gy * 30, w: 30, h: 30, type: 'solid' }); }
      // breakable gates at the midpoints of the north/south walls
      list.push({ x: 14 * 30, y: 7 * 30, w: 30, h: 30, type: 'breakable' });
      list.push({ x: 14 * 30, y: 13 * 30, w: 30, h: 30, type: 'breakable' });
      return list.filter((o, i, arr) => arr.findIndex(p => p.x === o.x && p.y === o.y) === i);
    })(),
    weapons: [
      { type: 'sword', x: 450, y: 337 }, // inside the courtyard — worth fighting for
      { type: 'rocket', x: 450, y: 300 },
      { type: 'revolver', x: 150, y: 337 },
      { type: 'revolver', x: 750, y: 337 },
      { type: 'bow', x: 450, y: 550 },
      { type: 'burst', x: 450, y: 120 }
    ],
    terrain: [],
    horseSpawns: spawnRing(450, 337, 300),
    wildcards: [],
    crownSpawn: null
  },
  {
    name: 'Gauntlet',
    obstacles: [
      { x: 200, y: 300, w: 30, h: 30, type: 'breakable' },
      { x: 260, y: 300, w: 30, h: 30, type: 'breakable' },
      { x: 620, y: 380, w: 30, h: 30, type: 'breakable' },
      { x: 680, y: 380, w: 30, h: 30, type: 'breakable' },
      { x: 435, y: 60, w: 30, h: 30, type: 'solid' },
      { x: 435, y: 600, w: 30, h: 30, type: 'solid' }
    ],
    weapons: [
      { type: 'sword', x: 450, y: 337 },
      { type: 'revolver', x: 150, y: 150 },
      { type: 'bow', x: 750, y: 550 },
      { type: 'burst', x: 150, y: 550 },
      { type: 'rocket', x: 750, y: 150 }
    ],
    terrain: [
      // a mud patch guarding one side, an ice patch on the other, and launch pads
      // flinging horses across the open middle strip between them
      { x: 180, y: 270, type: 'mud' }, { x: 210, y: 270, type: 'mud' }, { x: 180, y: 300, type: 'mud' }, { x: 210, y: 300, type: 'mud' },
      { x: 630, y: 390, type: 'ice' }, { x: 660, y: 390, type: 'ice' }, { x: 630, y: 420, type: 'ice' }, { x: 660, y: 420, type: 'ice' },
      { x: 420, y: 180, type: 'launch' }, { x: 420, y: 480, type: 'launch' }
    ],
    horseSpawns: spawnRing(450, 337, 260),
    wildcards: [],
    crownSpawn: null
  }
];
