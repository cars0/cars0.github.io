// Headless simulation — no canvas/DOM. Owns all game state; client.js drives it
// with a local requestAnimationFrame loop and renders whatever snapshot() returns.

import {
  BOUND, HORSE_R, HORSE_SPEED_MIN, HORSE_SPEED_MAX, GRID_SIZE, THEMES,
  MAX_HP, SWORD_DMG, BULLET_DMG, REVOLVER_COOLDOWN, SWORD_HIT_COOLDOWN,
  BULLET_SPEED, REVOLVER_SPIN, SWORD_SPIN, OBSTACLE_TYPES, BREAKABLE_HP,
  SPEED_BOOST_MULT, SPEED_BOOST_DURATION, SHIELD_DURATION,
  MYSTERY_BOX_EFFECTS, MYSTERY_BOX_COUNT,
  TERRAIN_TYPES, TERRAIN_SIZE, MUD_SPEED_MULT, ICE_SPEED_MULT,
  LAUNCH_SPEED, LAUNCH_COOLDOWN, RANDOM_TERRAIN_COUNT,
  ZONE_GRACE_PERIOD, ZONE_SHRINK_DURATION, ZONE_MIN_RADIUS, ZONE_DAMAGE_PER_SEC,
  MULTIKILL_WINDOW, BOW_COOLDOWN, BOW_SPIN, ARROW_SPEED, ARROW_DMG,
  BURST_COOLDOWN, BURST_SHOT_GAP, BURST_SPIN, BURST_SPEED, BURST_DMG,
  ROCKET_COOLDOWN, ROCKET_SPIN, ROCKET_SPEED, ROCKET_DMG, ROCKET_BLAST_RADIUS,
  WEAPON_RESPAWN_INTERVAL, MAX_GROUND_WEAPONS, ITEM_RESPAWN_INTERVAL, MAX_GROUND_ITEMS,
  WILDCARD_MIN_INTERVAL, WILDCARD_MAX_INTERVAL, WILDCARD_OCCUPIED_RADIUS,
  ROYAL_HORSE_TIME_LIMIT, CROWN_TRANSFER_COOLDOWN, CROWN_PICKUP_RADIUS,
  WEAPON_DROP_IMMUNITY
} from './shared/constants.js';

function rand(a, b) { return a + Math.random() * (b - a); }
function irand(a, b) { return Math.floor(rand(a, b + 1)); }

function circleRectOverlap(cx, cy, r, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  return Math.hypot(cx - nx, cy - ny) < r;
}
function pointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

const DEFAULT_ITEM_CONFIG = {
  weapons: { sword: true, revolver: true, bow: true, burst: false, rocket: false },
  mysteryBox: true
};

const WEAPON_TYPES = ['sword', 'revolver', 'bow', 'burst', 'rocket'];

export class HorseBattleSim {
  constructor() {
    this.horses = [];
    this.obstacles = [];
    this.weapons = [];
    this.pickups = [];        // Mario-Kart-style item boxes — effect is rolled at pickup time
    this.enabledEffects = []; // which effects a pickup box can roll into, this round
    this.terrain = [];        // non-colliding ground hazards (mud/ice/launch pads)
    this.bullets = [];
    this.rockets = [];        // separate from bullets — AOE-on-any-contact instead of hit-and-die
    this.pendingEvents = [];  // kills/revives/pickups/etc this tick, for killfeed + FX + audio
    this.simTime = 0;
    this.winnerIdx = null;
    this.zone = null;         // { cx, cy, startR, r } while the shrinking-arena mode is on
    this.multiWeapon = false;
    this.weaponRespawnEnabled = false;
    this.enabledWeaponTypes = [];
    this.weaponRespawnTimer = 0;
    this.itemRespawnEnabled = false;
    this.itemRespawnTimer = 0;
    this.wildcardSpots = [];  // custom-map-only: [{x, y, timer}]
    this.crownEnabled = false;
    this.crownHolder = null;  // a horse object, or null while the crown sits on the ground
    this.crownPos = null;     // { x, y } while the crown sits on the ground, else null
    this.crownTransferCooldown = 0;
  }

  // Random obstacles snap to the same 30px ground grid the level editor uses,
  // as single grid-cell blocks, so a random map lines up exactly like a hand-built one.
  buildObstacles() {
    this.obstacles = [];
    const minGX = Math.ceil(BOUND.x / GRID_SIZE);
    const maxGX = Math.floor((BOUND.x + BOUND.w - GRID_SIZE) / GRID_SIZE);
    const minGY = Math.ceil(BOUND.y / GRID_SIZE);
    const maxGY = Math.floor((BOUND.y + BOUND.h - GRID_SIZE) / GRID_SIZE);
    const count = 11;
    const used = new Set();
    let tries = 0;
    while (this.obstacles.length < count && tries < 400) {
      tries++;
      const gx = irand(minGX, maxGX), gy = irand(minGY, maxGY);
      const key = gx + '_' + gy;
      if (used.has(key)) continue;
      used.add(key);
      this.obstacles.push({
        x: gx * GRID_SIZE, y: gy * GRID_SIZE, w: GRID_SIZE, h: GRID_SIZE,
        type: OBSTACLE_TYPES.BREAKABLE, hp: BREAKABLE_HP
      });
    }
  }

  // Custom-level obstacles/weapons come from client data — clamp/whitelist before trusting them.
  setObstacles(list) {
    this.obstacles = (list || []).map(o => {
      const type = o.type === OBSTACLE_TYPES.SOLID ? OBSTACLE_TYPES.SOLID : OBSTACLE_TYPES.BREAKABLE;
      const w = Math.max(10, Math.min(60, Number(o.w) || 20));
      const h = Math.max(10, Math.min(60, Number(o.h) || 20));
      const x = Math.max(BOUND.x, Math.min(BOUND.x + BOUND.w - w, Number(o.x) || BOUND.x));
      const y = Math.max(BOUND.y, Math.min(BOUND.y + BOUND.h - h, Number(o.y) || BOUND.y));
      return { x, y, w, h, type, hp: type === OBSTACLE_TYPES.SOLID ? Infinity : BREAKABLE_HP };
    });
  }

  setWeapons(list) {
    this.weapons = (list || []).map(w => {
      const type = WEAPON_TYPES.includes(w.type) ? w.type : 'revolver';
      const x = Math.max(BOUND.x, Math.min(BOUND.x + BOUND.w, Number(w.x) || BOUND.x));
      const y = Math.max(BOUND.y, Math.min(BOUND.y + BOUND.h, Number(w.y) || BOUND.y));
      return { type, x, y };
    });
  }

  setTerrain(list) {
    const valid = new Set(Object.values(TERRAIN_TYPES));
    this.terrain = (list || []).map(t => {
      const type = valid.has(t.type) ? t.type : TERRAIN_TYPES.MUD;
      const w = TERRAIN_SIZE, h = TERRAIN_SIZE;
      const x = Math.max(BOUND.x, Math.min(BOUND.x + BOUND.w - w, Number(t.x) || BOUND.x));
      const y = Math.max(BOUND.y, Math.min(BOUND.y + BOUND.h - h, Number(t.y) || BOUND.y));
      return { x, y, w, h, type };
    }).slice(0, 200);
  }

  // Also steers clear of existing ground weapons/pickups (not just obstacles) so a
  // respawn or an initial spawn never lands right on top of loot that's already
  // there — that clustering is what let a horse process two different weapons in
  // one pickup tick and made single-weapon mode swap-thrash between them.
  freeSpot(margin) {
    let tries = 0;
    while (tries++ < 200) {
      const x = rand(BOUND.x + margin, BOUND.x + BOUND.w - margin);
      const y = rand(BOUND.y + margin, BOUND.y + BOUND.h - margin);
      const hitsObstacle = this.obstacles.some(o => circleRectOverlap(x, y, margin, o));
      const hitsLoot = this.weapons.some(w => Math.hypot(w.x - x, w.y - y) < HORSE_R * 2)
        || this.pickups.some(p => Math.hypot(p.x - x, p.y - y) < HORSE_R * 2);
      if (!hitsObstacle && !hitsLoot) return { x, y };
    }
    return { x: BOUND.x + BOUND.w / 2, y: BOUND.y + BOUND.h / 2 };
  }

  // weaponsCfg: { sword, revolver, bow, burst, rocket: bool } — disabled types simply never spawn
  buildWeapons(weaponsCfg) {
    this.weapons = [];
    WEAPON_TYPES.forEach(type => {
      if (!weaponsCfg[type]) return;
      for (let i = 0; i < 3; i++) { const p = this.freeSpot(20); this.weapons.push({ type, x: p.x, y: p.y }); }
    });
  }

  // Mystery Box is a single on/off toggle — when on, a (deliberately rare) box spawns
  // that can roll into any of the three effects; when off, no boxes spawn at all.
  buildPickups(mysteryBoxEnabled) {
    this.enabledEffects = mysteryBoxEnabled ? MYSTERY_BOX_EFFECTS : [];
    this.pickups = [];
    if (!mysteryBoxEnabled) return;
    for (let i = 0; i < MYSTERY_BOX_COUNT; i++) { const p = this.freeSpot(20); this.pickups.push({ x: p.x, y: p.y }); }
  }

  buildTerrain() {
    const types = Object.values(TERRAIN_TYPES);
    const list = [];
    for (let i = 0; i < RANDOM_TERRAIN_COUNT; i++) {
      const p = this.freeSpot(24);
      const type = types[irand(0, types.length - 1)];
      list.push({ x: p.x - TERRAIN_SIZE / 2, y: p.y - TERRAIN_SIZE / 2, type });
    }
    this.setTerrain(list);
  }

  // activeSlots: array of theme indices (0-7) that actually spawn this round — length
  // can be anywhere from 0 to 8, so the lobby's human+bot count controls the field size.
  // owners: length-8 array indexed by theme slot, each entry null (AI) or { id, name }.
  // spawnPoints: optional length-8 array indexed by theme slot, each entry { x, y } or
  // null/undefined (falls back to the procedural radial spot for that slot).
  buildHorses(activeSlots, owners, spawnPoints) {
    this.horses = [];
    const cx = BOUND.x + BOUND.w / 2, cy = BOUND.y + BOUND.h / 2;
    const radius = Math.min(BOUND.w, BOUND.h) / 2 - 40;
    const n = activeSlots.length;
    activeSlots.forEach((themeIdx, i) => {
      const theme = THEMES[themeIdx];
      const custom = spawnPoints && spawnPoints[themeIdx];
      let x, y;
      if (custom) {
        x = Math.max(BOUND.x + 20, Math.min(BOUND.x + BOUND.w - 20, custom.x));
        y = Math.max(BOUND.y + 20, Math.min(BOUND.y + BOUND.h - 20, custom.y));
      } else {
        const ang = (i / n) * Math.PI * 2 + rand(-0.25, 0.25);
        x = cx + Math.cos(ang) * radius + rand(-16, 16);
        y = cy + Math.sin(ang) * radius + rand(-16, 16);
        x = Math.max(BOUND.x + 20, Math.min(BOUND.x + BOUND.w - 20, x));
        y = Math.max(BOUND.y + 20, Math.min(BOUND.y + BOUND.h - 20, y));
      }
      const dir = rand(0, Math.PI * 2);
      const speed = rand(HORSE_SPEED_MIN, HORSE_SPEED_MAX) * theme.speedMult;
      const maxHp = Math.round(MAX_HP * theme.hpMult);
      this.horses.push({
        themeIdx, x, y,
        vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed,
        hp: maxHp, maxHp, alive: true, deathT: 0,
        heldWeapons: [],
        revolverAngle: rand(0, Math.PI * 2), revolverTimer: rand(1, REVOLVER_COOLDOWN),
        bowAngle: rand(0, Math.PI * 2), bowTimer: rand(1, BOW_COOLDOWN),
        swordSpinAngle: rand(0, Math.PI * 2),
        burstAngle: rand(0, Math.PI * 2), burstTimer: rand(1, BURST_COOLDOWN),
        burstShotsLeft: 0, burstShotTimer: 0, burstFireAngle: 0,
        rocketAngle: rand(0, Math.PI * 2), rocketTimer: rand(1, ROCKET_COOLDOWN),
        swordCooldowns: {}, phase: rand(0, 10), facing: 1,
        speedBoostTimer: 0, shieldTimer: 0, launchCooldown: 0,
        killTimestamps: [],
        kills: 0, damageDealt: 0, deathTime: null, crownTime: 0,
        owner: owners && owners[themeIdx] ? owners[themeIdx] : null
      });
    });
  }

  // opts: { activeSlots, owners, customLayout, itemConfig, shrinkingArena, multiWeapon, royalHorse }
  // customLayout: { obstacles, weapons, horseSpawns, terrain, wildcards, crownSpawn } | null — null
  // means procedurally generate. itemConfig only applies to a procedurally-generated map; a custom
  // level always uses exactly its own placed weapons/terrain and never spawns lootboxes or respawns
  // anything — Wildcard markers are the deliberate, explicit exception to that "never respawns" rule.
  newRound({ activeSlots, owners, customLayout = null, itemConfig = null, shrinkingArena = false, multiWeapon = false, royalHorse = false }) {
    this.multiWeapon = !!multiWeapon;
    if (customLayout) {
      this.setObstacles(customLayout.obstacles);
      this.setWeapons(customLayout.weapons);
      this.setTerrain(customLayout.terrain);
      this.pickups = [];
      this.enabledEffects = [];
      this.weaponRespawnEnabled = false;
      this.enabledWeaponTypes = [];
      this.itemRespawnEnabled = false;
      const wildcards = Array.isArray(customLayout.wildcards) ? customLayout.wildcards : [];
      this.wildcardSpots = wildcards.map(w => ({ x: w.x, y: w.y, timer: rand(WILDCARD_MIN_INTERVAL, WILDCARD_MAX_INTERVAL) }));
      // a wildcard-spawned Mystery Box would silently no-op on pickup otherwise, since
      // applyRandomEffect reads enabledEffects — placing wildcards implies wanting boxes
      if (this.wildcardSpots.length) this.enabledEffects = MYSTERY_BOX_EFFECTS;
    } else {
      const cfg = itemConfig || DEFAULT_ITEM_CONFIG;
      this.buildObstacles();
      this.buildWeapons(cfg.weapons);
      this.buildPickups(!!cfg.mysteryBox);
      this.buildTerrain();
      this.enabledWeaponTypes = WEAPON_TYPES.filter(t => cfg.weapons[t]);
      this.weaponRespawnEnabled = this.enabledWeaponTypes.length > 0;
      this.itemRespawnEnabled = !!cfg.mysteryBox;
      this.wildcardSpots = []; // wildcards are editor/custom-map-only
    }
    this.weaponRespawnTimer = WEAPON_RESPAWN_INTERVAL;
    this.itemRespawnTimer = ITEM_RESPAWN_INTERVAL;
    this.bullets = [];
    this.rockets = [];
    this.pendingEvents = [];
    this.simTime = 0;
    this.winnerIdx = null;
    if (shrinkingArena) {
      const startR = Math.hypot(BOUND.w, BOUND.h) / 2;
      this.zone = { cx: BOUND.x + BOUND.w / 2, cy: BOUND.y + BOUND.h / 2, startR, r: startR };
    } else {
      this.zone = null;
    }
    this.crownEnabled = !!royalHorse;
    if (this.crownEnabled) {
      const spawn = (customLayout && customLayout.crownSpawn) || { x: BOUND.x + BOUND.w / 2, y: BOUND.y + BOUND.h / 2 };
      this.crownPos = { x: spawn.x, y: spawn.y };
    } else {
      this.crownPos = null;
    }
    this.crownHolder = null;
    this.crownTransferCooldown = 0;
    this.buildHorses(activeSlots, owners, customLayout && customLayout.horseSpawns);
  }

  reflectOffObstacles(h) {
    this.obstacles.forEach(o => {
      if (!o || o.hp <= 0) return;
      if (circleRectOverlap(h.x, h.y, HORSE_R * 0.7, o)) {
        if (o.type === OBSTACLE_TYPES.BREAKABLE) {
          if (h.heldWeapons.includes('sword')) {
            o.hp = 0; // sword-carrying horse cuts straight through breakable blocks
            this.pendingEvents.push({ type: 'blockBreak', x: o.x + o.w / 2, y: o.y + o.h / 2 });
            return;
          }
          o.hp -= 1; // any horse chips away at it by bouncing into it
          if (o.hp <= 0) this.pendingEvents.push({ type: 'blockBreak', x: o.x + o.w / 2, y: o.y + o.h / 2 });
        }
        const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
        const dx = h.x - cx, dy = h.y - cy;
        if (Math.abs(dx / o.w) > Math.abs(dy / o.h)) h.vx = Math.abs(h.vx) * Math.sign(dx || 1);
        else h.vy = Math.abs(h.vy) * Math.sign(dy || 1);
        // push out by the actual penetration depth (not a fixed nudge) so a fast
        // horse fully clears the block in one step instead of jittering inside it
        const nx = Math.max(o.x, Math.min(h.x, o.x + o.w));
        const ny = Math.max(o.y, Math.min(h.y, o.y + o.h));
        const d = Math.hypot(h.x - nx, h.y - ny) || 1;
        const push = Math.max(0, HORSE_R * 0.7 - d) + 1;
        h.x += (h.x - nx) / d * push;
        h.y += (h.y - ny) / d * push;
      }
    });
  }

  // Reads whatever terrain the horse is currently standing on: a speed multiplier from
  // mud/ice, and whether it's on a launch pad right now. Non-colliding — horses just pass
  // over these; onLaunchPad is a live read each frame, separate from the launch cooldown.
  readTerrain(h) {
    let speedMult = 1, onLaunchPad = false;
    for (const t of this.terrain) {
      if (!pointInRect(h.x, h.y, t)) continue;
      if (t.type === TERRAIN_TYPES.MUD) speedMult = Math.min(speedMult, MUD_SPEED_MULT);
      else if (t.type === TERRAIN_TYPES.ICE) speedMult = Math.max(speedMult, ICE_SPEED_MULT);
      else if (t.type === TERRAIN_TYPES.LAUNCH) onLaunchPad = true;
    }
    return { speedMult, onLaunchPad };
  }

  // Resets only the timer/angle state for one specific weapon type — used on pickup so
  // gaining a second held weapon (multi-weapon mode) doesn't disturb weapons already held.
  resetWeaponTimer(h, type) {
    if (type === 'revolver') h.revolverTimer = REVOLVER_COOLDOWN;
    else if (type === 'bow') h.bowTimer = BOW_COOLDOWN;
    else if (type === 'burst') { h.burstTimer = BURST_COOLDOWN; h.burstShotsLeft = 0; h.burstShotTimer = 0; }
    else if (type === 'rocket') h.rocketTimer = ROCKET_COOLDOWN;
  }

  pickupWeapon(h) {
    for (let i = this.weapons.length - 1; i >= 0; i--) {
      const w = this.weapons[i];
      if (Math.hypot(h.x - w.x, h.y - w.y) >= HORSE_R) continue;
      // Already holding this exact type — leave it on the ground for someone else
      // instead of "swapping" it for an identical copy every tick it stands here.
      if (h.heldWeapons.includes(w.type)) continue;
      // This exact weapon is the one h itself just swapped away — still within its
      // own brief drop-immunity window, so skip it (see WEAPON_DROP_IMMUNITY).
      if (w.droppedBy === h && this.simTime < w.immuneUntil) continue;
      if (this.multiWeapon) {
        h.heldWeapons.push(w.type);
      } else {
        if (h.heldWeapons.length) {
          this.weapons.push({
            type: h.heldWeapons[0], x: h.x, y: h.y,
            droppedBy: h, immuneUntil: this.simTime + WEAPON_DROP_IMMUNITY
          });
        }
        h.heldWeapons = [w.type];
      }
      this.resetWeaponTimer(h, w.type);
      this.pendingEvents.push({ type: 'pickupWeapon', weapon: w.type, themeIdx: h.themeIdx });
      this.weapons.splice(i, 1);
      // Single-weapon mode: stop after one pickup. Without this, standing near two
      // DIFFERENT weapon types (increasingly common now that respawns can land close
      // to existing ones) swapped through both in the same tick — each swapped-out
      // weapon gets dropped right on the horse's own position, which is exactly where
      // the next one also gets processed from, so it kept re-triggering next tick too.
      if (!this.multiWeapon) break;
    }
  }

  pickupItem(h) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (Math.hypot(h.x - p.x, h.y - p.y) < HORSE_R) {
        this.pickups.splice(i, 1);
        this.applyRandomEffect(h);
      }
    }
  }

  applyRandomEffect(h) {
    if (!this.enabledEffects.length) return;
    const effect = this.enabledEffects[Math.floor(Math.random() * this.enabledEffects.length)];
    this.pendingEvents.push({ type: 'pickupItem', effect, themeIdx: h.themeIdx });
    if (effect === 'speedBoost') {
      if (h.speedBoostTimer <= 0) { h.vx *= SPEED_BOOST_MULT; h.vy *= SPEED_BOOST_MULT; }
      h.speedBoostTimer = SPEED_BOOST_DURATION; // refreshing doesn't re-stack the multiplier
    } else if (effect === 'shield') {
      h.shieldTimer = SHIELD_DURATION;
    } else if (effect === 'revive') {
      const dead = this.horses.filter(o => !o.alive);
      dead.forEach(o => {
        o.alive = true; o.hp = o.maxHp; o.deathT = 0; o.deathTime = null; o.heldWeapons = [];
        o.shieldTimer = 0; o.speedBoostTimer = 0; o.swordCooldowns = {};
        const dir = rand(0, Math.PI * 2), speed = rand(HORSE_SPEED_MIN, HORSE_SPEED_MAX) * THEMES[o.themeIdx].speedMult;
        o.vx = Math.cos(dir) * speed; o.vy = Math.sin(dir) * speed;
      });
      if (dead.length > 0) this.pendingEvents.push({ type: 'revive' });
    }
  }

  fireRevolver(h) {
    this.bullets.push({
      x: h.x, y: h.y,
      vx: Math.cos(h.revolverAngle) * BULLET_SPEED, vy: Math.sin(h.revolverAngle) * BULLET_SPEED,
      owner: h, weaponType: 'revolver', bounces: 0
    });
    this.pendingEvents.push({ type: 'shotFired', weapon: 'revolver', themeIdx: h.themeIdx });
  }

  // The arrow gets exactly one bounce off a wall or solid obstacle (never off a horse —
  // hitting a horse always just deals damage) before it's spent.
  fireBow(h) {
    this.bullets.push({
      x: h.x, y: h.y,
      vx: Math.cos(h.bowAngle) * ARROW_SPEED, vy: Math.sin(h.bowAngle) * ARROW_SPEED,
      owner: h, weaponType: 'bow', bounces: 1
    });
    this.pendingEvents.push({ type: 'shotFired', weapon: 'bow', themeIdx: h.themeIdx });
  }

  fireBurstShot(h) {
    this.bullets.push({
      x: h.x, y: h.y,
      vx: Math.cos(h.burstFireAngle) * BURST_SPEED, vy: Math.sin(h.burstFireAngle) * BURST_SPEED,
      owner: h, weaponType: 'burst', bounces: 0
    });
    this.pendingEvents.push({ type: 'shotFired', weapon: 'burst', themeIdx: h.themeIdx });
  }

  fireRocket(h) {
    this.rockets.push({
      x: h.x, y: h.y,
      vx: Math.cos(h.rocketAngle) * ROCKET_SPEED, vy: Math.sin(h.rocketAngle) * ROCKET_SPEED,
      owner: h, spawnT: this.simTime
    });
    this.pendingEvents.push({ type: 'shotFired', weapon: 'rocket', themeIdx: h.themeIdx });
  }

  // AOE blast on contact with anything — including its own shooter, if still in range.
  // killer is null for the owner's own horse so a self-hit never shows as a self-credited kill.
  explodeRocket(x, y, owner) {
    this.pendingEvents.push({ type: 'explosion', x, y });
    this.horses.forEach(h => {
      if (!h.alive) return;
      if (Math.hypot(h.x - x, h.y - y) <= ROCKET_BLAST_RADIUS) {
        this.damageHorse(h, ROCKET_DMG, h === owner ? null : owner, 'rocket');
      }
    });
    this.obstacles.forEach(o => {
      if (o.hp <= 0 || o.type !== OBSTACLE_TYPES.BREAKABLE) return;
      if (circleRectOverlap(x, y, ROCKET_BLAST_RADIUS, o)) {
        o.hp = 0;
        this.pendingEvents.push({ type: 'blockBreak', x: o.x + o.w / 2, y: o.y + o.h / 2 });
      }
    });
  }

  // killer/weaponType are optional and only used to report a kill for the killfeed
  damageHorse(h, amt, killer, weaponType) {
    if (!h.alive) return;
    if (h.shieldTimer > 0) return; // bubble shield blocks all damage outright
    h.hp -= amt;
    if (killer) killer.damageDealt += amt; // zone damage has no killer, so it's uncredited
    // Any hit from another horse — not just a killing blow — steals the crown.
    if (this.crownEnabled && killer && killer !== h && h === this.crownHolder && this.crownTransferCooldown <= 0) {
      this.transferCrown(killer);
    }
    if (h.hp <= 0) {
      h.alive = false;
      h.deathTime = this.simTime;
      h.heldWeapons.forEach((type, i) => {
        this.weapons.push({ type, x: h.x + rand(-8, 8), y: h.y + rand(-8, 8) });
      });
      h.heldWeapons = [];
      // Mostly a no-op in the common case (a killing blow already transferred the crown
      // via the hook above); this only matters for a holder killed with no killer, e.g.
      // zone or self-inflicted damage.
      if (this.crownEnabled && h === this.crownHolder) {
        this.crownHolder = null;
        this.crownPos = { x: h.x, y: h.y };
        this.pendingEvents.push({ type: 'crownDrop', x: h.x, y: h.y });
      }
      this.pendingEvents.push({
        type: 'kill',
        victim: { themeIdx: h.themeIdx, owner: h.owner },
        killer: killer ? { themeIdx: killer.themeIdx, owner: killer.owner } : null,
        weapon: weaponType || null
      });
      if (killer) {
        killer.kills += 1;
        killer.killTimestamps = killer.killTimestamps.filter(t => this.simTime - t < MULTIKILL_WINDOW);
        killer.killTimestamps.push(this.simTime);
        if (killer.killTimestamps.length >= 2) {
          this.pendingEvents.push({
            type: 'multikill',
            killer: { themeIdx: killer.themeIdx, owner: killer.owner },
            count: killer.killTimestamps.length
          });
        }
      }
    }
  }

  maybeRespawnWeapon(dt) {
    if (!this.weaponRespawnEnabled) return;
    this.weaponRespawnTimer -= dt;
    if (this.weaponRespawnTimer > 0) return;
    this.weaponRespawnTimer = WEAPON_RESPAWN_INTERVAL;
    if (this.weapons.length >= MAX_GROUND_WEAPONS) return;
    const type = this.enabledWeaponTypes[irand(0, this.enabledWeaponTypes.length - 1)];
    const p = this.freeSpot(20);
    this.weapons.push({ type, x: p.x, y: p.y });
  }

  maybeRespawnItem(dt) {
    if (!this.itemRespawnEnabled) return;
    this.itemRespawnTimer -= dt;
    if (this.itemRespawnTimer > 0) return;
    this.itemRespawnTimer = ITEM_RESPAWN_INTERVAL;
    if (this.pickups.length >= MAX_GROUND_ITEMS) return;
    const p = this.freeSpot(20);
    this.pickups.push({ x: p.x, y: p.y });
  }

  // Each wildcard spot runs its own independent timer; on expiry it drops a random
  // weapon or the Mystery Box item right there — but only if nothing already sits
  // there uncollected, so a camped wildcard doesn't just pile up loot underneath it.
  maybeTriggerWildcards(dt) {
    if (!this.wildcardSpots.length) return;
    this.wildcardSpots.forEach(spot => {
      spot.timer -= dt;
      if (spot.timer > 0) return;
      spot.timer = rand(WILDCARD_MIN_INTERVAL, WILDCARD_MAX_INTERVAL);
      const occupied = this.weapons.some(w => Math.hypot(w.x - spot.x, w.y - spot.y) < WILDCARD_OCCUPIED_RADIUS)
        || this.pickups.some(p => Math.hypot(p.x - spot.x, p.y - spot.y) < WILDCARD_OCCUPIED_RADIUS);
      if (occupied) return;
      if (Math.random() < 0.5) {
        const type = WEAPON_TYPES[irand(0, WEAPON_TYPES.length - 1)];
        this.weapons.push({ type, x: spot.x, y: spot.y });
      } else {
        this.pickups.push({ x: spot.x, y: spot.y });
      }
      this.pendingEvents.push({ type: 'wildcardSpawn', x: spot.x, y: spot.y });
    });
  }

  // Royal Horse: hands the crown to a new holder — from a bounce, a projectile hit,
  // or the initial ground pickup (which calls this inline instead, since it also
  // needs to clear crownPos). Resets the flicker-guard cooldown either way.
  transferCrown(newHolder) {
    this.crownHolder = newHolder;
    this.crownTransferCooldown = CROWN_TRANSFER_COOLDOWN;
    this.pendingEvents.push({ type: 'crownTransfer', themeIdx: newHolder.themeIdx });
  }

  // returns { ended, winner } — winner is a horse object, or null on a draw
  step(dt) {
    this.simTime += dt;
    this.pendingEvents = [];

    if (this.zone) {
      const t = Math.max(0, Math.min(1, (this.simTime - ZONE_GRACE_PERIOD) / ZONE_SHRINK_DURATION));
      this.zone.r = this.zone.startR - (this.zone.startR - ZONE_MIN_RADIUS) * t;
    }

    this.maybeRespawnWeapon(dt);
    this.maybeRespawnItem(dt);
    this.maybeTriggerWildcards(dt);

    this.horses.forEach(h => {
      if (!h.alive) { h.deathT = Math.min(1, h.deathT + dt * 1.2); return; }
      h.phase += dt * 10;
      const { speedMult, onLaunchPad } = this.readTerrain(h);
      h.x += h.vx * dt * speedMult; h.y += h.vy * dt * speedMult;
      h.facing = h.vx >= 0 ? 1 : -1;

      if (h.speedBoostTimer > 0) {
        h.speedBoostTimer -= dt;
        if (h.speedBoostTimer <= 0) { h.speedBoostTimer = 0; h.vx /= SPEED_BOOST_MULT; h.vy /= SPEED_BOOST_MULT; }
      }
      if (h.shieldTimer > 0) h.shieldTimer = Math.max(0, h.shieldTimer - dt);
      if (h.launchCooldown > 0) h.launchCooldown = Math.max(0, h.launchCooldown - dt);

      // fixed speed, straight line — direction only ever changes from an actual
      // collision (wall, obstacle, or another horse), never a random wander
      if (h.x < BOUND.x + HORSE_R) { h.x = BOUND.x + HORSE_R; h.vx = Math.abs(h.vx); }
      if (h.x > BOUND.x + BOUND.w - HORSE_R) { h.x = BOUND.x + BOUND.w - HORSE_R; h.vx = -Math.abs(h.vx); }
      if (h.y < BOUND.y + HORSE_R) { h.y = BOUND.y + HORSE_R; h.vy = Math.abs(h.vy); }
      if (h.y > BOUND.y + BOUND.h - HORSE_R) { h.y = BOUND.y + BOUND.h - HORSE_R; h.vy = -Math.abs(h.vy); }

      this.reflectOffObstacles(h);
      this.pickupWeapon(h);
      this.pickupItem(h);

      if (this.crownEnabled && !this.crownHolder && this.crownPos) {
        if (Math.hypot(h.x - this.crownPos.x, h.y - this.crownPos.y) < CROWN_PICKUP_RADIUS) {
          this.crownHolder = h;
          this.crownPos = null;
          this.crownTransferCooldown = CROWN_TRANSFER_COOLDOWN;
          this.pendingEvents.push({ type: 'crownPickup', themeIdx: h.themeIdx });
        }
      }
      if (this.crownEnabled && h === this.crownHolder) h.crownTime += dt;

      if (onLaunchPad && h.launchCooldown <= 0) {
        const sp = Math.hypot(h.vx, h.vy) || 1;
        h.vx = (h.vx / sp) * LAUNCH_SPEED;
        h.vy = (h.vy / sp) * LAUNCH_SPEED;
        h.launchCooldown = LAUNCH_COOLDOWN;
      }

      if (this.zone) {
        const dist = Math.hypot(h.x - this.zone.cx, h.y - this.zone.cy);
        if (dist > this.zone.r) this.damageHorse(h, ZONE_DAMAGE_PER_SEC * dt, null, 'zone');
      }

      // Independent per-type blocks (not else-if) — multi-weapon mode can have several
      // of these true at once; each type already tracks its own angle/timer state.
      if (h.heldWeapons.includes('revolver')) {
        h.revolverAngle += dt * REVOLVER_SPIN;
        h.revolverTimer -= dt;
        if (h.revolverTimer <= 0) { this.fireRevolver(h); h.revolverTimer = REVOLVER_COOLDOWN; }
      }
      if (h.heldWeapons.includes('bow')) {
        h.bowAngle += dt * BOW_SPIN;
        h.bowTimer -= dt;
        if (h.bowTimer <= 0) { this.fireBow(h); h.bowTimer = BOW_COOLDOWN; }
      }
      if (h.heldWeapons.includes('sword')) {
        h.swordSpinAngle += dt * SWORD_SPIN;
      }
      if (h.heldWeapons.includes('burst')) {
        h.burstAngle += dt * BURST_SPIN; // keeps sweeping continuously, even mid-burst
        if (h.burstShotsLeft > 0) {
          h.burstShotTimer -= dt;
          if (h.burstShotTimer <= 0) {
            this.fireBurstShot(h);
            h.burstShotsLeft--;
            h.burstShotTimer = BURST_SHOT_GAP;
          }
        } else {
          h.burstTimer -= dt;
          if (h.burstTimer <= 0) {
            h.burstFireAngle = h.burstAngle; // lock in the aim for every shot in this burst
            this.fireBurstShot(h);
            h.burstShotsLeft = 2;
            h.burstShotTimer = BURST_SHOT_GAP;
            h.burstTimer = BURST_COOLDOWN;
          }
        }
      }
      if (h.heldWeapons.includes('rocket')) {
        h.rocketAngle += dt * ROCKET_SPIN;
        h.rocketTimer -= dt;
        if (h.rocketTimer <= 0) { this.fireRocket(h); h.rocketTimer = ROCKET_COOLDOWN; }
      }
    });

    for (let i = 0; i < this.horses.length; i++) {
      const a = this.horses[i]; if (!a.alive) continue;
      for (let j = i + 1; j < this.horses.length; j++) {
        const b = this.horses[j]; if (!b.alive) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist < HORSE_R * 1.5 && dist > 0.001) {
          const nx = dx / dist, ny = dy / dist;
          const overlap = HORSE_R * 1.5 - dist;
          a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
          b.x += nx * overlap / 2; b.y += ny * overlap / 2;
          const tmpvx = a.vx, tmpvy = a.vy;
          a.vx = b.vx; a.vy = b.vy; b.vx = tmpvx; b.vy = tmpvy;

          const key = i + "_" + j;
          const cd = a.swordCooldowns[key] || 0;
          if (cd <= 0) {
            if (a.heldWeapons.includes('sword')) this.damageHorse(b, SWORD_DMG, a, 'sword');
            if (b.heldWeapons.includes('sword')) this.damageHorse(a, SWORD_DMG, b, 'sword');
            a.swordCooldowns[key] = SWORD_HIT_COOLDOWN;
          }
          // Crown transfer isn't gated by the sword-hit cooldown above — any bump
          // steals it, guarded only by its own separate flicker-prevention cooldown.
          if (this.crownEnabled && this.crownTransferCooldown <= 0) {
            if (a === this.crownHolder) this.transferCrown(b);
            else if (b === this.crownHolder) this.transferCrown(a);
          }
        }
      }
    }
    this.horses.forEach(h => {
      Object.keys(h.swordCooldowns).forEach(k => h.swordCooldowns[k] = Math.max(0, h.swordCooldowns[k] - dt));
    });
    if (this.crownTransferCooldown > 0) this.crownTransferCooldown = Math.max(0, this.crownTransferCooldown - dt);
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      let dead = false;

      // A bow's arrow (bounces:1) ricochets off exactly one wall or solid obstacle;
      // a revolver's/burst's bullet (bounces:0) always just dies on first contact, as before.
      // Neither ever bounces off a horse — that always just lands the hit.
      if (b.x < BOUND.x || b.x > BOUND.x + BOUND.w) {
        if (b.bounces > 0) { b.vx = -b.vx; b.bounces--; b.x = Math.max(BOUND.x, Math.min(BOUND.x + BOUND.w, b.x)); }
        else dead = true;
      }
      if (!dead && (b.y < BOUND.y || b.y > BOUND.y + BOUND.h)) {
        if (b.bounces > 0) { b.vy = -b.vy; b.bounces--; b.y = Math.max(BOUND.y, Math.min(BOUND.y + BOUND.h, b.y)); }
        else dead = true;
      }
      if (!dead) {
        for (const o of this.obstacles) {
          if (o.hp <= 0 || !circleRectOverlap(b.x, b.y, 3, o)) continue;
          if (o.type === OBSTACLE_TYPES.BREAKABLE) {
            o.hp = 0;
            this.pendingEvents.push({ type: 'blockBreak', x: o.x + o.w / 2, y: o.y + o.h / 2 });
            dead = true;
          } else if (b.bounces > 0) {
            const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
            const dx = b.x - cx, dy = b.y - cy;
            if (Math.abs(dx / o.w) > Math.abs(dy / o.h)) b.vx = -b.vx; else b.vy = -b.vy;
            b.bounces--;
          } else {
            dead = true;
          }
          break;
        }
      }
      if (!dead) {
        for (const h of this.horses) {
          if (h.alive && h !== b.owner && Math.hypot(h.x - b.x, h.y - b.y) < HORSE_R) {
            const dmg = b.weaponType === 'bow' ? ARROW_DMG : b.weaponType === 'burst' ? BURST_DMG : BULLET_DMG;
            this.damageHorse(h, dmg, b.owner, b.weaponType);
            dead = true; break;
          }
        }
      }
      if (dead) this.bullets.splice(i, 1);
    }

    // Rockets: separate update loop — explode on ANY contact (wall, obstacle, or horse),
    // not just a horse hit, and never bounce.
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.x += r.vx * dt; r.y += r.vy * dt;
      let exploded = false;

      if (r.x < BOUND.x || r.x > BOUND.x + BOUND.w || r.y < BOUND.y || r.y > BOUND.y + BOUND.h) {
        r.x = Math.max(BOUND.x, Math.min(BOUND.x + BOUND.w, r.x));
        r.y = Math.max(BOUND.y, Math.min(BOUND.y + BOUND.h, r.y));
        exploded = true;
      }
      if (!exploded) {
        for (const o of this.obstacles) {
          if (o.hp <= 0) continue;
          if (circleRectOverlap(r.x, r.y, 4, o)) { exploded = true; break; }
        }
      }
      if (!exploded) {
        // Grace window right at spawn so the rocket doesn't instantly detonate on its
        // own shooter before it's had a chance to actually travel anywhere.
        const justSpawned = this.simTime - r.spawnT < 0.15;
        for (const h of this.horses) {
          if (!h.alive) continue;
          if (h === r.owner && justSpawned) continue;
          if (Math.hypot(h.x - r.x, h.y - r.y) < HORSE_R) { exploded = true; break; }
        }
      }
      if (exploded) {
        this.explodeRocket(r.x, r.y, r.owner);
        this.rockets.splice(i, 1);
      }
    }
    this.obstacles = this.obstacles.filter(o => o.hp > 0);

    const stillAlive = this.horses.filter(h => h.alive);
    const timeUp = this.crownEnabled && this.simTime >= ROYAL_HORSE_TIME_LIMIT;
    if (stillAlive.length <= 1 || timeUp) {
      // Royal Horse crowns whoever accumulated the most total holding time — not
      // necessarily whoever has it (or is even still alive) at the final whistle.
      const winner = this.crownEnabled
        ? this.horses.reduce((best, h) => (!best || h.crownTime > best.crownTime) ? h : best, null)
        : (stillAlive[0] || null);
      this.winnerIdx = winner ? this.horses.indexOf(winner) : -1;
      return { ended: true, winner };
    }
    return { ended: false, winner: null };
  }

  weaponAngleFor(h, type) {
    if (type === 'sword') return h.swordSpinAngle;
    if (type === 'revolver') return h.revolverAngle;
    if (type === 'bow') return h.bowAngle;
    if (type === 'burst') return h.burstAngle;
    if (type === 'rocket') return h.rocketAngle;
    return 0;
  }

  // Compact JSON-serializable snapshot for broadcasting.
  snapshot() {
    return {
      simTime: this.simTime,
      obstacles: this.obstacles.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h, type: o.type, hp: o.hp })),
      weapons: this.weapons.map(w => ({ type: w.type, x: w.x, y: w.y })),
      pickups: this.pickups.map(p => ({ x: p.x, y: p.y })),
      terrain: this.terrain.map(t => ({ x: t.x, y: t.y, w: t.w, h: t.h, type: t.type })),
      bullets: this.bullets.map(b => ({ x: b.x, y: b.y })),
      rockets: this.rockets.map(r => ({ x: r.x, y: r.y, angle: Math.atan2(r.vy, r.vx) })),
      zone: this.zone ? { cx: this.zone.cx, cy: this.zone.cy, r: this.zone.r } : null,
      crown: this.crownEnabled ? { pos: this.crownPos, holderThemeIdx: this.crownHolder ? this.crownHolder.themeIdx : null } : null,
      events: this.pendingEvents,
      horses: this.horses.map(h => ({
        themeIdx: h.themeIdx, x: h.x, y: h.y, hp: h.hp, maxHp: h.maxHp, alive: h.alive, deathT: h.deathT,
        phase: h.phase, facing: h.facing, owner: h.owner,
        weapons: h.heldWeapons.map(type => ({ type, angle: this.weaponAngleFor(h, type) })),
        shielded: h.shieldTimer > 0, boosted: h.speedBoostTimer > 0,
        crownTime: this.crownEnabled ? Math.round(h.crownTime * 10) / 10 : undefined,
        hasCrown: this.crownEnabled && h === this.crownHolder
      }))
    };
  }
}
