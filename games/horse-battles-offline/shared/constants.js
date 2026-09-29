// Shared between server (headless sim) and client (rendering) — no DOM/Node APIs here.

export const W = 900, H = 675;
export const BOUND = { x: 24, y: 24, w: W - 48, h: H - 48 };
export const HORSE_R = 16; // matches the horse sprite's slightly larger scale (2.05x)
export const GRID_SIZE = 30; // ground grid cell size — obstacles (random or hand-placed) snap to this
export const HORSE_SPEED_MIN = 130, HORSE_SPEED_MAX = 170;
export const MAX_HP = 100;
export const SWORD_DMG = 40;   // 3-hit kill at base MAX_HP, damage never scales
export const BULLET_DMG = MAX_HP; // a 1-hit kill at base MAX_HP — a Sturdy horse's HP bonus
                                   // can let it survive one shot, which is intentional: it's
                                   // the one place the stat archetypes actually matter for TTK
export const REVOLVER_COOLDOWN = 5; // fires every 5s regardless of overall pace
export const SWORD_HIT_COOLDOWN = 0.5;
export const BULLET_SPEED = 340;
export const REVOLVER_SPIN = 0.8;  // aim sweep speed (rad/s) — slow enough to actually track
export const SWORD_SPIN = 3.4;     // visual orbit speed (rad/s)
export const WEAPON_ORBIT_R = 16;  // px from horse center the weapon icon orbits at

// A horse's top speed (~170px/s) covers less ground per tick than HORSE_R (its own
// pickup radius), so a weapon dropped exactly at h.x/h.y in a single-weapon swap is
// still in range on the very next tick. Without a brief grace window, swapping into
// a second nearby weapon would immediately swap right back, forever, dragging both
// weapons along as the horse moves — this is that grace window, scoped to only the
// horse that dropped it, so it's still fair game for anyone else immediately.
export const WEAPON_DROP_IMMUNITY = 0.4; // seconds

// Bow: aims and fires like the revolver, but a lighter hit (2-hit kill at base MAX_HP)
// and its arrow ricochets off exactly one wall/solid-obstacle surface before dying —
// never off a horse, which always just takes the hit.
export const BOW_COOLDOWN = 4.5;
export const BOW_SPIN = 0.9;
export const ARROW_SPEED = 260;
export const ARROW_DMG = 55;

// Three-Round Burst: aims like the revolver, but each cooldown cycle fires three
// separate weaker shots in quick succession (not simultaneously) instead of one
// powerful one — a 3-hit kill at base MAX_HP if every shot in a burst connects.
export const BURST_COOLDOWN = 4;      // time between the start of one burst and the next
export const BURST_SHOT_GAP = 0.12;   // time between each of the 3 shots within a burst
export const BURST_SPIN = 0.8;
export const BURST_SPEED = 380;
export const BURST_DMG = 35;

// Rocket Launcher: slow-moving, explodes in a blast radius on contact with anything
// (a horse, a wall, or any obstacle) — including its own shooter, if they're still
// in the blast. Long cooldown to offset how strong an AOE hit is.
export const ROCKET_COOLDOWN = 5.5;
export const ROCKET_SPIN = 0.55;
export const ROCKET_SPEED = 130;
export const ROCKET_DMG = 70;
export const ROCKET_BLAST_RADIUS = 70;

export const OBSTACLE_TYPES = { SOLID: 'solid', BREAKABLE: 'breakable' };
export const BREAKABLE_HP = 2; // hits from a bumping horse before it breaks, no cooldown between them

export const MAX_PLAYERS_AND_BOTS = 8;
export const TOGGLEABLE_WEAPONS = ['sword', 'revolver', 'bow', 'burst', 'rocket'];
// How often a fresh weapon/item box appears on the ground during a random-map match
// (never on a custom map — that layout is exactly what its designer placed, on purpose).
export const WEAPON_RESPAWN_INTERVAL = 14;
export const MAX_GROUND_WEAPONS = 10;
export const ITEM_RESPAWN_INTERVAL = 20;
export const MAX_GROUND_ITEMS = 2;

// Level-editor "Wildcard" marker — a fixed point that periodically drops a random
// weapon or the Mystery Box item, but only while nothing already sits there
// uncollected. Editor/custom-map-only, unlike the interval respawns above.
export const WILDCARD_MIN_INTERVAL = 8;
export const WILDCARD_MAX_INTERVAL = 18;
export const WILDCARD_OCCUPIED_RADIUS = 20;
// The three effects a Mystery Box can roll into at pickup time — toggled as one
// unit ("Mystery Box" on/off) in the lobby, not individually.
export const MYSTERY_BOX_EFFECTS = ['speedBoost', 'shield', 'revive'];
export const MYSTERY_BOX_COUNT = 1; // how many boxes spawn per round — kept rare on purpose

export const SPEED_BOOST_MULT = 1.6;
export const SPEED_BOOST_DURATION = 10; // seconds
export const SHIELD_DURATION = 10;      // seconds

// Terrain hazards — flat ground zones horses pass through freely (no collision,
// unlike obstacles); they only affect movement while a horse is over them.
export const TERRAIN_TYPES = { MUD: 'mud', ICE: 'ice', LAUNCH: 'launch' };
export const TERRAIN_SIZE = GRID_SIZE; // one grid cell, same footprint as an obstacle
export const MUD_SPEED_MULT = 0.5;
export const ICE_SPEED_MULT = 1.45;
export const LAUNCH_SPEED = 300;
export const LAUNCH_COOLDOWN = 1;    // seconds before the same horse can be re-launched
export const RANDOM_TERRAIN_COUNT = 5; // scattered across a procedurally-generated map

// Shrinking arena — an optional, host-toggled pre-game mode. A safe-zone circle
// holds at full size for a grace period, then shrinks to a small core over a fixed
// duration; anyone caught outside it takes steady damage until they get back in.
export const ZONE_GRACE_PERIOD = 12;     // seconds before the zone starts closing
export const ZONE_SHRINK_DURATION = 60;  // seconds to shrink from full to minimum
export const ZONE_MIN_RADIUS = 90;
export const ZONE_DAMAGE_PER_SEC = 10;

// A second (and third, etc.) kill within this many seconds of the last counts as a streak.
export const MULTIKILL_WINDOW = 4.5;

// Royal Horse — a host-toggled king-of-the-hill mode. A crown spawns at arena
// center (or an editor-placed crown-spawn point); any horse-vs-horse bounce or
// projectile hit transfers the crown to whoever caused it. The winner at the
// time limit (or last-horse-standing, if sooner) is whoever held it longest —
// not necessarily whoever has it at the final whistle.
export const ROYAL_HORSE_TIME_LIMIT = 120; // seconds
export const CROWN_TRANSFER_COOLDOWN = 1.0; // seconds — stops flicker during a sustained overlap
export const CROWN_PICKUP_RADIUS = HORSE_R;

export const QUICK_REACTIONS = ['😂', '😮', '🔥', '😭', '👏', '💀'];

// Pre-battle sequence timing, shared so the server knows how long to hold the sim
// frozen while the client plays the VS splash + "3, 2, 1, FIGHT!" countdown.
export const VS_SPLASH_MS = 1800;
export const COUNTDOWN_STEP_MS = 600; // 4 steps: 3, 2, 1, FIGHT!
export const PRE_BATTLE_DELAY_MS = VS_SPLASH_MS + COUNTDOWN_STEP_MS * 4;

// Two stats per horse theme — a speed/toughness trade-off so picking a horse is
// more than cosmetic. Multipliers apply to base horse speed and base MAX_HP.
export const THEMES = [
  { name: "Bronco Brown",  body:"#8a5a34", shade:"#6b4326", mane:"#3a2a1c", accent:"#c98b3b", accessory:"blaze",   speedMult: 1.00, hpMult: 1.00 },
  { name: "Midnight",      body:"#2b2733", shade:"#1c1922", mane:"#0f0d12", accent:"#8c7fae", accessory:"blaze",   speedMult: 1.15, hpMult: 0.85 },
  { name: "Snow Drift",    body:"#eee6d6", shade:"#cabfa8", mane:"#a89b7c", accent:"#6b5c3f", accessory:"spots",   speedMult: 1.00, hpMult: 1.00 },
  { name: "Zebra Stripe",  body:"#eee6d6", shade:"#cabfa8", mane:"#22201f", accent:"#22201f", accessory:"stripes", speedMult: 0.85, hpMult: 1.20 },
  { name: "Palomino Gold", body:"#d8a24a", shade:"#b7842f", mane:"#f4ead2", accent:"#f4ead2", accessory:"blaze",   speedMult: 1.15, hpMult: 0.85 },
  { name: "Chestnut Red",  body:"#8c3f2a", shade:"#6b2e1d", mane:"#3a1c14", accent:"#d9603f", accessory:"bandana", speedMult: 0.85, hpMult: 1.20 },
  { name: "Dapple Grey",   body:"#8f95a3", shade:"#6d7280", mane:"#41454e", accent:"#c8ccd6", accessory:"spots",   speedMult: 0.85, hpMult: 1.20 },
  { name: "Rainbow Mane",  body:"#c9c2d6", shade:"#a79fbf", mane:"#e35d7a", accent:"#5bb0c9", accessory:"hat",     speedMult: 1.15, hpMult: 0.85 }
];

// Purely cosmetic — picked on the horse-select screen, no unlock required.
export const HAT_TYPES = [
  { id: 'none', label: 'No Hat' },
  { id: 'topHat', label: 'Top Hat' },
  { id: 'cowboy', label: 'Cowboy Hat' },
  { id: 'beanie', label: 'Beanie' },
  { id: 'flower', label: 'Flower Crown' },
  { id: 'pirate', label: 'Pirate Hat' }
];

export function archetypeLabel(theme) {
  if (theme.speedMult > 1.05) return '⚡ Swift';
  if (theme.hpMult > 1.05) return '🛡 Sturdy';
  return '⚖ Balanced';
}
