// Central tuning values for Phase 0/1 (physics feel).
// Later phases will move board sizing into progression state (Section 4 of PRD)
// rather than fixed constants.

// Logical board resolution — all peg/slot layout is computed against this
// space, never against the actual window size. The canvas is scaled
// (letterboxed, aspect-ratio preserved) via CSS to fit the viewport, so
// resizing the *window* changes display size only, never peg spacing.
// The board is a fixed size for the entire game (no Bigger Board upgrade —
// removed per playtest feedback: growing the board by adding rows made it
// *easier* to route toward a peg since a smaller board has fewer pegs to
// route through, the opposite of the intended difficulty curve).
// Board shrunk ~50% (playtest feedback: 16x16/248 pegs packed this tight
// read as visual noise) — fewer, larger, more spaced-out pegs.
export const BOARD_WIDTH = 704;

export const COLS = 11;
export const ROWS = 11;

export const PEG_ROW_SPACING = 64;
export const BOARD_MARGIN_X = 32;
export const BOARD_MARGIN_TOP = 90;
// Bottom margin is split into two pieces (playtest feedback: the pockets
// sat right up against the last peg row) — POCKET_GAP is dead space so the
// last row of pegs and the pockets read as clearly separate zones, and
// POCKET_HEIGHT is the pocket/divider area itself.
export const POCKET_GAP = 70;
export const POCKET_HEIGHT = 110;
export const BOARD_MARGIN_BOTTOM = POCKET_GAP + POCKET_HEIGHT;

export const BOARD_HEIGHT =
  BOARD_MARGIN_TOP + (ROWS - 1) * PEG_ROW_SPACING + BOARD_MARGIN_BOTTOM;

export const PEG_RADIUS = 9; // bigger now that there are far fewer pegs
export const PEG_OUTLINE_WIDTH = 2; // was 1 — pegs were hard to distinguish
export const BALL_RADIUS = 11;

export const WALL_THICKNESS = 20;
export const SLOT_COUNT = 10;

// Offset rows (COLS-1 pegs, shifted half a column) leave a triangular gap
// between the wall and the row's nearest peg that a ball can slide straight
// down through untouched. A small static wedge bumper fills that corner —
// flat edge flush against the wall, point aimed inward at the first peg on
// that row (playtest feedback).
export const BUMPER_GAP_WIDTH = BOARD_MARGIN_X;
export const BUMPER_HALF_HEIGHT = PEG_ROW_SPACING / 2;
export const BUMPER_COLOR = "#3a3a52"; // matches the slot dividers

// Restitution/friction tuned for a readable, slightly bouncy feel —
// adjust once playtesting starts.
export const PEG_RESTITUTION = 0.55;
export const PEG_FRICTION = 0.05;

// Lighter gravity + bouncier/slipperier ball so drops read as lively
// bounces off pegs rather than a heavy ball plowing straight down
// (playtest feedback: "balls feel too heavy").
export const GRAVITY_Y = 0.7; // was 1 (Matter's default)
export const BALL_RESTITUTION = 0.6; // was 0.45
export const BALL_FRICTION = 0.01; // was 0.02 — less energy lost per peg hit
export const BALL_FRICTION_AIR = 0.0005; // was 0.001 — keeps momentum longer
export const BALL_DENSITY = 0.012; // was 0.02 — lighter mass

// Small randomized jitter on spawn X to prevent frame-perfect "solved"
// drop spots per the PRD's determinism note (Section 3).
export const SPAWN_JITTER = 4;

// --- Phase 2/6: hopper + ball supply -------------------------------------

// Hopper sweeps back and forth along the top edge (PRD Section 2, step 1).
// Bounds match the peg grid's usable width so every drop position is over
// pegs, not the walls.
export const HOPPER_Y = 30;
export const HOPPER_MARGIN = 40;
export const HOPPER_SPEED = 260; // px/sec in board space
export const HOPPER_WIDTH = 56;
export const HOPPER_HEIGHT = 20;

// --- Phase 3: currency & scoring ----------------------------------------

// Only a sparse set of pegs pay currency ("Money" pegs, rendered green) —
// the rest of the board is pure bounce-shaping with no payout. This keeps
// the board readable (not every peg popping "+N") and makes routing toward
// a specific peg matter, rather than every bounce path earning about the
// same. Money pegs are pre-seeded deterministically (not player-placed —
// that's the Phase 5 special-peg system).
export const MONEY_PEG_VALUE = 8;
export const MONEY_PEG_ROW_INTERVAL = 2; // one money-peg row every N rows
export const MONEY_PEG_ROW_OFFSET = 1; // which row in each interval hosts one

// Deterministic pseudo-random column pick for a given row, stable across
// rebuilds (same seed always produces the same result) so growing the
// board doesn't reshuffle already-placed money pegs.
export function seededIndex(seed, max) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  const frac = x - Math.floor(x);
  return Math.floor(frac * max);
}

// Landing pockets pay a flat amount, same across every slot. The original
// position-weighted V-curve (edges pay more) was tuned for a classic
// triangle-shaped board, where a peg funnels balls toward center — this
// board is full-width/edge-to-edge from the start (PRD Section 4), so that
// skew doesn't reflect real landing odds here. SLOT_VALUE_CURVE is kept as
// a per-slot multiplier hook (all 1s = flat) in case position-weighting
// comes back once board shape/funneling is revisited. Must have exactly
// SLOT_COUNT entries.
export const BASE_SLOT_VALUE = 1;
export const SLOT_VALUE_CURVE = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

// --- Phase 6: round structure ---------------------------------------------
// Each round gives the player a fixed allotment of ball drops to reach a
// money goal (PRD Section 8) — not a timer-gated queue. Passing advances to
// the next round on the *same* board (layout + special pegs carry over),
// only the goal increases. Failing ends the run: currency, special peg
// placements, and shop upgrade levels all reset (no meta-layer/persistence
// yet — that's a later phase) — see PRD Section 8's "what resets on run end".
export const BALLS_PER_ROUND = 10;
export const ROUND_BASE_GOAL = 30;
export const ROUND_GOAL_GROWTH = 1.4;

export function roundGoal(roundNumber) {
  return Math.round(ROUND_BASE_GOAL * Math.pow(ROUND_GOAL_GROWTH, roundNumber - 1));
}

// How long the pass/fail banner stays up before the next round starts (or
// the run resets), giving the player a moment to read the outcome.
export const ROUND_END_BANNER_MS = 2200;
// Reward chest banner stays up a bit longer than a plain pass/fail — there's
// more to read (the peg rewards).
export const REWARD_CHEST_BANNER_MS = 3400;

// Reward chest (round-pass reward, PRD-adjacent addition): 1-3 random
// special pegs added straight to inventory for free, no cost. Higher counts
// are rarer — a 3-peg chest should feel like a jackpot, not the norm.
export const REWARD_CHEST_COUNT_WEIGHTS = [
  { count: 1, weight: 60 },
  { count: 2, weight: 30 },
  { count: 3, weight: 10 },
];

// --- Phase 4: shop system -------------------------------------------------
// Always-open, no gating (PRD Section 5). Cost curves are mild exponential
// so each upgrade stays a meaningful sink across a run rather than being
// maxed out in the first few minutes (PRD Section 4). No Bigger Board
// upgrade — the board is a fixed size for the entire game (see top of file).
// No Faster Balls either — ball supply is a fixed per-round allotment now
// (Phase 6), not a timer, so "faster generation" no longer means anything.

function costCurve(base, growth) {
  return (level) => Math.round(base * Math.pow(growth, level));
}

// Extra Balls — increases the per-round ball allotment. Capped for the
// ball-ball collision / performance budget (PRD Section 3, 10) and so a
// round can't become trivially long.
export const EXTRA_BALLS_MAX = 10;
export const extraBallsCost = costCurve(50, 1.4);

// --- Phase 5/10: special pegs ----------------------------------------------
// Each type is bought once per copy in the shop, then placed onto an
// existing structural peg on the board ("place mode" — PRD Section 5/6).
// Not player-placed onto Money pegs (a separate, pre-seeded income layer —
// see Phase 3 notes above) or onto a peg that's already special. Phase 5
// shipped the simplest, most physics-native, best early-game teaching
// tools (Bounce, Multiplier, Freeze); Phase 10 adds three more with more
// varied interactions — Magnet (continuous pull), Ghost (one free pass),
// Splitter (duplicates the ball, capped) — per PRD Section 6/12. Portal,
// Explosive, Gravity Well, Locked, and Sonar remain deferred post-launch
// content: Portal/Sonar need a "linked peg" or "trigger other pegs" concept
// this system doesn't have yet, Explosive is explicitly late-game-gated
// content with no tiering system to gate it behind yet, Gravity Well is
// redundant with Magnet (same pull mechanic, opposite framing), and Locked
// needs a "random other special type" concept that's more content-design
// than a straightforward physics/economy addition.
// Cost scales per-type with how many of that type are already placed.
// Each also carries a glossy-sphere material recipe (Phase 9 art pass —
// PRD Section 11): material/finish is the primary way special pegs read
// as distinct at a glance. `light`/`dark` are the gradient's highlight/
// shadow stops around `color` as the base; `matte` softens and dims the
// specular highlight (rubber, frost); `metallic` adds a second, sharper
// highlight point (polished gold).
export const SPECIAL_PEG_TYPES = {
  bounce: {
    label: "Bounce",
    desc: "Super-charged restitution — a wild pinball-bumper bounce",
    color: "#6fd3ff",
    stroke: "#2a8fc4",
    flashColor: "#e4f9ff",
    cost: costCurve(60, 1.4),
    // matte rubber sphere (PRD Section 11)
    light: "#a8e6ff",
    dark: "#1f6f96",
    specular: "rgba(255,255,255,0.4)",
    matte: true,
  },
  multiplier: {
    label: "Multiplier",
    desc: "×2 currency for the rest of that ball's fall",
    color: "#d9a6ff",
    stroke: "#8b4fc9",
    flashColor: "#f6e9ff",
    cost: costCurve(90, 1.45),
    // gold-plated metal (PRD Section 11) — reusing the purple hue family
    // but rendered with a sharp metallic double-highlight
    light: "#f0d4ff",
    dark: "#5a2e85",
    specular: "#ffffff",
    metallic: true,
  },
  freeze: {
    label: "Freeze",
    desc: "Dramatically slows the ball on contact",
    color: "#9fe8ff",
    stroke: "#3fa6c9",
    flashColor: "#ffffff",
    cost: costCurve(70, 1.4),
    // frosted ice (PRD Section 11) — soft diffuse highlight + frost sparkle
    light: "#ffffff",
    dark: "#5fa8bc",
    specular: "rgba(255,255,255,0.55)",
    matte: true,
    frost: true,
  },
  magnet: {
    label: "Magnet",
    desc: "Gently pulls nearby balls toward it as they pass",
    color: "#ff8a6b",
    stroke: "#a8431f",
    flashColor: "#ffd4c2",
    cost: costCurve(75, 1.4),
    // brushed warm metal
    light: "#ffc4a8",
    dark: "#7a2c10",
    specular: "#ffffff",
    metallic: true,
  },
  ghost: {
    label: "Ghost",
    desc: "A ball passes through it once for free, then acts normal",
    color: "#dce6f0",
    stroke: "#8fa0b8",
    flashColor: "#ffffff",
    cost: costCurve(65, 1.4),
    // pale, semi-translucent shimmer
    light: "#ffffff",
    dark: "#7a8aa0",
    specular: "rgba(255,255,255,0.7)",
    alpha: 0.6,
    matte: true,
  },
  splitter: {
    label: "Splitter",
    desc: "Duplicates the ball into two lighter balls on hit",
    color: "#ff9d3f",
    stroke: "#b25a0a",
    flashColor: "#ffe3bf",
    cost: costCurve(100, 1.5),
    light: "#ffcf94",
    dark: "#7a3f06",
    specular: "#ffffff",
  },
};

// >1 restitution actually injects energy on each bounce — deliberate here
// per playtest feedback ("make the bouncy peg MUCH more bouncy"), it should
// feel like a pinball bumper, not just "livelier than normal."
export const BOUNCE_PEG_RESTITUTION = 1.4;
export const MULTIPLIER_PEG_FACTOR = 2;
export const FREEZE_PEG_SLOW_FACTOR = 0.15;

// Magnet — a small, capped-radius continuous pull on any ball passing near
// (PRD Section 6: "needs a capped pull radius to stay readable").
export const MAGNET_RADIUS = 90;
export const MAGNET_STRENGTH = 0.0009;

// Ghost — a ball passes through for free once per Ghost peg, then it's
// solid again for that same ball (PRD Section 6).
export const GHOST_MAX_FREE_PASSES = 1;

// Splitter — duplicates the ball into two lighter/smaller balls on hit,
// capped so it can't runaway-multiply into a performance problem (PRD
// Section 6, Section 3, Section 10).
export const SPLIT_BALL_RADIUS_FACTOR = 0.7;
export const SPLIT_BALL_DENSITY_FACTOR = 0.6;
export const SPLIT_LAUNCH_KICK = 2.5; // px/step sideways separation
export const MAX_CONCURRENT_BALLS = 24;

// How close (board px) a placement tap needs to land to a peg to target it.
export const PLACEMENT_TAP_RADIUS = 24;


// --- Phase 7: meta-progression + persistence (PRD Section 8, 10) ---------
// Persistent, cross-run unlocks via achievements/goals rather than in-run
// currency spend — separate from the reset-each-run shop economy. Also:
// run state (currency, round, special peg placements) survives a page
// refresh, and meta state (lifetime stats, unlocked achievements) survives
// a run failing, since it's not part of what a run reset clears.
export const META_STORAGE_KEY = "plinko_meta_v1";
export const RUN_STORAGE_KEY = "plinko_run_v1";

// Kept small and tied to systems that already exist — the PRD's example
// unlocks (new special peg types, new boards) are explicitly deferred
// post-launch content (Section 12), so v1 achievements grant permanent
// bonuses to the existing economy instead of gating new content.
export const ACHIEVEMENTS = [
  {
    id: "round3",
    label: "Reach Round 3",
    reward: "+1 starting ball every run",
    bonusBalls: 1,
    requirement: (meta) => meta.bestRound >= 3,
  },
  {
    id: "round5",
    label: "Reach Round 5",
    reward: "+20 starting currency every run",
    bonusCurrency: 20,
    requirement: (meta) => meta.bestRound >= 5,
  },
  {
    id: "lifetime300",
    label: "Earn 300 lifetime currency",
    reward: "+1 starting ball every run",
    bonusBalls: 1,
    requirement: (meta) => meta.lifetimeCurrency >= 300,
  },
];

// --- Phase 8: special events (PRD Section 7) ------------------------------
// Hit-count trigger model: a normal-looking peg silently counts hits: on
// reaching a threshold it fires an event and resets. (The other PRD model —
// a spawned event peg with a limited lifetime window — is deferred; the
// hit-count model is simpler to get right first and validates the event
// system before adding more.) Trigger pegs are deliberately NOT visually
// distinct (that's the point of "silently") — the event's own on-trigger
// state is what needs to read clearly, per Section 7's design intent.
export const EVENT_TRIGGERS = [
  { id: "goldenBall", row: 4, hitsNeeded: 15 },
  { id: "pegFrenzy", row: 10, hitsNeeded: 20 },
];

// Deterministic column pick for a trigger row — a different seed offset
// than seededIndex(row, ...) (used for Money pegs) so the two systems don't
// collide by coincidence, though it's harmless if they land on the same
// peg (a trigger just silently counts hits regardless of what else that
// peg is).
export function eventTriggerCol(row, max) {
  return seededIndex(row * 31 + 17, max);
}

// Golden Ball — the next ball dropped pays out on *every* peg it touches,
// not just Money pegs, for the rest of its fall.
export const GOLDEN_BALL_PEG_VALUE = 3;
export const GOLDEN_BALL_COLOR = "#ffd23f";
export const GOLDEN_BALL_STROKE = "#c98f0a";

// Peg Frenzy — every structural/Money peg (not player-placed special pegs)
// temporarily gets Bounce's restitution, for a limited time.
export const PEG_FRENZY_DURATION_MS = 15000;
export const PEG_FRENZY_COLOR = "#6fd3ff"; // matches the Bounce special peg
export const PEG_FRENZY_STROKE = "#2a8fc4";

// --- Phase 9: art pass — glossy pre-rendered-sprite look (PRD Section 11) -
// Real ray-traced/Gouraud-shaded pre-rendered sprites aren't produceable
// here without an image pipeline, so pegs/ball are instead drawn with
// layered canvas gradients: a base radial gradient (light->base->dark) plus
// a specular highlight, which reads as the same "glossy 3D sphere flattened
// to 2D" family of look the PRD describes, entirely in vector draw calls.
// Muted vs. the original near-white/high-gloss look (playtest feedback:
// 248 bright glossy pegs packed tightly read as jarring) — softer color,
// dimmer highlight, less contrast against the board and each other.
export const STRUCTURAL_PEG_MATERIAL = {
  color: "#a49c8c",
  light: "#c9c2b2",
  dark: "#5c564a",
  specular: "rgba(255,255,255,0.3)",
  flashColor: "#f4f0e6",
  matte: true,
};

export const MONEY_PEG_MATERIAL = {
  color: "#4fbb75",
  light: "#baf5cf",
  dark: "#1c6b3d",
  specular: "#ffffff",
  flashColor: "#ffe28a",
};

// Peg Frenzy temporarily reuses Bounce's rubber-sphere look for every
// structural peg it boosts (matches "all pegs become Bounce pegs").
export const FRENZY_PEG_MATERIAL = SPECIAL_PEG_TYPES.bounce;

export const STEEL_BALL_MATERIAL = {
  color: "#b6bac6",
  light: "#ffffff",
  dark: "#454955",
  specular: "#ffffff",
  metallic: true,
};

export const GOLD_BALL_MATERIAL = {
  color: GOLDEN_BALL_COLOR,
  light: "#fff3c4",
  dark: "#8a5c08",
  specular: "#ffffff",
  metallic: true,
};
