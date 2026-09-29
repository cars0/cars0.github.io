// Plinko Roguelite — Phase 0-10: scaffold + core physics + hopper/drop +
// currency & scoring + shop + special pegs + round structure + meta-
// progression + special events + art pass. Static peg grid, gravity/
// restitution/momentum-driven balls (drawn as glossy gradient spheres, not
// flat fills — Phase 9), landing slots, a hopper that sweeps along the top
// edge, a currency economy (sparse pre-seeded Money pegs + a flat slot
// payout), an always-open shop (Extra Balls + special pegs), a round
// structure (PRD Section 8: a fixed number of ball drops per round to reach
// a money goal — pass advances to the next round on the same board with a
// higher goal, fail resets the run), meta-progression (PRD Section 8/10:
// achievements permanently raise the starting state, run/meta state
// persist across a refresh/run-fail), special events (PRD Section 7: silent
// hit-count trigger pegs fire Golden Ball or Peg Frenzy), and six special
// peg types (PRD Section 6): Bounce, Multiplier, Freeze (Phase 5), plus
// Magnet, Ghost, Splitter (Phase 10).

import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  ROWS,
  COLS,
  PEG_ROW_SPACING,
  BOARD_MARGIN_X,
  BOARD_MARGIN_TOP,
  BOARD_MARGIN_BOTTOM,
  POCKET_GAP,
  POCKET_HEIGHT,
  BUMPER_GAP_WIDTH,
  BUMPER_HALF_HEIGHT,
  BUMPER_COLOR,
  PEG_RADIUS,
  BALL_RADIUS,
  WALL_THICKNESS,
  SLOT_COUNT,
  PEG_RESTITUTION,
  PEG_FRICTION,
  GRAVITY_Y,
  BALL_RESTITUTION,
  BALL_FRICTION,
  BALL_FRICTION_AIR,
  BALL_DENSITY,
  SPAWN_JITTER,
  HOPPER_Y,
  HOPPER_MARGIN,
  HOPPER_SPEED,
  HOPPER_WIDTH,
  HOPPER_HEIGHT,
  MONEY_PEG_VALUE,
  MONEY_PEG_ROW_INTERVAL,
  MONEY_PEG_ROW_OFFSET,
  seededIndex,
  BASE_SLOT_VALUE,
  SLOT_VALUE_CURVE,
  BALLS_PER_ROUND,
  roundGoal,
  ROUND_END_BANNER_MS,
  REWARD_CHEST_BANNER_MS,
  REWARD_CHEST_COUNT_WEIGHTS,
  EXTRA_BALLS_MAX,
  extraBallsCost,
  SPECIAL_PEG_TYPES,
  BOUNCE_PEG_RESTITUTION,
  MULTIPLIER_PEG_FACTOR,
  FREEZE_PEG_SLOW_FACTOR,
  MAGNET_RADIUS,
  MAGNET_STRENGTH,
  GHOST_MAX_FREE_PASSES,
  SPLIT_BALL_RADIUS_FACTOR,
  SPLIT_BALL_DENSITY_FACTOR,
  SPLIT_LAUNCH_KICK,
  MAX_CONCURRENT_BALLS,
  PLACEMENT_TAP_RADIUS,
  META_STORAGE_KEY,
  RUN_STORAGE_KEY,
  ACHIEVEMENTS,
  EVENT_TRIGGERS,
  eventTriggerCol,
  GOLDEN_BALL_PEG_VALUE,
  GOLDEN_BALL_COLOR,
  PEG_FRENZY_DURATION_MS,
  STRUCTURAL_PEG_MATERIAL,
  MONEY_PEG_MATERIAL,
  FRENZY_PEG_MATERIAL,
  STEEL_BALL_MATERIAL,
  GOLD_BALL_MATERIAL,
} from "./config.js";

const { Engine, Render, Runner, Bodies, Body, World, Events, Composite } =
  Matter;

const canvas = document.getElementById("board");
const debugEl = document.getElementById("debug");
const currencyEl = document.getElementById("currency-value");
const currencyBadgeEl = document.getElementById("currency");
const dropBtn = document.getElementById("drop-btn");
const queuePipsEl = document.getElementById("queue-pips");
const shopToggleBtn = document.getElementById("shop-toggle");
const shopCloseBtn = document.getElementById("shop-close");
const shopBackdropEl = document.getElementById("shop-backdrop");
const shopItemsSpecialEl = document.getElementById("shop-items-special");
const placementBannerEl = document.getElementById("placement-banner");
const placementTextEl = document.getElementById("placement-text");
const placementCancelBtn = document.getElementById("placement-cancel");
const roundLabelEl = document.getElementById("round-label");
const roundGoalFillEl = document.getElementById("round-goal-fill");
const roundGoalTextEl = document.getElementById("round-goal-text");
const roundEndBannerEl = document.getElementById("round-end-banner");
const roundEndTitleEl = document.getElementById("round-end-title");
const roundEndDetailEl = document.getElementById("round-end-detail");
const roundEndChestEl = document.getElementById("round-end-chest");
const progressToggleBtn = document.getElementById("progress-toggle");
const progressCloseBtn = document.getElementById("progress-close");
const progressBackdropEl = document.getElementById("progress-backdrop");
const statBestRoundEl = document.getElementById("stat-best-round");
const statLifetimeCurrencyEl = document.getElementById("stat-lifetime-currency");
const statRunsEl = document.getElementById("stat-runs");
const achievementListEl = document.getElementById("achievement-list");
const achievementToastEl = document.getElementById("achievement-toast");
const achievementToastDetailEl = document.getElementById("achievement-toast-detail");
const eventBannerEl = document.getElementById("event-banner");
const eventBannerTextEl = document.getElementById("event-banner-text");
const settingsToggleBtn = document.getElementById("settings-toggle");
const settingsCloseBtn = document.getElementById("settings-close");
const settingsBackdropEl = document.getElementById("settings-backdrop");
const resetProgressBtn = document.getElementById("reset-progress-btn");
const resetConfirmEl = document.getElementById("reset-confirm");
const resetCancelBtn = document.getElementById("reset-cancel-btn");
const resetConfirmBtn = document.getElementById("reset-confirm-btn");
const inventoryTrayEl = document.getElementById("inventory-tray");
const inventoryItemsEl = document.getElementById("inventory-items");

let engine, world, render, runner;
let pegs = [];
let slotSensors = [];

// Board layout is always computed against this fixed logical space — never
// against window.innerWidth/Height — so peg spacing is stable regardless of
// viewport size. CSS scales the canvas display size to fit. Both dimensions
// are fixed for the entire game — see BOARD_WIDTH/BOARD_HEIGHT in config.js.
const boardWidth = BOARD_WIDTH;
const boardHeight = BOARD_HEIGHT;

// --- Phase 3 state: currency economy ---
let currency = 0;
let popups = []; // floating "+N" text: {x, y, value, born, color}

// --- Phase 2 state: hopper sweep ---
const hopperMinX = HOPPER_MARGIN;
const hopperMaxX = boardWidth - HOPPER_MARGIN;
let hopperX = boardWidth / 2;
let hopperDir = 1; // 1 = moving right, -1 = moving left

// --- Phase 6 state: round structure (PRD Section 8) ---
let roundNumber = 1;
let roundEarnings = 0; // currency earned *this round* — compared to the goal
let extraBallsLevel = 0; // Extra Balls shop upgrade, resets on run fail
let ballsRemaining = BALLS_PER_ROUND; // this round's remaining drops
let roundTransitioning = false; // true while the pass/fail banner is showing

// --- Phase 5/11 state: special pegs (bought into inventory, then placed
// onto a board peg whenever — tap to arm, or drag straight from the
// inventory tray) ---
const placedCounts = Object.fromEntries(
  Object.keys(SPECIAL_PEG_TYPES).map((type) => [type, 0])
);
const inventory = Object.fromEntries(
  Object.keys(SPECIAL_PEG_TYPES).map((type) => [type, 0])
);
let activePlacement = null; // { type } while armed, else null
// Placements tracked by "row,col" grid key (not by Body reference) so they
// survive buildBoard() recreating every peg body (e.g. a run reset).
const placedSpecialPegs = new Map();

// --- Phase 7 state: meta-progression (persists across run resets/refresh) ---
let meta = { bestRound: 1, lifetimeCurrency: 0, runsCompleted: 0, unlocked: {} };

// --- Phase 8 state: special events (PRD Section 7) ---
// Hit counts for the silent hit-count trigger pegs; resets on run fail.
const triggerHitCounts = Object.fromEntries(EVENT_TRIGGERS.map((t) => [t.id, 0]));
let goldenBallPending = false; // next ball dropped will be golden
let frenzyActive = false;
let frenzyEndTime = 0;
let frenzyTimeout = null;

function init() {
  meta = loadMeta();

  engine = Engine.create();
  world = engine.world;
  world.gravity.y = GRAVITY_Y;

  render = Render.create({
    canvas,
    engine,
    options: {
      width: boardWidth,
      height: boardHeight,
      wireframes: false,
      background: "transparent",
      pixelRatio: window.devicePixelRatio || 1,
    },
  });

  // CSS (not Matter's inline styles) owns the on-screen scaling — let the
  // canvas size itself to its intrinsic aspect ratio via #board-wrap.
  canvas.style.width = "auto";
  canvas.style.height = "auto";

  // Restore a saved-in-progress run (survives a page refresh — PRD Section
  // 10) if one exists; otherwise start fresh with this run's meta bonuses
  // applied to the starting state (PRD Section 8: achievements raise the
  // "meta-layer's current starting state" a run resets back to).
  if (!loadRunState()) {
    currency = metaBonusCurrency();
    ballsRemaining = BALLS_PER_ROUND + metaBonusBalls();
  }
  currencyEl.textContent = currency; // HUD default is a hardcoded "0" in the HTML

  buildBoard(); // reads placedSpecialPegs, already populated if a run was restored

  runner = Runner.create();
  Runner.run(runner, engine);
  Render.run(render);

  Events.on(engine, "collisionStart", handleCollisions);
  Events.on(engine, "beforeUpdate", onBeforeUpdate);
  Events.on(render, "afterRender", drawOverlay);

  dropBtn.addEventListener("click", onDropPressed);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      onDropPressed();
    }
  });

  shopToggleBtn.addEventListener("click", () => setShopOpen(true));
  shopCloseBtn.addEventListener("click", () => setShopOpen(false));
  shopBackdropEl.addEventListener("click", () => setShopOpen(false));
  document.querySelectorAll(".buy-btn").forEach((btn) => {
    btn.addEventListener("click", () => onBuyPressed(btn.dataset.upgrade));
  });

  buildSpecialShopItems();
  canvas.addEventListener("click", onCanvasClick);
  placementCancelBtn.addEventListener("click", cancelPlacement);

  progressToggleBtn.addEventListener("click", () => setProgressOpen(true));
  progressCloseBtn.addEventListener("click", () => setProgressOpen(false));
  progressBackdropEl.addEventListener("click", () => setProgressOpen(false));

  settingsToggleBtn.addEventListener("click", () => setSettingsOpen(true));
  settingsCloseBtn.addEventListener("click", () => setSettingsOpen(false));
  settingsBackdropEl.addEventListener("click", () => setSettingsOpen(false));
  resetProgressBtn.addEventListener("click", () => resetConfirmEl.classList.add("show"));
  resetCancelBtn.addEventListener("click", () => resetConfirmEl.classList.remove("show"));
  resetConfirmBtn.addEventListener("click", eraseAllProgress);

  renderQueuePips();
  refreshShopUI();
  updateRoundHUD();
  renderAchievements();
  updateProgressStats();
  renderInventory();
  tickDebug();
}

function buildBoard() {
  Composite.clear(world, false);
  pegs = [];
  slotSensors = [];

  const wallOpts = { isStatic: true, render: { fillStyle: "#2a2a3d" } };

  // left/right walls
  World.add(world, [
    Bodies.rectangle(
      -WALL_THICKNESS / 2,
      boardHeight / 2,
      WALL_THICKNESS,
      boardHeight * 2,
      wallOpts
    ),
    Bodies.rectangle(
      boardWidth + WALL_THICKNESS / 2,
      boardHeight / 2,
      WALL_THICKNESS,
      boardHeight * 2,
      wallOpts
    ),
  ]);

  // peg grid — full-width coverage, offset rows for classic plinko stagger.
  // Board size (rows/cols) is fixed for the entire game — see BOARD_WIDTH/
  // BOARD_HEIGHT/ROWS/COLS in config.js.
  const usableWidth = boardWidth - BOARD_MARGIN_X * 2;
  const colSpacing = usableWidth / (COLS - 1);

  for (let row = 0; row < ROWS; row++) {
    const isOffsetRow = row % 2 === 1;
    const rowCols = isOffsetRow ? COLS - 1 : COLS;

    // Sparse, pre-seeded "Money" pegs — deterministic per row so the same
    // board keeps the same money-peg positions across rebuilds (Bigger
    // Board only adds new ones in new rows, never reshuffles old ones).
    const isMoneyRow = row % MONEY_PEG_ROW_INTERVAL === MONEY_PEG_ROW_OFFSET;
    const moneyCol = isMoneyRow ? seededIndex(row, rowCols) : -1;

    // Hit-count event trigger pegs (PRD Section 7) — deliberately normal-
    // looking (no render difference), silently counted in handleCollisions.
    const trigger = EVENT_TRIGGERS.find((t) => t.row === row);
    const triggerCol = trigger ? eventTriggerCol(row, rowCols) : -1;
    const rowY = BOARD_MARGIN_TOP + row * PEG_ROW_SPACING;

    for (let col = 0; col < rowCols; col++) {
      const x =
        BOARD_MARGIN_X +
        col * colSpacing +
        (isOffsetRow ? colSpacing / 2 : 0);
      const y = rowY;

      const isMoney = col === moneyCol;

      // Re-apply any special peg the player already placed at this grid
      // position — buildBoard() recreates every peg body from scratch if
      // it's ever called again (e.g. a future run reset), so placements
      // are tracked by grid coordinate (placedSpecialPegs) and replayed
      // here rather than living only on the old, discarded Body instances.
      const special = placedSpecialPegs.get(`${row},${col}`) || null;

      // render.visible: false — pegs are drawn ourselves (drawPegs, in the
      // afterRender overlay) with a layered-gradient glossy-sphere look
      // (Phase 9 art pass) instead of Matter's flat fill/stroke.
      const peg = Bodies.circle(x, y, PEG_RADIUS, {
        isStatic: true,
        label: "peg",
        render: { visible: false },
      });
      // Matter.js quirk: passing restitution/friction in the SAME options
      // object as isStatic:true silently resets them (isStatic's internal
      // handling clobbers them back to Matter's defaults — restitution 0,
      // friction 1). Set them as direct property assignments after
      // creation instead, or they're silently ignored.
      peg.restitution = special === "bounce" ? BOUNCE_PEG_RESTITUTION : PEG_RESTITUTION;
      peg.friction = PEG_FRICTION;
      peg.isMoney = isMoney;
      peg.special = special;
      peg.eventTrigger = col === triggerCol ? trigger.id : null;
      peg.gridRow = row;
      peg.gridCol = col;
      peg._frenzyActive = false;
      peg._flashUntil = 0;
      peg._flashColor = null;
      pegs.push(peg);
      World.add(world, peg);
    }

    // Offset rows are inset from both walls, leaving a triangular gap a
    // ball can slide straight through untouched (playtest feedback). A
    // wedge bumper — flat edge flush against the wall, point aimed at the
    // row's nearest peg — fills it.
    if (isOffsetRow) {
      World.add(world, makeWallBumper(rowY, "left"));
      World.add(world, makeWallBumper(rowY, "right"));
    }
  }

  // landing slots at the bottom — thin static dividers + sensor zones.
  // POCKET_GAP is dead space above the pockets so the last peg row and the
  // pockets read as clearly separate zones (playtest feedback).
  const slotWidth = boardWidth / SLOT_COUNT;
  const pocketTop = BOARD_MARGIN_TOP + (ROWS - 1) * PEG_ROW_SPACING + POCKET_GAP;
  const slotY = pocketTop + POCKET_HEIGHT / 2;
  const dividerOpts = {
    isStatic: true,
    render: { fillStyle: "#3a3a52" },
  };

  for (let i = 0; i <= SLOT_COUNT; i++) {
    const x = i * slotWidth;
    World.add(
      world,
      Bodies.rectangle(x, slotY, 6, POCKET_HEIGHT, dividerOpts)
    );
  }

  for (let i = 0; i < SLOT_COUNT; i++) {
    const x = i * slotWidth + slotWidth / 2;
    const sensor = Bodies.rectangle(x, boardHeight - 10, slotWidth - 6, 20, {
      isStatic: true,
      isSensor: true,
      label: `slot-${i}`,
      render: { fillStyle: "rgba(255,255,255,0.05)" },
    });
    // position-weighted payout (PRD Section 9) — edges pay more since
    // momentum makes them harder to reach than the center
    sensor.slotValue = Math.round(BASE_SLOT_VALUE * SLOT_VALUE_CURVE[i]);
    sensor.slotCenterX = x;
    slotSensors.push(sensor);
    World.add(world, sensor);
  }

  // floor sensor as a safety net below slots (catches anything that slips through)
  World.add(
    world,
    Bodies.rectangle(boardWidth / 2, boardHeight + 20, boardWidth * 2, 40, {
      isStatic: true,
      isSensor: true,
      label: "floor",
    })
  );
}

// A small triangular wedge, flat edge flush against a wall, point aimed
// inward — fills the corner gap an offset row's inset pegs leave open
// (playtest feedback). Bodies.fromVertices centers the body on the
// centroid of the vertex set, not vertex (0,0), so the placement math
// below solves for the (cx, cy) that lands the flat edge exactly on the
// wall (x=0 for the left wall, x=boardWidth for the right).
function makeWallBumper(y, side) {
  const dir = side === "left" ? 1 : -1;
  const wallX = side === "left" ? 0 : boardWidth;
  const localVerts = [
    { x: 0, y: -BUMPER_HALF_HEIGHT },
    { x: 0, y: BUMPER_HALF_HEIGHT },
    { x: dir * BUMPER_GAP_WIDTH, y: 0 },
  ];
  const centroidX = (localVerts[0].x + localVerts[1].x + localVerts[2].x) / 3;
  const cx = wallX + centroidX;

  const bumper = Bodies.fromVertices(
    cx,
    y,
    [localVerts],
    {
      isStatic: true,
      label: "bumper",
      render: { fillStyle: BUMPER_COLOR, strokeStyle: "#4a4a68", lineWidth: 1 },
    },
    true
  );
  bumper.restitution = PEG_RESTITUTION;
  bumper.friction = PEG_FRICTION;
  return bumper;
}

// radiusFactor/densityFactor < 1 produce the smaller/lighter balls a
// Splitter peg spawns (PRD Section 6).
function spawnBall(x, isGolden = false, y = HOPPER_Y, radiusFactor = 1, densityFactor = 1) {
  const jitter = radiusFactor === 1 ? (Math.random() - 0.5) * 2 * SPAWN_JITTER : 0;
  // render.visible: false — drawn ourselves in drawBalls (Phase 9 art pass,
  // polished-steel-ball-bearing look, gold variant for Golden Ball).
  const ball = Bodies.circle(x + jitter, y, BALL_RADIUS * radiusFactor, {
    restitution: BALL_RESTITUTION,
    friction: BALL_FRICTION,
    frictionAir: BALL_FRICTION_AIR,
    density: BALL_DENSITY * densityFactor,
    label: "ball",
    render: { visible: false },
  });
  ball.currencyMultiplier = 1; // set by Multiplier pegs, for the rest of this ball's fall
  ball.isGolden = isGolden; // Golden Ball event (PRD Section 7) — pays on every peg it touches
  ball.ghostPasses = new Map(); // Ghost peg id -> number of free passes already used
  World.add(world, ball);
  return ball;
}

function handleCollisions(event) {
  for (const pair of event.pairs) {
    const { bodyA, bodyB } = pair;
    const ball = bodyA.label === "ball" ? bodyA : bodyB.label === "ball" ? bodyB : null;
    const other = ball === bodyA ? bodyB : bodyA;
    if (!ball) continue;

    if (other.label === "peg") {
      // Only sparse, pre-seeded Money pegs pay out — routing toward one
      // is a deliberate choice, not a side effect of every bounce. The
      // payout is scaled by any Multiplier pegs this ball has already
      // passed through this fall (PRD Section 6).
      if (other.isMoney) {
        const amount = Math.round(MONEY_PEG_VALUE * ball.currencyMultiplier);
        earn(amount, other.position.x, other.position.y, "#7ef29c", false);
      }
      // Golden Ball event (PRD Section 7): pays out on *every* peg it
      // touches for the rest of its fall, not just Money pegs.
      if (ball.isGolden) {
        const amount = Math.round(GOLDEN_BALL_PEG_VALUE * ball.currencyMultiplier);
        earn(amount, other.position.x, other.position.y, GOLDEN_BALL_COLOR, false);
      }
      applySpecialPegEffect(other, ball, pair);
      handleEventTriggerHit(other);
      flashPeg(other);
    } else if (other.label && other.label.startsWith("slot-")) {
      // larger, decisive payout, weighted by landing position
      const amount = Math.round(other.slotValue * ball.currencyMultiplier);
      earn(amount, other.slotCenterX, boardHeight - 60, "#8fffa0", true);
      World.remove(world, ball);
      checkRoundEnd();
    } else if (other.label === "floor") {
      World.remove(world, ball);
      checkRoundEnd();
    }
  }
}

let bumpTimeout = null;
function earn(amount, x, y, color, big) {
  currency += amount;
  roundEarnings += amount;
  meta.lifetimeCurrency += amount;
  currencyEl.textContent = currency;
  popups.push({ x, y, value: amount, born: performance.now(), color, big });

  currencyBadgeEl.classList.remove("bump");
  // eslint-disable-next-line no-unused-expressions -- restart CSS animation
  void currencyBadgeEl.offsetWidth;
  currencyBadgeEl.classList.add("bump");
  clearTimeout(bumpTimeout);
  bumpTimeout = setTimeout(() => currencyBadgeEl.classList.remove("bump"), 200);

  refreshShopUI();
  updateRoundHUD();
  checkAchievements();
  saveMeta();
  saveRunState();
}

// Timestamp-based (not setTimeout) so drawPegs can just check "is it still
// flashing" each frame — structural pegs get a plain white bounce-feedback
// flash; money pegs flash a brighter gold; special pegs flash their own
// accent color.
function flashPeg(peg) {
  peg._flashColor = peg.special
    ? SPECIAL_PEG_TYPES[peg.special].flashColor
    : peg.isMoney
    ? MONEY_PEG_MATERIAL.flashColor
    : STRUCTURAL_PEG_MATERIAL.flashColor;
  peg._flashUntil = performance.now() + 90;
}

// --- Phase 5/10: special peg effects (PRD Section 6) ---
// Bounce needs no extra handling here — its elevated restitution is set on
// the physics body at placement time and Matter applies it automatically.
// Magnet isn't collision-triggered at all — see applyMagnetForces, run
// every physics tick instead (it's a continuous pull, not an on-hit effect).

function applySpecialPegEffect(peg, ball, pair) {
  if (peg.special === "multiplier") {
    ball.currencyMultiplier *= MULTIPLIER_PEG_FACTOR;
    popups.push({
      x: peg.position.x,
      y: peg.position.y,
      text: `×${ball.currencyMultiplier}`,
      born: performance.now(),
      color: SPECIAL_PEG_TYPES.multiplier.color,
      big: true,
    });
  } else if (peg.special === "freeze") {
    const v = ball.velocity;
    Body.setVelocity(ball, { x: v.x * FREEZE_PEG_SLOW_FACTOR, y: v.y * FREEZE_PEG_SLOW_FACTOR });
    popups.push({
      x: peg.position.x,
      y: peg.position.y,
      text: "❄",
      born: performance.now(),
      color: SPECIAL_PEG_TYPES.freeze.color,
      big: true,
    });
  } else if (peg.special === "ghost") {
    const used = ball.ghostPasses.get(peg.id) || 0;
    if (used < GHOST_MAX_FREE_PASSES) {
      // Free pass: no physical bounce. Matter's resolver skips any pair
      // marked inactive for this step.
      ball.ghostPasses.set(peg.id, used + 1);
      if (pair) pair.isActive = false;
      popups.push({
        x: peg.position.x,
        y: peg.position.y,
        text: "👻",
        born: performance.now(),
        color: SPECIAL_PEG_TYPES.ghost.color,
        big: true,
      });
    }
    // else: this ball has used up its free passes against this peg —
    // falls through to a normal physical bounce, no special handling.
  } else if (peg.special === "splitter") {
    trySplitBall(peg, ball);
  }
}

// Duplicates the ball into two lighter/smaller balls (PRD Section 6),
// capped so a chain of Splitter hits can't runaway-multiply balls and tank
// performance (PRD Section 3/10).
function trySplitBall(peg, ball) {
  const liveBalls = Composite.allBodies(world).filter((b) => b.label === "ball").length;
  if (liveBalls >= MAX_CONCURRENT_BALLS) return;

  const radiusFactor = (ball.circleRadius / BALL_RADIUS) * SPLIT_BALL_RADIUS_FACTOR;
  const twin = spawnBall(
    ball.position.x,
    ball.isGolden,
    ball.position.y,
    radiusFactor,
    SPLIT_BALL_DENSITY_FACTOR
  );
  twin.currencyMultiplier = ball.currencyMultiplier;
  Body.setVelocity(twin, { x: ball.velocity.x + SPLIT_LAUNCH_KICK, y: ball.velocity.y });
  Body.setVelocity(ball, { x: ball.velocity.x - SPLIT_LAUNCH_KICK, y: ball.velocity.y });
  // shrink the original too — both are now "lighter/smaller" per the PRD
  Body.scale(ball, SPLIT_BALL_RADIUS_FACTOR, SPLIT_BALL_RADIUS_FACTOR);

  popups.push({
    x: peg.position.x,
    y: peg.position.y,
    text: "⑂",
    born: performance.now(),
    color: SPECIAL_PEG_TYPES.splitter.color,
    big: true,
  });
}

// Continuous pull toward any Magnet peg within range, applied every
// physics tick (PRD Section 6: "creates a funnel playstyle").
function applyMagnetForces() {
  const magnets = pegs.filter((p) => p.special === "magnet");
  if (magnets.length === 0) return;
  const balls = Composite.allBodies(world).filter((b) => b.label === "ball");

  for (const magnet of magnets) {
    for (const ball of balls) {
      const dx = magnet.position.x - ball.position.x;
      const dy = magnet.position.y - ball.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist === 0 || dist > MAGNET_RADIUS) continue;
      // falls off toward the edge of the radius so the pull reads as a
      // gentle funnel, not a hard snap
      const strength = MAGNET_STRENGTH * (1 - dist / MAGNET_RADIUS);
      Body.applyForce(ball, ball.position, {
        x: (dx / dist) * strength,
        y: (dy / dist) * strength,
      });
    }
  }
}

// --- Phase 8: special events (PRD Section 7) ---
// Hit-count trigger model: a normal-looking peg silently counts hits; on
// reaching a threshold it fires the event and resets its counter.

function handleEventTriggerHit(peg) {
  if (!peg.eventTrigger) return;
  const trigger = EVENT_TRIGGERS.find((t) => t.id === peg.eventTrigger);
  triggerHitCounts[trigger.id] += 1;
  if (triggerHitCounts[trigger.id] < trigger.hitsNeeded) return;

  triggerHitCounts[trigger.id] = 0;
  if (trigger.id === "goldenBall") fireGoldenBall();
  else if (trigger.id === "pegFrenzy") startPegFrenzy();
}

function fireGoldenBall() {
  goldenBallPending = true;
  updateEventBanner();
}

// All structural/Money pegs (not player-placed special pegs — those keep
// their own identity) temporarily get Bounce's restitution. drawPegs reads
// peg._frenzyActive to swap in the frenzy material for non-Money pegs only
// — Money pegs keep their green material so the board stays readable
// (losing that signal for 15s would make it impossible to see where the
// income pegs are).
function startPegFrenzy() {
  if (!frenzyActive) {
    for (const peg of pegs) {
      if (peg.special) continue;
      peg._frenzyRestitution = peg.restitution;
      peg.restitution = BOUNCE_PEG_RESTITUTION;
      peg._frenzyActive = true;
    }
  }
  frenzyActive = true;
  frenzyEndTime = performance.now() + PEG_FRENZY_DURATION_MS;
  clearTimeout(frenzyTimeout);
  frenzyTimeout = setTimeout(endPegFrenzy, PEG_FRENZY_DURATION_MS);
  updateEventBanner();
}

function endPegFrenzy() {
  for (const peg of pegs) {
    if (peg._frenzyRestitution === undefined) continue;
    peg.restitution = peg._frenzyRestitution;
    delete peg._frenzyRestitution;
    peg._frenzyActive = false;
  }
  frenzyActive = false;
  updateEventBanner();
}

function updateEventBanner() {
  if (frenzyActive) {
    const remaining = Math.max(0, Math.ceil((frenzyEndTime - performance.now()) / 1000));
    eventBannerTextEl.textContent = `🎉 Peg Frenzy! ${remaining}s`;
    eventBannerEl.classList.add("show-frenzy");
    eventBannerEl.classList.remove("show-golden");
  } else if (goldenBallPending) {
    eventBannerTextEl.textContent = "✨ Golden Ball ready — next drop!";
    eventBannerEl.classList.add("show-golden");
    eventBannerEl.classList.remove("show-frenzy");
  } else {
    eventBannerEl.classList.remove("show-golden", "show-frenzy");
  }
}

// --- Hopper sweep (PRD Section 2) ---

function onBeforeUpdate(event) {
  // Clamp so a slow/backgrounded first frame (or a tab regaining focus)
  // can't teleport the hopper in one step.
  const deltaMs = Math.min(event.source.timing.lastDelta || 16.666, 100);
  updateHopper(deltaMs);
  applyMagnetForces();
}

function updateHopper(deltaMs) {
  const deltaSec = deltaMs / 1000;
  hopperX += hopperDir * HOPPER_SPEED * deltaSec;
  if (hopperX >= hopperMaxX) {
    hopperX = hopperMaxX;
    hopperDir = -1;
  } else if (hopperX <= hopperMinX) {
    hopperX = hopperMinX;
    hopperDir = 1;
  }
}

// --- Ball supply: a fixed per-round allotment, not a timer (PRD Section 8) ---

function onDropPressed() {
  if (ballsRemaining <= 0 || roundTransitioning) return;
  ballsRemaining -= 1;
  const isGolden = goldenBallPending;
  if (isGolden) {
    goldenBallPending = false;
    updateEventBanner();
  }
  spawnBall(hopperX, isGolden);
  renderQueuePips();
  saveRunState();
}

function renderQueuePips() {
  const total = BALLS_PER_ROUND + extraBallsLevel;
  queuePipsEl.innerHTML = "";
  for (let i = 0; i < total; i++) {
    const pip = document.createElement("div");
    pip.className = "queue-pip" + (i < ballsRemaining ? "" : " empty");
    queuePipsEl.appendChild(pip);
  }
  dropBtn.disabled = ballsRemaining <= 0 || roundTransitioning;
}

// --- Phase 6: round structure (PRD Section 8) ---

function updateRoundHUD() {
  const goal = roundGoal(roundNumber);
  roundLabelEl.textContent = `Round ${roundNumber}`;
  roundGoalFillEl.style.width = `${Math.min(100, (roundEarnings / goal) * 100)}%`;
  roundGoalTextEl.textContent = `${roundEarnings} / ${goal}`;
}

// Called after every ball resolves (lands in a slot or falls through the
// floor). A round only ends once its ball allotment is fully spent *and*
// no balls are still in flight — otherwise a ball's last-second earnings
// wouldn't count toward the goal yet.
function checkRoundEnd() {
  if (ballsRemaining > 0 || roundTransitioning) return;
  const ballsInFlight = Composite.allBodies(world).some((b) => b.label === "ball");
  if (ballsInFlight) return;

  const goal = roundGoal(roundNumber);
  const passed = roundEarnings >= goal;
  roundTransitioning = true;
  dropBtn.disabled = true;

  const chestRewards = passed ? grantRewardChest() : null;

  roundEndBannerEl.classList.toggle("pass", passed);
  roundEndBannerEl.classList.toggle("fail", !passed);
  roundEndTitleEl.textContent = passed ? "Round Passed!" : "Run Failed";
  roundEndDetailEl.textContent = passed
    ? `Earned ${roundEarnings} / ${goal} — onward to round ${roundNumber + 1}`
    : `Earned ${roundEarnings} / ${goal} — run resets`;
  renderRewardChest(chestRewards);
  roundEndBannerEl.classList.add("show");

  const bannerMs = chestRewards ? REWARD_CHEST_BANNER_MS : ROUND_END_BANNER_MS;
  setTimeout(() => {
    roundEndBannerEl.classList.remove("show");
    if (passed) advanceRound();
    else resetRun();
    roundTransitioning = false;
    renderQueuePips();
  }, bannerMs);
}

// Reward chest (round-pass reward): 1-3 random special pegs, weighted so
// higher counts are rarer, added straight to inventory for free.
function rollRewardChestCount() {
  const totalWeight = REWARD_CHEST_COUNT_WEIGHTS.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const w of REWARD_CHEST_COUNT_WEIGHTS) {
    if (roll < w.weight) return w.count;
    roll -= w.weight;
  }
  return REWARD_CHEST_COUNT_WEIGHTS[0].count;
}

function rollRewardChest() {
  const types = Object.keys(SPECIAL_PEG_TYPES);
  const count = rollRewardChestCount();
  const rewards = {};
  for (let i = 0; i < count; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    rewards[type] = (rewards[type] || 0) + 1;
  }
  return rewards;
}

function grantRewardChest() {
  const rewards = rollRewardChest();
  for (const [type, n] of Object.entries(rewards)) {
    inventory[type] += n;
  }
  renderInventory();
  return rewards;
}

function renderRewardChest(rewards) {
  roundEndChestEl.innerHTML = "";
  if (!rewards) {
    roundEndChestEl.classList.remove("show");
    return;
  }
  roundEndChestEl.classList.add("show");
  const label = document.createElement("div");
  label.className = "round-end-chest-label";
  label.textContent = "🎁 Reward Chest";
  roundEndChestEl.appendChild(label);

  const row = document.createElement("div");
  row.className = "round-end-chest-row";
  for (const [type, count] of Object.entries(rewards)) {
    const def = SPECIAL_PEG_TYPES[type];
    const chip = document.createElement("span");
    chip.className = "chest-peg-chip";
    chip.style.setProperty("--chip-color", def.color);
    chip.textContent = `${def.label} ×${count}`;
    row.appendChild(chip);
  }
  roundEndChestEl.appendChild(row);
}

// Pass: next round on the *same* board — layout and special peg
// placements carry over, only the goal increases (PRD Section 8).
function advanceRound() {
  roundNumber += 1;
  roundEarnings = 0;
  ballsRemaining = BALLS_PER_ROUND + extraBallsLevel;
  updateRoundHUD();

  if (roundNumber > meta.bestRound) {
    meta.bestRound = roundNumber;
    checkAchievements();
    saveMeta();
    updateProgressStats();
  }
  saveRunState();
}

// Fail: the whole run resets — currency, special peg placements, and shop
// upgrade levels all return to their starting state (PRD Section 8). That
// starting state isn't always the game's bare defaults, though: unlocked
// achievements permanently raise it (meta-progression, PRD Section 8) —
// see metaBonusBalls()/metaBonusCurrency().
function resetRun() {
  currency = metaBonusCurrency();
  currencyEl.textContent = currency;
  roundNumber = 1;
  roundEarnings = 0;
  extraBallsLevel = 0;
  ballsRemaining = BALLS_PER_ROUND + metaBonusBalls();

  activePlacement = null; // no refund — currency's already wiped
  updatePlacementBanner();

  placedSpecialPegs.clear();
  Object.keys(placedCounts).forEach((type) => (placedCounts[type] = 0));
  Object.keys(inventory).forEach((type) => (inventory[type] = 0));
  renderInventory();
  buildBoard(); // strips special-peg styling/physics back to plain structural pegs

  // Special events (Phase 8) are per-run, like everything else here.
  Object.keys(triggerHitCounts).forEach((id) => (triggerHitCounts[id] = 0));
  goldenBallPending = false;
  frenzyActive = false;
  clearTimeout(frenzyTimeout);
  updateEventBanner();

  updateRoundHUD();
  refreshShopUI();

  meta.runsCompleted += 1;
  saveMeta();
  updateProgressStats();
  saveRunState();
}

// --- Phase 4: shop (always open, no gating — PRD Section 5) ---

function setShopOpen(open) {
  document.body.classList.toggle("shop-open", open);
}

function onBuyPressed(upgrade) {
  if (upgrade === "extra-balls") buyExtraBalls();
}

function buyExtraBalls() {
  if (extraBallsLevel >= EXTRA_BALLS_MAX) return;
  const cost = extraBallsCost(extraBallsLevel);
  if (currency < cost) return;
  currency -= cost;
  extraBallsLevel += 1;
  ballsRemaining += 1; // felt immediately, not just next round
  currencyEl.textContent = currency;
  refreshShopUI();
  renderQueuePips();
  saveRunState();
}

function refreshShopUI() {
  const extraMaxed = extraBallsLevel >= EXTRA_BALLS_MAX;
  setBuyItem("item-extra-balls", {
    level: `${BALLS_PER_ROUND + extraBallsLevel}${extraMaxed ? " (max)" : ""}`,
    cost: extraMaxed ? "MAX" : extraBallsCost(extraBallsLevel),
    affordable: !extraMaxed && currency >= extraBallsCost(extraBallsLevel),
    maxed: extraMaxed,
  });

  for (const type of Object.keys(SPECIAL_PEG_TYPES)) {
    // Cost scales with everything ever acquired this run — placed *and*
    // still sitting in inventory — so buying a big stock up front to place
    // later doesn't dodge the escalating cost curve.
    const owned = placedCounts[type] + inventory[type];
    const cost = SPECIAL_PEG_TYPES[type].cost(owned);
    setBuyItem(`item-special-${type}`, {
      level: `${placedCounts[type]} placed · ${inventory[type]} in stock`,
      cost,
      affordable: currency >= cost,
      maxed: false,
    });
  }
}

function setBuyItem(itemId, { level, cost, affordable, maxed }) {
  const item = document.getElementById(itemId);
  item.querySelector('[data-field="level"]').textContent = level;
  item.querySelector('[data-field="cost"]').textContent = cost;
  const btn = item.querySelector(".buy-btn");
  btn.disabled = maxed || !affordable;
}

// --- Phase 5/11: special pegs — spam-buy into inventory, place whenever ---
// (tap an inventory item to arm placement, or drag it straight onto a peg)

function buildSpecialShopItems() {
  shopItemsSpecialEl.innerHTML = "";
  for (const [type, def] of Object.entries(SPECIAL_PEG_TYPES)) {
    const item = document.createElement("div");
    item.className = "shop-item";
    item.id = `item-special-${type}`;
    item.innerHTML = `
      <div class="shop-item-info">
        <div class="shop-item-name"><span class="shop-item-swatch" style="background:${def.color};color:${def.color}"></span>${def.label}</div>
        <div class="shop-item-desc">${def.desc}</div>
        <div class="shop-item-level"><span data-field="level"></span></div>
      </div>
      <button class="buy-btn" data-special="${type}">
        <span class="buy-label">Buy</span>
        <span class="buy-cost" data-field="cost"></span>
      </button>
    `;
    shopItemsSpecialEl.appendChild(item);
    item
      .querySelector(".buy-btn")
      .addEventListener("click", () => onBuySpecialPressed(type));
  }
}

// Buying just adds to inventory — no immediate placement, no blocking
// further buys, so the player can stock up on several before placing any.
function onBuySpecialPressed(type) {
  const owned = placedCounts[type] + inventory[type];
  const cost = SPECIAL_PEG_TYPES[type].cost(owned);
  if (currency < cost) return;
  currency -= cost;
  currencyEl.textContent = currency;
  inventory[type] += 1;
  renderInventory();
  refreshShopUI();
  saveRunState();
}

// Nothing to refund — an armed-but-not-yet-placed item was never removed
// from inventory in the first place.
function cancelPlacement() {
  if (!activePlacement) return;
  activePlacement = null;
  updatePlacementBanner();
}

function updatePlacementBanner() {
  document.body.classList.toggle("placing", !!activePlacement);
  if (activePlacement) {
    placementTextEl.textContent = `Tap a peg to place ${SPECIAL_PEG_TYPES[activePlacement.type].label}`;
  }
}

function onCanvasClick(e) {
  if (!activePlacement) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = boardWidth / rect.width;
  const scaleY = boardHeight / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  placeAtBoardCoords(x, y);
}

function placeAtBoardCoords(x, y) {
  if (!activePlacement) return false;
  const type = activePlacement.type;
  if (inventory[type] <= 0) {
    activePlacement = null;
    updatePlacementBanner();
    return false;
  }
  const peg = findEligiblePegNear(x, y);
  if (!peg) return false; // missed, or only ineligible pegs nearby — try again

  peg.special = type;
  peg.restitution = type === "bounce" ? BOUNCE_PEG_RESTITUTION : peg.restitution;
  placedSpecialPegs.set(`${peg.gridRow},${peg.gridCol}`, type);
  placedCounts[type] += 1;
  inventory[type] -= 1;

  activePlacement = null;
  updatePlacementBanner();
  renderInventory();
  refreshShopUI();
  saveRunState();
  return true;
}

// Money pegs and already-special pegs aren't valid placement targets —
// Money pegs are a separate pre-seeded income layer (Phase 3), and
// stacking two special types on one peg isn't supported in v1.
function findEligiblePegNear(x, y) {
  let best = null;
  let bestDist = PLACEMENT_TAP_RADIUS;
  for (const peg of pegs) {
    if (peg.isMoney || peg.special) continue;
    const dx = peg.position.x - x;
    const dy = peg.position.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist < bestDist) {
      best = peg;
      bestDist = dist;
    }
  }
  return best;
}

// --- Phase 11: inventory tray — tap an item to arm placement (same tap-a-
// peg flow as before), or drag it straight onto a peg in one motion ---

function renderInventory() {
  inventoryItemsEl.innerHTML = "";
  let any = false;
  for (const [type, def] of Object.entries(SPECIAL_PEG_TYPES)) {
    const count = inventory[type];
    if (count <= 0) continue;
    any = true;

    const item = document.createElement("div");
    item.className = "inventory-item";
    item.style.background = def.color;
    item.style.color = def.color;
    item.dataset.type = type;
    item.title = def.label;
    item.innerHTML = `<span class="inventory-item-count">${count}</span>`;
    item.addEventListener("pointerdown", onInventoryPointerDown);
    inventoryItemsEl.appendChild(item);
  }
  inventoryTrayEl.classList.toggle("show", any);
}

let dragState = null; // { type, ghostEl, moved, startX, startY } while a pointer-drag is live

function onInventoryPointerDown(e) {
  const type = e.currentTarget.dataset.type;
  if (inventory[type] <= 0) return;
  e.preventDefault();

  const ghost = document.createElement("div");
  ghost.className = "inventory-drag-ghost";
  ghost.style.background = SPECIAL_PEG_TYPES[type].color;
  ghost.style.left = `${e.clientX}px`;
  ghost.style.top = `${e.clientY}px`;
  document.body.appendChild(ghost);

  dragState = { type, ghostEl: ghost, moved: false, startX: e.clientX, startY: e.clientY };
  window.addEventListener("pointermove", onInventoryPointerMove);
  window.addEventListener("pointerup", onInventoryPointerUp, { once: true });
}

function onInventoryPointerMove(e) {
  if (!dragState) return;
  dragState.ghostEl.style.left = `${e.clientX}px`;
  dragState.ghostEl.style.top = `${e.clientY}px`;
  if (Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY) > 8) {
    dragState.moved = true;
  }
}

function onInventoryPointerUp(e) {
  window.removeEventListener("pointermove", onInventoryPointerMove);
  if (!dragState) return;
  const { type, ghostEl, moved } = dragState;
  ghostEl.remove();
  dragState = null;

  if (!moved) {
    // A plain tap, no real drag: arm placement mode, same as before — the
    // player taps a board peg next.
    activePlacement = { type };
    updatePlacementBanner();
    return;
  }

  // Dragged and released — place directly if it lands on the board over an
  // eligible peg, otherwise just drop it (item stays in inventory, nothing
  // lost — it was never removed).
  const rect = canvas.getBoundingClientRect();
  if (
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom
  ) {
    const scaleX = boardWidth / rect.width;
    const scaleY = boardHeight / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    activePlacement = { type };
    if (!placeAtBoardCoords(x, y)) activePlacement = null;
  }
}

// --- Phase 7: meta-progression + persistence (PRD Section 8, 10) ---

function setProgressOpen(open) {
  document.body.classList.toggle("progress-open", open);
}

// --- Phase 11: settings ---

function setSettingsOpen(open) {
  document.body.classList.toggle("settings-open", open);
  if (!open) resetConfirmEl.classList.remove("show");
}

// A full factory reset — unlike a run failing, this also wipes meta state
// (lifetime stats, unlocked achievements), which a run reset deliberately
// never touches. Reloading is the simplest reliable way to get every piece
// of in-memory state back to its true default rather than resetting each
// variable by hand.
function eraseAllProgress() {
  try {
    localStorage.removeItem(RUN_STORAGE_KEY);
    localStorage.removeItem(META_STORAGE_KEY);
  } catch {
    // localStorage unavailable — nothing was persisted to begin with
  }
  location.reload();
}

function metaBonusBalls() {
  return ACHIEVEMENTS.filter((a) => meta.unlocked[a.id]).reduce(
    (sum, a) => sum + (a.bonusBalls || 0),
    0
  );
}

function metaBonusCurrency() {
  return ACHIEVEMENTS.filter((a) => meta.unlocked[a.id]).reduce(
    (sum, a) => sum + (a.bonusCurrency || 0),
    0
  );
}

// Checks every locked achievement's requirement against current meta
// stats; newly-unlocked ones apply their reward immediately to the run in
// progress (not just future runs) so it feels like a payoff right away.
function checkAchievements() {
  let anyNew = false;
  for (const a of ACHIEVEMENTS) {
    if (meta.unlocked[a.id]) continue;
    if (!a.requirement(meta)) continue;

    meta.unlocked[a.id] = true;
    anyNew = true;

    if (a.bonusBalls) {
      ballsRemaining += a.bonusBalls;
      renderQueuePips();
    }
    if (a.bonusCurrency) {
      currency += a.bonusCurrency;
      currencyEl.textContent = currency;
    }
    showAchievementToast(a);
  }
  if (anyNew) {
    renderAchievements();
    refreshShopUI();
  }
}

let achievementToastTimeout = null;
function showAchievementToast(achievement) {
  achievementToastDetailEl.textContent = `${achievement.label} — ${achievement.reward}`;
  achievementToastEl.classList.add("show");
  clearTimeout(achievementToastTimeout);
  achievementToastTimeout = setTimeout(() => {
    achievementToastEl.classList.remove("show");
  }, 3200);
}

function updateProgressStats() {
  statBestRoundEl.textContent = meta.bestRound;
  statLifetimeCurrencyEl.textContent = meta.lifetimeCurrency;
  statRunsEl.textContent = meta.runsCompleted;
}

function renderAchievements() {
  achievementListEl.innerHTML = "";
  for (const a of ACHIEVEMENTS) {
    const unlocked = !!meta.unlocked[a.id];
    const row = document.createElement("div");
    row.className = "achievement-row" + (unlocked ? " unlocked" : "");
    row.innerHTML = `
      <span class="achievement-icon">${unlocked ? "🏆" : "🔒"}</span>
      <div>
        <div class="achievement-name">${a.label}</div>
        <div class="achievement-reward">${a.reward}</div>
      </div>
    `;
    achievementListEl.appendChild(row);
  }
}

function loadMeta() {
  const fallback = { bestRound: 1, lifetimeCurrency: 0, runsCompleted: 0, unlocked: {} };
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    return {
      bestRound: data.bestRound ?? 1,
      lifetimeCurrency: data.lifetimeCurrency ?? 0,
      runsCompleted: data.runsCompleted ?? 0,
      unlocked: data.unlocked ?? {},
    };
  } catch {
    return fallback; // corrupt/unavailable storage — fall back to fresh meta
  }
}

function saveMeta() {
  try {
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) — meta just
    // won't persist this session; the game still works fine either way.
  }
}

// Run state (currency, round, special peg placements) survives a page
// refresh (PRD Section 10). Balls in flight are not persisted — a refresh
// mid-drop just loses whatever was in the air, which is an acceptable
// simplification for what this is meant to solve (losing a whole run to
// an accidental reload).
function saveRunState() {
  try {
    const data = {
      currency,
      roundNumber,
      roundEarnings,
      ballsRemaining,
      extraBallsLevel,
      placedCounts,
      inventory,
      placedSpecialPegs: Array.from(placedSpecialPegs.entries()),
    };
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable — run just won't survive a refresh
  }
}

// Returns true if a saved run was found and restored.
function loadRunState() {
  try {
    const raw = localStorage.getItem(RUN_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);

    currency = data.currency ?? metaBonusCurrency();
    roundNumber = data.roundNumber ?? 1;
    roundEarnings = data.roundEarnings ?? 0;
    extraBallsLevel = data.extraBallsLevel ?? 0;
    ballsRemaining = data.ballsRemaining ?? BALLS_PER_ROUND + extraBallsLevel;

    if (data.placedCounts) Object.assign(placedCounts, data.placedCounts);
    if (data.inventory) Object.assign(inventory, data.inventory);
    if (Array.isArray(data.placedSpecialPegs)) {
      placedSpecialPegs.clear();
      for (const [key, type] of data.placedSpecialPegs) placedSpecialPegs.set(key, type);
    }
    return true;
  } catch {
    return false; // corrupt/unavailable storage — start a fresh run instead
  }
}

function drawOverlay() {
  const ctx = render.context;
  ctx.save();

  drawPegs(ctx);
  drawBalls(ctx);
  drawSlotValues(ctx);
  drawPopups(ctx);
  drawGoldenBallGlow(ctx);

  // hopper body
  const grad = ctx.createLinearGradient(
    0,
    HOPPER_Y - HOPPER_HEIGHT / 2,
    0,
    HOPPER_Y + HOPPER_HEIGHT / 2
  );
  grad.addColorStop(0, "#e8b84b");
  grad.addColorStop(1, "#a87c1f");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "#6b5316";
  ctx.lineWidth = 2;
  const hx = hopperX - HOPPER_WIDTH / 2;
  const hy = HOPPER_Y - HOPPER_HEIGHT / 2;
  const radius = 6;
  ctx.beginPath();
  ctx.moveTo(hx + radius, hy);
  ctx.arcTo(hx + HOPPER_WIDTH, hy, hx + HOPPER_WIDTH, hy + HOPPER_HEIGHT, radius);
  ctx.arcTo(hx + HOPPER_WIDTH, hy + HOPPER_HEIGHT, hx, hy + HOPPER_HEIGHT, radius);
  ctx.arcTo(hx, hy + HOPPER_HEIGHT, hx, hy, radius);
  ctx.arcTo(hx, hy, hx + HOPPER_WIDTH, hy, radius);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

// Pulsing gold glow ring around any Golden Ball in flight (PRD Section 7's
// "event pegs should be visually distinct — glow/pulse" design intent).
function drawGoldenBallGlow(ctx) {
  const goldenBalls = Composite.allBodies(world).filter(
    (b) => b.label === "ball" && b.isGolden
  );
  if (goldenBalls.length === 0) return;

  ctx.save();
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
  for (const ball of goldenBalls) {
    ctx.beginPath();
    ctx.arc(ball.position.x, ball.position.y, ball.circleRadius + 6 + pulse * 3, 0, Math.PI * 2);
    ctx.strokeStyle = GOLDEN_BALL_COLOR;
    ctx.globalAlpha = 0.4 + pulse * 0.4;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();
}

// --- Phase 9: art pass — glossy pre-rendered-sprite look (PRD Section 11) -
// Pegs/ball are drawn as layered-gradient spheres instead of Matter's flat
// fill/stroke: a radial gradient (light -> base -> dark) reads as a lit 3D
// sphere, plus a specular highlight positioned toward the upper-left as if
// lit from one consistent light source. `matte` softens/dims the highlight
// (rubber, frosted ice); `metallic` adds a second, sharper highlight point
// (gold, polished steel). `frost` adds a couple of small sparkle flecks.

function drawGlossySphere(ctx, x, y, r, material, flashColor) {
  ctx.save();
  if (material.alpha !== undefined) ctx.globalAlpha = material.alpha;

  const grad = ctx.createRadialGradient(
    x - r * 0.3,
    y - r * 0.35,
    r * 0.05,
    x,
    y,
    r * 1.1
  );
  grad.addColorStop(0, material.light);
  grad.addColorStop(0.55, material.color);
  grad.addColorStop(1, material.dark);

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = material.dark;
  ctx.stroke();

  const specSize = material.matte ? 0.34 : 0.27;
  const specAlpha = material.matte ? 0.35 : 0.7;
  ctx.beginPath();
  ctx.ellipse(
    x - r * 0.3,
    y - r * 0.35,
    r * specSize,
    r * specSize * 0.6,
    -0.6,
    0,
    Math.PI * 2
  );
  ctx.globalAlpha = specAlpha;
  ctx.fillStyle = material.specular || "#ffffff";
  ctx.fill();

  if (material.metallic) {
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(x - r * 0.15, y - r * 0.5, r * 0.09, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }

  if (material.frost) {
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x + r * 0.32, y + r * 0.1, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + r * 0.1, y + r * 0.4, r * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }

  if (flashColor) {
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = flashColor;
    ctx.fill();
  }

  ctx.restore();
}

function getPegMaterial(peg) {
  if (peg.special) return SPECIAL_PEG_TYPES[peg.special];
  if (peg.isMoney) return MONEY_PEG_MATERIAL;
  if (peg._frenzyActive) return FRENZY_PEG_MATERIAL;
  return STRUCTURAL_PEG_MATERIAL;
}

function drawPegs(ctx) {
  const now = performance.now();
  for (const peg of pegs) {
    const material = getPegMaterial(peg);
    const flashing = peg._flashUntil > now;
    drawGlossySphere(ctx, peg.position.x, peg.position.y, PEG_RADIUS, material, flashing ? peg._flashColor : null);
  }
}

function drawBalls(ctx) {
  const balls = Composite.allBodies(world).filter((b) => b.label === "ball");
  for (const ball of balls) {
    const material = ball.isGolden ? GOLD_BALL_MATERIAL : STEEL_BALL_MATERIAL;
    drawGlossySphere(ctx, ball.position.x, ball.position.y, ball.circleRadius, material, null);
  }
}

function drawSlotValues(ctx) {
  ctx.save();
  ctx.font = "bold 18px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const slot of slotSensors) {
    ctx.fillStyle = "rgba(244, 240, 230, 0.75)";
    ctx.fillText(slot.slotValue, slot.slotCenterX, boardHeight - 30);
  }
  ctx.restore();
}

function drawPopups(ctx) {
  const now = performance.now();
  const LIFETIME = 700;
  popups = popups.filter((p) => now - p.born < LIFETIME);

  ctx.save();
  ctx.textAlign = "center";
  for (const p of popups) {
    const age = now - p.born;
    const t = age / LIFETIME;
    const rise = t * 34;
    const alpha = 1 - t;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.font = p.big ? "bold 24px monospace" : "bold 13px monospace";
    ctx.fillText(p.text || `+${p.value}`, p.x, p.y - rise);
  }
  ctx.restore();
}

function tickDebug() {
  const ballCount = Composite.allBodies(world).filter(
    (b) => b.label === "ball"
  ).length;
  debugEl.textContent = `pegs ${pegs.length} balls ${ballCount}\nR${roundNumber} ${ballsRemaining}/${BALLS_PER_ROUND + extraBallsLevel} ${roundEarnings}/${roundGoal(roundNumber)}`;
  if (frenzyActive) updateEventBanner(); // keeps the countdown ticking
  requestAnimationFrame(tickDebug);
}

init();
