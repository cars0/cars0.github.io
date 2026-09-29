import { THEMES, BOUND, GRID_SIZE, archetypeLabel, TERRAIN_TYPES, VS_SPLASH_MS, COUNTDOWN_STEP_MS, HAT_TYPES, WILDCARD_OCCUPIED_RADIUS, MAX_PLAYERS_AND_BOTS, PRE_BATTLE_DELAY_MS } from './shared/constants.js';
import { MAP_PACK } from './shared/mapPack.js';
import { drawHorseThumb, renderState, drawGround, drawCrate, drawWeaponIcon, drawHorseSpawnMarker, drawTerrain, drawExplosion, drawWildcardMarker, drawCrownSpawnMarker } from './render.js';
import { unlockAudio, sfx, setMuted, isMuted } from './audio.js';
import { HorseBattleSim } from './sim.js';

const setupScreen = document.getElementById('setupScreen');
const endScreen = document.getElementById('endScreen');
const editorScreen = document.getElementById('editorScreen');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// ---------- audio ----------
document.addEventListener('click', unlockAudio, { once: true });
const muteBtn = document.getElementById('muteBtn');
function refreshMuteBtn() { muteBtn.textContent = isMuted() ? '🔇' : '🔊'; }
muteBtn.addEventListener('click', () => { setMuted(!isMuted()); refreshMuteBtn(); });
refreshMuteBtn();

// ---------- fullscreen ----------
const fullscreenBtn = document.getElementById('fullscreenBtn');
function refreshFullscreenBtn() { fullscreenBtn.textContent = document.fullscreenElement ? '🗗' : '⛶'; }
fullscreenBtn.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => { /* denied/unsupported — button just stays a no-op */ });
});
document.addEventListener('fullscreenchange', refreshFullscreenBtn);
refreshFullscreenBtn();

// ---------- sim / round state ----------
// Single-player: there's exactly one "player" (you), always present, so unlike the
// LAN version there's no lobby of connecting/disconnecting humans to track — just
// your own horse pick (or none, if you just want to watch bots) plus the settings
// below, held as plain local state instead of synced over a WebSocket.
const MY_ID = 'you';
const sim = new HorseBattleSim();
let claims = new Array(8).fill(null); // idx -> { id: MY_ID, name, hat } | null — at most one set
let lastSnapshot = null;
let lastWildcardSpots = [];
let royalHorseFlag = false; // latched at round start, used for scoreboard sort/columns

function myClaimIdx() { return claims.findIndex(c => !!c); }

document.body.classList.add('compact');

// ---------- lobby / roster ----------
const rosterEl = document.getElementById('roster');
const startBtn = document.getElementById('startBtn');

function setClaim(idx) {
  const mine = myClaimIdx();
  if (mine !== -1) claims[mine] = null;
  claims[idx] = { id: MY_ID, name: 'You', hat: myHat };
  renderRoster();
  hatRow.classList.remove('hidden');
}
function unclaim() {
  const mine = myClaimIdx();
  if (mine !== -1) claims[mine] = null;
  renderRoster();
  hatRow.classList.add('hidden');
}

function renderRoster() {
  rosterEl.innerHTML = '';
  THEMES.forEach((theme, i) => {
    const claim = claims[i];
    const card = document.createElement('div');
    card.className = 'horse-card' + (claim ? ' picked' : '');
    card.tabIndex = 0;
    const c = document.createElement('canvas');
    c.width = 72; c.height = 54;
    const label = document.createElement('span');
    label.textContent = theme.name;
    const statLabel = document.createElement('div');
    statLabel.className = 'stat-label';
    statLabel.textContent = archetypeLabel(theme);
    card.appendChild(c); card.appendChild(label); card.appendChild(statLabel);
    const pick = () => { if (claim) unclaim(); else setClaim(i); };
    card.addEventListener('click', pick);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') pick(); });
    rosterEl.appendChild(card);
    drawHorseThumb(c, theme, claim ? (claim.hat || 'none') : 'none');
  });
}
renderRoster();

document.getElementById('shuffleBtn').addEventListener('click', () => {
  const open = claims.map((c, i) => c ? null : i).filter(i => i !== null);
  const mine = myClaimIdx();
  const pool = mine >= 0 ? [mine, ...open] : open;
  if (pool.length === 0) return;
  setClaim(pool[Math.floor(Math.random() * pool.length)]);
});
startBtn.addEventListener('click', beginRound);

// ---------- map selection ----------
const LEVELS_KEY = 'hb-levels';
function loadLevels() {
  try { return JSON.parse(localStorage.getItem(LEVELS_KEY) || '[]'); } catch { return []; }
}
function saveLevels(levels) { localStorage.setItem(LEVELS_KEY, JSON.stringify(levels)); }

const mapSelect = document.getElementById('mapSelect');
const itemToggleRow = document.getElementById('itemToggleRow');
let currentMapName = null;

// Map Pack entries are matched by name first (they're curated and never renamed),
// falling back to the player's own saved levels.
function findMapByName(name) {
  return MAP_PACK.find(m => m.name === name) || loadLevels().find(l => l.name === name);
}

function refreshMapSelect() {
  const levels = loadLevels();
  mapSelect.innerHTML = '';
  const randomOpt = document.createElement('option');
  randomOpt.value = ''; randomOpt.textContent = 'Random Map';
  mapSelect.appendChild(randomOpt);
  const packGroup = document.createElement('optgroup');
  packGroup.label = 'Map Pack';
  MAP_PACK.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.name; opt.textContent = m.name;
    packGroup.appendChild(opt);
  });
  mapSelect.appendChild(packGroup);
  if (levels.length) {
    const yourGroup = document.createElement('optgroup');
    yourGroup.label = 'Your Levels';
    levels.forEach(lvl => {
      const opt = document.createElement('option');
      opt.value = lvl.name; opt.textContent = lvl.name;
      yourGroup.appendChild(opt);
    });
    mapSelect.appendChild(yourGroup);
  }
  mapSelect.value = currentMapName && findMapByName(currentMapName) ? currentMapName : '';
  renderMapPreview();
}
mapSelect.addEventListener('change', () => {
  currentMapName = mapSelect.value || null;
  // custom levels bring their own fixed weapon layout and never spawn item boxes,
  // so the toggles only make sense — and only show up — for a random map
  itemToggleRow.classList.toggle('hidden', !!currentMapName);
  renderMapPreview();
});

// A live thumbnail of the selected custom level, so you can see the layout before
// committing to it — blank ground for "Random Map", which has no fixed layout.
const mapPreviewCanvas = document.getElementById('mapPreviewCanvas');
const mapPreviewCtx = mapPreviewCanvas.getContext('2d');
mapPreviewCtx.imageSmoothingEnabled = false;
function renderMapPreview() {
  drawGround(mapPreviewCtx);
  if (!mapSelect.value) return; // Random Map — nothing fixed to preview
  const lvl = findMapByName(mapSelect.value);
  if (!lvl) return;
  (lvl.terrain || []).forEach(t => drawTerrain(mapPreviewCtx, t));
  (lvl.obstacles || []).forEach(o => drawCrate(mapPreviewCtx, o));
  (lvl.weapons || []).forEach(w => drawWeaponIcon(mapPreviewCtx, w.x, w.y, w.type, 2.2));
  (lvl.wildcards || []).forEach(w => drawWildcardMarker(mapPreviewCtx, w.x, w.y));
  if (lvl.crownSpawn) drawCrownSpawnMarker(mapPreviewCtx, lvl.crownSpawn.x, lvl.crownSpawn.y);
  (lvl.horseSpawns || []).forEach((s, i) => { if (s) drawHorseSpawnMarker(mapPreviewCtx, s.x, s.y, i + 1, THEMES[i]); });
}
refreshMapSelect();
itemToggleRow.classList.toggle('hidden', !!currentMapName);

// ---------- bot count ----------
const botCountLabel = document.getElementById('botCountLabel');
const maxBotsNote = document.getElementById('maxBotsNote');
const botMinusBtn = document.getElementById('botMinusBtn');
const botPlusBtn = document.getElementById('botPlusBtn');
const MAX_BOTS = MAX_PLAYERS_AND_BOTS - 1; // one slot is always "you" (claimed or not)
let currentBotCount = MAX_BOTS;

function setBotCount(n) {
  currentBotCount = Math.max(0, Math.min(MAX_BOTS, n));
  botCountLabel.textContent = currentBotCount;
  botMinusBtn.disabled = currentBotCount <= 0;
  botPlusBtn.disabled = currentBotCount >= MAX_BOTS;
}
setBotCount(MAX_BOTS);
maxBotsNote.textContent = `(max ${MAX_BOTS})`;
botMinusBtn.addEventListener('click', () => setBotCount(currentBotCount - 1));
botPlusBtn.addEventListener('click', () => setBotCount(currentBotCount + 1));

// ---------- item spawn toggles (random maps only) ----------
const itemSword = document.getElementById('itemSword');
const itemRevolver = document.getElementById('itemRevolver');
const itemBow = document.getElementById('itemBow');
const itemBurst = document.getElementById('itemBurst');
const itemRocket = document.getElementById('itemRocket');
const itemMysteryBox = document.getElementById('itemMysteryBox');

// ---------- shrinking arena / multi-weapon / Royal Horse (pre-game toggles) ----------
const zoneToggle = document.getElementById('zoneToggle');
const multiWeaponToggle = document.getElementById('multiWeaponToggle');
const royalHorseToggle = document.getElementById('royalHorseToggle');

// ---------- hat cosmetics (picked once a horse is claimed) ----------
const hatRow = document.getElementById('hatRow');
const hatPicker = document.getElementById('hatPicker');
let myHat = localStorage.getItem('hb-hat') || 'none';
HAT_TYPES.forEach(hat => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = hat.label;
  btn.dataset.hat = hat.id;
  if (hat.id === myHat) btn.classList.add('active');
  btn.addEventListener('click', () => {
    myHat = hat.id;
    localStorage.setItem('hb-hat', myHat);
    hatPicker.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.hat === myHat));
    const mine = myClaimIdx();
    if (mine !== -1) { claims[mine].hat = myHat; renderRoster(); }
  });
  hatPicker.appendChild(btn);
});

// ---------- level editor ----------
const editorCanvas = document.getElementById('editorCanvas');
const editorCtx = editorCanvas.getContext('2d');
editorCtx.imageSmoothingEnabled = false;
const editorNameInput = document.getElementById('editorNameInput');
const levelsListEl = document.getElementById('levelsList');
let editorTool = 'breakable';
let editorObstacles = [];
let editorWeapons = [];
let editorTerrain = [];
let editorHorseSpawns = new Array(8).fill(null);
let editorWildcards = [];
let editorCrownSpawn = null;
const TERRAIN_TOOLS = new Set(Object.values(TERRAIN_TYPES));

document.getElementById('openEditorBtn').addEventListener('click', () => {
  setupScreen.classList.add('hidden');
  editorScreen.classList.remove('hidden');
  renderEditor();
  renderLevelsList();
});
document.getElementById('closeEditorBtn').addEventListener('click', () => {
  editorScreen.classList.add('hidden');
  setupScreen.classList.remove('hidden');
  refreshMapSelect(); // a level saved/deleted just now may have changed the map list
});

document.querySelectorAll('.palette button').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.tool === 'clear') {
      editorObstacles = []; editorWeapons = []; editorTerrain = []; editorHorseSpawns = new Array(8).fill(null);
      editorWildcards = []; editorCrownSpawn = null;
      renderEditor();
      return;
    }
    document.querySelectorAll('.palette button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    editorTool = btn.dataset.tool;
  });
});

function editorPointFromEvent(evt) {
  const rect = editorCanvas.getBoundingClientRect();
  const scaleX = editorCanvas.width / rect.width;
  const scaleY = editorCanvas.height / rect.height;
  return { x: (evt.clientX - rect.left) * scaleX, y: (evt.clientY - rect.top) * scaleY };
}

// Grid-snapped tools (blocks, terrain) paint a new cell only when the drag crosses
// into it; free-placed tools (weapon spawns) gate on a minimum distance instead, so
// dragging slowly doesn't flood dozens of overlapping spawns under the cursor.
const FREE_PLACE_MIN_DIST = 18;
let isPainting = false;
let lastPaintedCellKey = null;
let lastFreePos = null;

function applyToolAt(p) {
  if (editorTool === 'erase') {
    editorObstacles = editorObstacles.filter(o => !(p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h));
    editorWeapons = editorWeapons.filter(w => Math.hypot(w.x - p.x, w.y - p.y) > 14);
    editorTerrain = editorTerrain.filter(t => !(p.x >= t.x && p.x <= t.x + GRID_SIZE && p.y >= t.y && p.y <= t.y + GRID_SIZE));
    editorHorseSpawns = editorHorseSpawns.map(s => (s && Math.hypot(s.x - p.x, s.y - p.y) <= 14) ? null : s);
    editorWildcards = editorWildcards.filter(w => Math.hypot(w.x - p.x, w.y - p.y) > 14);
    if (editorCrownSpawn && Math.hypot(editorCrownSpawn.x - p.x, editorCrownSpawn.y - p.y) <= 14) editorCrownSpawn = null;
  } else if (editorTool === 'solid' || editorTool === 'breakable') {
    const size = GRID_SIZE;
    // floor to the cell's top-left corner so the block fills exactly one backdrop
    // grid cell, instead of rounding to the nearest line and straddling two cells
    const gx = Math.floor(p.x / GRID_SIZE) * GRID_SIZE;
    const gy = Math.floor(p.y / GRID_SIZE) * GRID_SIZE;
    const x = Math.max(BOUND.x, Math.min(BOUND.x + BOUND.w - size, gx));
    const y = Math.max(BOUND.y, Math.min(BOUND.y + BOUND.h - size, gy));
    const key = x + '_' + y;
    if (key === lastPaintedCellKey) return;
    lastPaintedCellKey = key;
    // clicking (or dragging back over) an occupied cell swaps its type instead of
    // stacking a duplicate
    editorObstacles = editorObstacles.filter(o => !(o.x === x && o.y === y));
    editorObstacles.push({ x, y, w: size, h: size, type: editorTool });
  } else if (TERRAIN_TOOLS.has(editorTool)) {
    const gx = Math.floor(p.x / GRID_SIZE) * GRID_SIZE;
    const gy = Math.floor(p.y / GRID_SIZE) * GRID_SIZE;
    const x = Math.max(BOUND.x, Math.min(BOUND.x + BOUND.w - GRID_SIZE, gx));
    const y = Math.max(BOUND.y, Math.min(BOUND.y + BOUND.h - GRID_SIZE, gy));
    const key = x + '_' + y;
    if (key === lastPaintedCellKey) return;
    lastPaintedCellKey = key;
    editorTerrain = editorTerrain.filter(t => !(t.x === x && t.y === y));
    editorTerrain.push({ x, y, w: GRID_SIZE, h: GRID_SIZE, type: editorTool });
  } else if (editorTool === 'horse') {
    const slot = editorHorseSpawns.findIndex(s => !s);
    if (slot === -1) return; // all 8 placed — erase one to reposition
    const x = Math.max(BOUND.x, Math.min(BOUND.x + BOUND.w, p.x));
    const y = Math.max(BOUND.y, Math.min(BOUND.y + BOUND.h, p.y));
    editorHorseSpawns[slot] = { x, y };
  } else if (editorTool === 'crownspawn') {
    editorCrownSpawn = { x: Math.max(BOUND.x, Math.min(BOUND.x + BOUND.w, p.x)), y: Math.max(BOUND.y, Math.min(BOUND.y + BOUND.h, p.y)) };
  } else if (editorTool === 'wildcard') {
    if (lastFreePos && Math.hypot(p.x - lastFreePos.x, p.y - lastFreePos.y) < FREE_PLACE_MIN_DIST) return;
    lastFreePos = p;
    editorWildcards.push({ x: Math.max(BOUND.x, Math.min(BOUND.x + BOUND.w, p.x)), y: Math.max(BOUND.y, Math.min(BOUND.y + BOUND.h, p.y)) });
  } else {
    if (lastFreePos && Math.hypot(p.x - lastFreePos.x, p.y - lastFreePos.y) < FREE_PLACE_MIN_DIST) return;
    lastFreePos = p;
    const x = Math.max(BOUND.x, Math.min(BOUND.x + BOUND.w, p.x));
    const y = Math.max(BOUND.y, Math.min(BOUND.y + BOUND.h, p.y));
    editorWeapons.push({ type: editorTool, x, y });
  }
  renderEditor();
}

editorCanvas.addEventListener('mousedown', evt => {
  isPainting = true;
  lastPaintedCellKey = null;
  lastFreePos = null;
  applyToolAt(editorPointFromEvent(evt));
});
editorCanvas.addEventListener('mousemove', evt => {
  if (!isPainting || editorTool === 'horse') return;
  applyToolAt(editorPointFromEvent(evt));
});
window.addEventListener('mouseup', () => { isPainting = false; });
editorCanvas.addEventListener('mouseleave', () => { lastPaintedCellKey = null; lastFreePos = null; });

function renderEditor() {
  drawGround(editorCtx);
  editorTerrain.forEach(t => drawTerrain(editorCtx, t));
  editorObstacles.forEach(o => drawCrate(editorCtx, o));
  editorWeapons.forEach(w => drawWeaponIcon(editorCtx, w.x, w.y, w.type, 2.2));
  editorWildcards.forEach(w => drawWildcardMarker(editorCtx, w.x, w.y));
  if (editorCrownSpawn) drawCrownSpawnMarker(editorCtx, editorCrownSpawn.x, editorCrownSpawn.y);
  editorHorseSpawns.forEach((s, i) => { if (s) drawHorseSpawnMarker(editorCtx, s.x, s.y, i + 1, THEMES[i]); });
}

function renderLevelsList() {
  const levels = loadLevels();
  levelsListEl.innerHTML = '';
  levels.forEach(lvl => {
    const row = document.createElement('div');
    row.className = 'level-row';
    const name = document.createElement('span'); name.textContent = lvl.name;
    const loadBtn = document.createElement('button'); loadBtn.className = 'secondary'; loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => {
      editorObstacles = JSON.parse(JSON.stringify(lvl.obstacles));
      editorWeapons = JSON.parse(JSON.stringify(lvl.weapons));
      editorTerrain = lvl.terrain ? JSON.parse(JSON.stringify(lvl.terrain)) : [];
      editorHorseSpawns = lvl.horseSpawns ? JSON.parse(JSON.stringify(lvl.horseSpawns)) : new Array(8).fill(null);
      editorWildcards = lvl.wildcards ? JSON.parse(JSON.stringify(lvl.wildcards)) : [];
      editorCrownSpawn = lvl.crownSpawn ? JSON.parse(JSON.stringify(lvl.crownSpawn)) : null;
      editorNameInput.value = lvl.name;
      renderEditor();
    });
    const delBtn = document.createElement('button'); delBtn.className = 'secondary'; delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => {
      saveLevels(loadLevels().filter(l => l.name !== lvl.name));
      renderLevelsList();
    });
    row.appendChild(name); row.appendChild(loadBtn); row.appendChild(delBtn);
    levelsListEl.appendChild(row);
  });
}

document.getElementById('saveLevelBtn').addEventListener('click', () => {
  const name = (editorNameInput.value || '').trim().slice(0, 30);
  if (!name) return;
  if (editorObstacles.length === 0 && editorWeapons.length === 0 && editorTerrain.length === 0
    && editorHorseSpawns.every(s => !s) && editorWildcards.length === 0 && !editorCrownSpawn) return;
  const levels = loadLevels().filter(l => l.name !== name);
  levels.push({
    name, obstacles: editorObstacles, weapons: editorWeapons, terrain: editorTerrain, horseSpawns: editorHorseSpawns,
    wildcards: editorWildcards, crownSpawn: editorCrownSpawn
  });
  saveLevels(levels);
  renderLevelsList();
});

// ---------- round lifecycle ----------
// Claimed slots (at most one, "you") always play; bots fill a random subset of the
// remaining slots up to the bot count, so e.g. 1 claimed + 0 bots is a solo watch.
function computeActiveSlots() {
  const claimedIdx = [], unclaimed = [];
  for (let i = 0; i < 8; i++) (claims[i] ? claimedIdx : unclaimed).push(i);
  for (let i = unclaimed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unclaimed[i], unclaimed[j]] = [unclaimed[j], unclaimed[i]];
  }
  const botN = Math.min(currentBotCount, unclaimed.length);
  return [...claimedIdx, ...unclaimed.slice(0, botN)];
}

let pendingStartTimeout = null;
let rafId = null;
let lastFrameTime = null;
let accumulator = 0;
const TICK_DT = 1 / 30;

function beginRound() {
  const chosen = currentMapName ? findMapByName(currentMapName) : null;
  royalHorseFlag = royalHorseToggle.checked;
  sim.newRound({
    activeSlots: computeActiveSlots(),
    owners: claims.slice(),
    customLayout: chosen ? {
      name: chosen.name, obstacles: chosen.obstacles, weapons: chosen.weapons, terrain: chosen.terrain,
      horseSpawns: chosen.horseSpawns, wildcards: chosen.wildcards, crownSpawn: chosen.crownSpawn
    } : null,
    itemConfig: {
      weapons: {
        sword: itemSword.checked, revolver: itemRevolver.checked, bow: itemBow.checked,
        burst: itemBurst.checked, rocket: itemRocket.checked
      },
      mysteryBox: itemMysteryBox.checked
    },
    shrinkingArena: zoneToggle.checked,
    multiWeapon: multiWeaponToggle.checked,
    royalHorse: royalHorseFlag
  });

  onBattleStart({
    horses: sim.horses.map(h => ({ themeIdx: h.themeIdx, owner: h.owner })),
    wildcards: sim.wildcardSpots.map(w => ({ x: w.x, y: w.y }))
  });
  onTick(sim.snapshot()); // frozen starting frame, matches the VS-splash/countdown window below

  if (pendingStartTimeout) clearTimeout(pendingStartTimeout);
  pendingStartTimeout = setTimeout(() => {
    pendingStartTimeout = null;
    runLoop();
  }, PRE_BATTLE_DELAY_MS);
}

function runLoop() {
  stopLoop();
  lastFrameTime = null;
  accumulator = 0;
  rafId = requestAnimationFrame(stepFrame);
}

function stepFrame(now) {
  if (lastFrameTime == null) lastFrameTime = now;
  // fixed 1/30s sim steps regardless of display refresh rate, matching the LAN
  // version's server-side 30Hz tick — capped so a throttled/backgrounded tab
  // doesn't try to fast-forward through minutes of missed simulation at once
  accumulator = Math.min(accumulator + (now - lastFrameTime) / 1000, 0.25);
  lastFrameTime = now;

  let ended = null;
  while (accumulator >= TICK_DT) {
    const result = sim.step(TICK_DT);
    accumulator -= TICK_DT;
    if (result.ended) { ended = result; break; }
  }
  onTick(sim.snapshot());

  if (ended) {
    stopLoop();
    const winner = ended.winner;
    const winnerInfo = winner ? { themeIdx: winner.themeIdx, owner: winner.owner } : null;
    const scoreboard = sim.horses.map(h => ({
      themeIdx: h.themeIdx, owner: h.owner, alive: h.alive,
      kills: h.kills, damageDealt: Math.round(h.damageDealt), deathTime: h.deathTime,
      crownTime: royalHorseFlag ? Math.round(h.crownTime * 10) / 10 : undefined
    }));
    onEnd({ winner: winnerInfo, scoreboard, royalHorse: royalHorseFlag });
    return;
  }
  rafId = requestAnimationFrame(stepFrame);
}

function stopLoop() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (pendingStartTimeout) { clearTimeout(pendingStartTimeout); pendingStartTimeout = null; }
}

// ---------- battle ----------
const vsSplash = document.getElementById('vsSplash');
const vsRosterEl = document.getElementById('vsRoster');

function onBattleStart(msg) {
  setupScreen.classList.add('hidden');
  endScreen.classList.add('hidden');
  editorScreen.classList.add('hidden');
  lastSnapshot = null;
  killfeedEl.innerHTML = '';
  crownLeaderboardEl.classList.add('hidden');
  camera = null;
  shakeStrength = 0;
  lastWildcardSpots = msg.wildcards || [];

  vsRosterEl.innerHTML = '';
  (msg.horses || []).forEach(h => {
    const theme = THEMES[h.themeIdx];
    const card = document.createElement('div');
    card.className = 'vs-card';
    const c = document.createElement('canvas');
    c.width = 72; c.height = 54;
    const label = document.createElement('span');
    label.textContent = h.owner ? h.owner.name : theme.name.split(' ')[0];
    card.appendChild(c); card.appendChild(label);
    vsRosterEl.appendChild(card);
    drawHorseThumb(c, theme);
  });
  vsSplash.classList.remove('hidden');
  setTimeout(() => vsSplash.classList.add('hidden'), VS_SPLASH_MS);
  setTimeout(playCountdown, VS_SPLASH_MS);
}

// "3, 2, 1, FIGHT!" — purely a visual; the sim is held frozen (no step() calls) for
// this same total window (PRE_BATTLE_DELAY_MS) so nothing actually moves yet.
const countdownNum = document.getElementById('countdownNum');
function playCountdown() {
  ['3', '2', '1', 'FIGHT!'].forEach((label, i) => {
    setTimeout(() => {
      countdownNum.textContent = label;
      countdownNum.classList.remove('show');
      void countdownNum.offsetWidth; // restart the CSS animation
      countdownNum.classList.add('show');
      sfx(label === 'FIGHT!' ? 'countdownGo' : 'countdownTick');
    }, i * COUNTDOWN_STEP_MS);
  });
}

function onTick(msg) {
  lastSnapshot = msg;
  (msg.events || []).forEach(handleEvent);
  updateCrownLeaderboard(msg);
}

// Royal Horse: a persistent side panel ranking every horse by total crown time,
// separate from the per-horse floating badge (which only appears once a horse has
// actually held it) — this is the always-visible full standings.
const crownLeaderboardEl = document.getElementById('crownLeaderboard');
function updateCrownLeaderboard(msg) {
  if (!msg.crown) { crownLeaderboardEl.classList.add('hidden'); return; }
  crownLeaderboardEl.classList.remove('hidden');
  crownLeaderboardEl.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'clb-title';
  title.textContent = '👑 Crown Time';
  crownLeaderboardEl.appendChild(title);
  const sorted = msg.horses.slice().sort((a, b) => (b.crownTime || 0) - (a.crownTime || 0));
  sorted.forEach(h => {
    const theme = THEMES[h.themeIdx];
    const mine = !!(h.owner && h.owner.id === MY_ID);
    const name = h.owner ? h.owner.name : theme.name.split(' ')[0];
    const row = document.createElement('div');
    row.className = 'clb-row' + (mine ? ' mine' : '');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = (h.hasCrown ? '👑 ' : '') + name;
    const timeSpan = document.createElement('span');
    timeSpan.textContent = `${(h.crownTime || 0).toFixed(1)}s`;
    row.appendChild(nameSpan); row.appendChild(timeSpan);
    crownLeaderboardEl.appendChild(row);
  });
}

// ---------- killfeed, revive flash, multikill callout, pickup call-outs ----------
const killfeedEl = document.getElementById('killfeed');
const reviveFlashEl = document.getElementById('reviveFlash');
const multikillEl = document.getElementById('multikillCallout');
const WEAPON_ICON = { sword: '🗡️', revolver: '🔫', bow: '🏹', burst: '🔱', rocket: '🚀', zone: '☄️' };
const WEAPON_LABEL = { sword: 'Sword', revolver: 'Revolver', bow: 'Bow', burst: 'Burst', rocket: 'Rocket' };
const MULTIKILL_LABELS = { 2: 'DOUBLE KILL!', 3: 'TRIPLE KILL!', 4: 'QUADRA KILL!' };
const EFFECT_LABELS = { speedBoost: 'Speed Boost!', shield: 'Shield!', revive: 'Revive!' };

function nameFor(ref) {
  if (!ref) return null;
  return ref.owner ? ref.owner.name : THEMES[ref.themeIdx].name.split(' ')[0];
}

function handleEvent(ev) {
  if (ev.type === 'kill') { addKillfeedEntry(ev); sfx('death'); triggerShake(6); }
  else if (ev.type === 'revive') { triggerReviveFlash(); sfx('revive'); }
  else if (ev.type === 'multikill') { triggerMultikillCallout(ev); sfx('multikill'); }
  else if (ev.type === 'pickupWeapon') { sfx('pickupWeapon'); addFloatingText(ev.themeIdx, '+' + (WEAPON_LABEL[ev.weapon] || ev.weapon), '#e3a83b'); }
  else if (ev.type === 'pickupItem') { sfx('pickupItem'); addFloatingText(ev.themeIdx, EFFECT_LABELS[ev.effect] || 'Item!', '#5bb0e6'); }
  else if (ev.type === 'blockBreak') { sfx('blockBreak'); addDebrisBurst(ev.x, ev.y); }
  else if (ev.type === 'shotFired') sfx(ev.weapon === 'bow' ? 'bowShot' : ev.weapon === 'rocket' ? 'rocketLaunch' : 'gunshot');
  else if (ev.type === 'explosion') { sfx('explosion'); addExplosionBurst(ev.x, ev.y); triggerShake(10); }
  else if (ev.type === 'wildcardSpawn') { sfx('wildcardSpawn'); addDebrisBurst(ev.x, ev.y); }
  else if (ev.type === 'crownPickup' || ev.type === 'crownTransfer') { sfx('crownPickup'); addFloatingText(ev.themeIdx, '👑', '#e3a83b'); }
  else if (ev.type === 'crownDrop') sfx('crownDrop');
}

function addKillfeedEntry(ev) {
  const killerName = nameFor(ev.killer);
  const victimName = nameFor(ev.victim);
  const icon = WEAPON_ICON[ev.weapon] || '💀';
  const row = document.createElement('div');
  row.className = 'kill-entry';
  row.textContent = killerName ? `${killerName} ${icon} ${victimName}` : `${icon} ${victimName}`;
  killfeedEl.appendChild(row);
  setTimeout(() => row.classList.add('fade'), 4600);
  setTimeout(() => row.remove(), 5000);
}

function triggerReviveFlash() {
  reviveFlashEl.classList.remove('show');
  void reviveFlashEl.offsetWidth; // restart the CSS animation
  reviveFlashEl.classList.add('show');
}

function triggerMultikillCallout(ev) {
  const killerName = nameFor(ev.killer);
  multikillEl.textContent = (MULTIKILL_LABELS[ev.count] || 'RAMPAGE!') + (killerName ? `\n${killerName}` : '');
  multikillEl.classList.remove('show');
  void multikillEl.offsetWidth;
  multikillEl.classList.add('show');
}

// ---------- end ----------
const endTitle = document.getElementById('endTitle');
const scoreboardTable = document.getElementById('scoreboardTable');

// Built with createElement/textContent, not innerHTML — a leftover habit from the
// LAN version where names came from other players; harmless here too.
function renderScoreboard(scoreboard, royalHorse) {
  scoreboardTable.innerHTML = '';
  if (!scoreboard || !scoreboard.length) return;
  const sorted = scoreboard.slice().sort((a, b) => {
    if (royalHorse) return (b.crownTime || 0) - (a.crownTime || 0);
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return (b.deathTime ?? -1) - (a.deathTime ?? -1);
  });

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const columns = royalHorse ? ['#', 'Horse', 'Crown Time', 'Result'] : ['#', 'Horse', 'Kills', 'Dmg', 'Result'];
  columns.forEach(text => {
    const th = document.createElement('th'); th.textContent = text; headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  scoreboardTable.appendChild(thead);

  const tbody = document.createElement('tbody');
  sorted.forEach((row, i) => {
    const theme = THEMES[row.themeIdx];
    const mine = row.owner && row.owner.id === MY_ID;
    const name = row.owner ? row.owner.name : theme.name.split(' ')[0];
    const tr = document.createElement('tr');
    if (mine) tr.className = 'mine-row';
    const result = row.alive ? 'Winner' : `Eliminated ${Math.round(row.deathTime)}s`;
    const cells = royalHorse
      ? [String(i + 1), name, `${(row.crownTime || 0).toFixed(1)}s`, result]
      : [String(i + 1), name, String(row.kills), String(row.damageDealt), result];
    cells.forEach(text => { const td = document.createElement('td'); td.textContent = text; tr.appendChild(td); });
    tbody.appendChild(tr);
  });
  scoreboardTable.appendChild(tbody);
}

function onEnd(msg) {
  const winner = msg.winner;
  renderScoreboard(msg.scoreboard, msg.royalHorse);

  const showScreen = () => {
    endTitle.innerHTML = '';
    if (!winner) {
      endTitle.textContent = "IT'S A DRAW";
    } else {
      const theme = THEMES[winner.themeIdx];
      const mine = winner.owner && winner.owner.id === MY_ID;
      endTitle.appendChild(document.createTextNode(mine ? '🏆 YOU WIN!' : '🏁 WINNER:'));
      endTitle.appendChild(document.createElement('br'));
      endTitle.appendChild(document.createTextNode(theme.name.toUpperCase()));
      const sub = document.createElement('span');
      sub.style.fontSize = '0.6em';
      sub.textContent = winner.owner ? winner.owner.name : '(Computer)';
      endTitle.appendChild(document.createElement('br'));
      endTitle.appendChild(sub);
    }
    endScreen.classList.remove('hidden');
    camera = null;
  };

  // A quick cinematic beat on the winning horse before the win screen — skipped
  // on a draw, since there's no single horse to hold on.
  const winnerHorse = winner && lastSnapshot && lastSnapshot.horses.find(h => h.themeIdx === winner.themeIdx);
  if (winnerHorse) {
    sfx('victory');
    triggerShake(14);
    camera = { x: winnerHorse.x, y: winnerHorse.y, zoom: 1 };
    const zoomStart = performance.now();
    const ZOOM_MS = 1100, TARGET_ZOOM = 2.1;
    (function animateZoom() {
      const t = Math.min(1, (performance.now() - zoomStart) / ZOOM_MS);
      camera.zoom = 1 + (TARGET_ZOOM - 1) * (1 - Math.pow(1 - t, 3)); // ease-out
      if (t < 1) requestAnimationFrame(animateZoom);
      else showScreen();
    })();
  } else {
    showScreen();
  }
}

document.getElementById('againBtn').addEventListener('click', beginRound);
document.getElementById('reselectBtn').addEventListener('click', () => {
  stopLoop();
  endScreen.classList.add('hidden');
  setupScreen.classList.remove('hidden');
});

// ---------- camera zoom, screen shake, floating text, debris (visual flair only) ----------
let camera = null;          // { x, y, zoom } while zoomed in on the win highlight
let shakeStrength = 0;
let floatingTexts = [];     // { themeIdx, text, color, start }
let debrisParticles = [];   // { x, y, vx, vy, color, start }
let explosions = [];        // { x, y, start } — rocket blasts, drawn as an expanding ring
const DEBRIS_COLORS = ['#8a6a3f', '#5c4526', '#6b5330'];
const EXPLOSION_MS = 450;

function rand(a, b) { return a + Math.random() * (b - a); }
function triggerShake(mag) { shakeStrength = Math.max(shakeStrength, mag); }
function addFloatingText(themeIdx, text, color) {
  floatingTexts.push({ themeIdx, text, color, start: performance.now() });
}
function addDebrisBurst(x, y) {
  const now = performance.now();
  for (let i = 0; i < 7; i++) {
    const ang = rand(0, Math.PI * 2), speed = rand(30, 90);
    debrisParticles.push({
      x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      color: DEBRIS_COLORS[Math.floor(Math.random() * DEBRIS_COLORS.length)], start: now
    });
  }
}
function addExplosionBurst(x, y) {
  const now = performance.now();
  explosions.push({ x, y, start: now });
  for (let i = 0; i < 14; i++) {
    const ang = rand(0, Math.PI * 2), speed = rand(60, 160);
    debrisParticles.push({
      x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      color: ['#c9502f', '#e3a83b', '#5c4526'][Math.floor(Math.random() * 3)], start: now
    });
  }
}

function drawFloatingExtras() {
  const now = performance.now();
  floatingTexts = floatingTexts.filter(f => now - f.start < 1100);
  floatingTexts.forEach(f => {
    const h = lastSnapshot && lastSnapshot.horses.find(x => x.themeIdx === f.themeIdx);
    if (!h) return;
    const t = (now - f.start) / 1100;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.fillStyle = f.color;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(f.text, h.x, h.y - 52 - t * 22);
    ctx.restore();
  });

  debrisParticles = debrisParticles.filter(p => now - p.start < 500);
  debrisParticles.forEach(p => {
    const dt = (now - p.start) / 1000;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - (now - p.start) / 500);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x + p.vx * dt, p.y + p.vy * dt, 3, 3);
    ctx.restore();
  });

  explosions = explosions.filter(e => now - e.start < EXPLOSION_MS);
  explosions.forEach(e => drawExplosion(ctx, e.x, e.y, (now - e.start) / EXPLOSION_MS));
}

// A wildcard spot's own "idle" marker only shows while nothing already sits
// there — the moment it drops loot, that loot's own icon reads as the marker.
function drawIdleWildcardMarkers() {
  if (!lastWildcardSpots.length || !lastSnapshot) return;
  lastWildcardSpots.forEach(spot => {
    const covered = (lastSnapshot.weapons || []).some(w => Math.hypot(w.x - spot.x, w.y - spot.y) < WILDCARD_OCCUPIED_RADIUS)
      || (lastSnapshot.pickups || []).some(p => Math.hypot(p.x - spot.x, p.y - spot.y) < WILDCARD_OCCUPIED_RADIUS);
    if (!covered) drawWildcardMarker(ctx, spot.x, spot.y);
  });
}

// ---------- render loop ----------
function loop() {
  ctx.save();
  if (shakeStrength > 0.05) {
    ctx.translate((Math.random() - 0.5) * shakeStrength, (Math.random() - 0.5) * shakeStrength);
    shakeStrength *= 0.85;
  } else {
    shakeStrength = 0;
  }
  if (lastSnapshot) renderState(ctx, lastSnapshot, MY_ID, camera);
  drawIdleWildcardMarkers();
  drawFloatingExtras();
  ctx.restore();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
