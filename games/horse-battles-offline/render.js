// Canvas drawing — takes a sim snapshot (see sim.js) and draws it, nothing more.
import { W, H, BOUND, THEMES, WEAPON_ORBIT_R, HORSE_R, MAX_HP, BREAKABLE_HP, GRID_SIZE, TERRAIN_TYPES } from './shared/constants.js';

// Purely cosmetic hat layer, deliberately separate from the theme.accessory switch
// below so a player-chosen hat always layers on top of any theme accessory.
function drawHat(g, hat) {
  if (!hat || hat === 'none') return;
  if (hat === 'topHat') {
    g.fillStyle = "#1a1512"; g.fillRect(15, -3, 7, 2);
    g.fillStyle = "#241a3a"; g.fillRect(16.5, -7, 4, 5);
    g.fillStyle = "#e3a83b"; g.fillRect(16.5, -3.5, 4, 1);
  } else if (hat === 'cowboy') {
    g.fillStyle = "#8a5a34"; g.fillRect(14, -2.5, 9, 1.5);
    g.fillStyle = "#6b4326"; g.fillRect(16, -5.5, 5, 3.5);
  } else if (hat === 'beanie') {
    g.fillStyle = "#d9603f"; g.fillRect(15.5, -4, 6, 3.5);
    g.fillStyle = "#f4ead2"; g.fillRect(15.5, -4.5, 6, 1);
  } else if (hat === 'flower') {
    g.fillStyle = "#7fb069"; g.fillRect(15, -2, 7, 1.5);
    ["#e35d7a", "#f4c95d", "#5bb0c9"].forEach((c, i) => { g.fillStyle = c; g.fillRect(15 + i * 2.3, -3, 1.4, 1.4); });
  } else if (hat === 'pirate') {
    g.fillStyle = "#1a1512"; g.fillRect(14.5, -3.5, 8, 3.5);
    g.fillStyle = "#f4ead2"; g.fillRect(17, -3, 2, 1.2);
  }
}

export function drawHorse(g, cx, cy, scale, theme, phase, facing, mine, alive, deathT, hat = 'none') {
  g.save();
  g.translate(cx, cy);
  g.scale(scale * facing, scale);
  g.translate(-12, -13);
  if (!alive) { g.globalAlpha = Math.max(0, 1 - deathT); g.rotate(facing * deathT * 1.4); }

  const legSwing = Math.sin(phase) * 1.4;
  const legSwing2 = Math.sin(phase + Math.PI) * 1.4;

  function px(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }

  px(7, 11 + legSwing, 2, 5, theme.shade);
  px(10, 11 + legSwing2, 2, 5, theme.shade);
  px(7, 15 + legSwing, 2, 1, "#1a1512");
  px(10, 15 + legSwing2, 2, 1, "#1a1512");
  px(15, 11 + legSwing2, 2, 5, theme.body);
  px(18, 11 + legSwing, 2, 5, theme.body);
  px(15, 15 + legSwing2, 2, 1, "#1a1512");
  px(18, 15 + legSwing, 2, 1, "#1a1512");

  const tailWag = Math.sin(phase * 0.8) * 0.6;
  px(1, 4 + tailWag, 3, 2, theme.mane);
  px(0.5, 6 + tailWag, 2, 3, theme.mane);

  px(5, 5, 11, 6, theme.body);
  px(5, 9, 11, 2, theme.shade);
  px(13, 2, 4, 6, theme.body);
  px(16, 3, 6, 6, theme.body);
  px(21, 6, 3, 2, theme.shade);
  px(17, 1, 2, 2, theme.body);
  px(20, 1, 2, 2, theme.body);
  px(13, 1, 2, 3, theme.mane);
  px(15.5, 0.5, 2, 2.5, theme.mane);
  px(18, 0.5, 2, 2, theme.mane);
  px(20.5, 5, 1, 1, "#1a1512");

  if (theme.accessory === "blaze") px(22, 4, 1, 4, "#f4ead2");
  if (theme.accessory === "spots") { px(7, 6, 2, 2, theme.accent); px(11, 8, 2, 2, theme.accent); }
  if (theme.accessory === "stripes") { px(6, 5, 1, 6, theme.mane); px(9, 5, 1, 6, theme.mane); px(12, 5, 1, 6, theme.mane); px(17, 3, 1, 6, theme.mane); }
  if (theme.accessory === "bandana") px(13, 3, 4, 2, theme.accent);
  if (theme.accessory === "hat") { px(16.5, -0.5, 6, 1.5, "#241a3a"); px(18, -2, 3, 2, "#241a3a"); }
  drawHat(g, hat);

  if (mine && alive) {
    g.strokeStyle = "#e3a83b";
    g.lineWidth = 0.8;
    g.beginPath(); g.ellipse(10.5, 13.5, 8.5, 4.2, 0, 0, Math.PI * 2); g.stroke();
  }
  g.restore();
}

export function drawHorseThumb(canvasEl, theme, hat = 'none') {
  const c = canvasEl.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, canvasEl.width, canvasEl.height);
  drawHorse(c, canvasEl.width / 2, canvasEl.height / 2 + 4, canvasEl.width / 26, theme, 0, 1, false, true, 0, hat);
}

export function drawWeaponIcon(g, x, y, type, s, rotation = 0) {
  g.save(); g.translate(x, y); if (rotation) g.rotate(rotation); g.scale(s, s);
  // Local +x is each weapon's "forward"/aim direction — the revolver's muzzle and the
  // bow's arrow both point that way, so orbiting rotation can aim them directly.
  const shapes = {
    sword: [[-1, -6, 2, 8], [-3, 2, 6, 2], [-1, 4, 2, 3]],
    revolver: [[-5, -1, 8, 3], [3, -1, 2, 5], [-6, 0, 2, 3]],
    bow: [[-3, -7, 2, 3], [-4, -3, 2, 6], [-3, 4, 2, 3], [-1, -7, 1, 14], [0, -1, 7, 2], [6, -2.5, 3, 5]],
    burst: [[-5, -2, 7, 2], [-5, 1, 7, 2], [3, -2, 2, 5], [-6, -2, 2, 5]],
    rocket: [[-6, -2.5, 9, 5], [3, -3, 4, 6], [-7, -1.5, 2, 3], [-2, -4, 3, 1.5], [-2, 2.5, 3, 1.5]]
  };
  const rects = shapes[type] || shapes.revolver;
  // black halo behind the whole silhouette first, so it reads as one clean outline
  // instead of outlining each little rect (which would seam at the joins)
  g.fillStyle = "#0a0a0a";
  rects.forEach(([rx, ry, rw, rh]) => g.fillRect(rx - 0.8, ry - 0.8, rw + 1.6, rh + 1.6));
  if (type === "sword") {
    g.fillStyle = "#eef1f5"; g.fillRect(-1, -6, 2, 8);   // bright blade
    g.fillStyle = "#8a5a34"; g.fillRect(-3, 2, 6, 2);    // guard
    g.fillStyle = "#5c4a2f"; g.fillRect(-1, 4, 2, 3);    // handle
  } else if (type === "bow") {
    g.fillStyle = "#8a5a34"; // wood limbs
    g.fillRect(-3, -7, 2, 3); g.fillRect(-4, -3, 2, 6); g.fillRect(-3, 4, 2, 3);
    g.fillStyle = "#eef1f5"; g.fillRect(-1, -7, 1, 14);  // taut string
    g.fillStyle = "#5c4a2f"; g.fillRect(0, -1, 7, 2);    // arrow shaft
    g.fillStyle = "#d9dee6"; g.fillRect(6, -2.5, 3, 5);  // arrowhead
  } else if (type === "burst") {
    g.fillStyle = "#8a8f9c"; g.fillRect(-6, -2, 2, 5);   // grip
    g.fillStyle = "#d9dee6"; g.fillRect(-5, -2, 7, 2); g.fillRect(-5, 1, 7, 2); // twin barrels
    g.fillStyle = "#c8ccd6"; g.fillRect(3, -2, 2, 5);    // muzzle
  } else if (type === "rocket") {
    g.fillStyle = "#4a5240"; g.fillRect(-6, -2.5, 9, 5); // launcher tube
    g.fillStyle = "#c9502f"; g.fillRect(3, -3, 4, 6);    // warhead tip
    g.fillStyle = "#2a1c10"; g.fillRect(-7, -1.5, 2, 3); // grip
    g.fillStyle = "#8a6a3f"; g.fillRect(-2, -4, 3, 1.5); g.fillRect(-2, 2.5, 3, 1.5); // fins
  } else {
    g.fillStyle = "#d9dee6"; g.fillRect(-5, -1, 8, 3);   // bright silver body
    g.fillStyle = "#c8ccd6"; g.fillRect(3, -1, 2, 5);    // barrel
    g.fillStyle = "#3a2a1c"; g.fillRect(-6, 0, 2, 3);    // grip, dark for contrast
  }
  g.restore();
}

// Weapon a horse is carrying orbits around it, rather than sitting fixed above its head.
// The revolver's barrel and the bow's arrow (local +x) are drawn pointing exactly along
// `angle`, which doubles as their firing direction, so the art visibly aims where the
// next shot will actually go. The sword has no aim to track, so it keeps a tangential spin.
export function drawOrbitingWeapon(g, cx, cy, type, angle) {
  const ox = cx + Math.cos(angle) * WEAPON_ORBIT_R;
  const oy = cy + Math.sin(angle) * WEAPON_ORBIT_R;
  const rotation = (type === 'sword') ? angle + Math.PI / 2 : angle;
  drawWeaponIcon(g, ox, oy, type, 2.0, rotation); // a bit bigger once a horse is actually carrying it
}

// Slow-moving rocket projectile — drawn oriented along its direction of travel.
export function drawRocket(ctx, r) {
  drawWeaponIcon(ctx, r.x, r.y, 'rocket', 1.6, r.angle || 0);
}

// A brief expanding ring + flash where a rocket detonated (paired with a debris
// burst and screen shake triggered client-side off the 'explosion' event).
export function drawExplosion(ctx, x, y, t) {
  const r = 8 + t * 55;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - t);
  ctx.fillStyle = "rgba(255,196,87,0.35)";
  ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,140,60,0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// Editor-only: numbered marker showing where horse slot `number` (1-8) will spawn.
export function drawHorseSpawnMarker(ctx, x, y, number, theme) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fillStyle = theme ? theme.body : '#e3a83b';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#241a3a';
  ctx.stroke();
  ctx.fillStyle = '#f4ead2';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), x, y + 1);
  ctx.restore();
}

// Editor-only: a pulsing "?" diamond marking a Wildcard spawn point — visually
// distinct from the numbered horse-spawn circle so the two never get confused.
export function drawWildcardMarker(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = "#5bb0c9";
  ctx.fillRect(-7, -7, 14, 14);
  ctx.strokeStyle = "#241a3a";
  ctx.lineWidth = 2;
  ctx.strokeRect(-7, -7, 14, 14);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = "#f4ead2";
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 0, 1);
  ctx.restore();
}

// Editor-only: single marker for the Royal Horse crown's ground spawn point.
export function drawCrownSpawnMarker(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#e3a83b";
  ctx.beginPath();
  ctx.moveTo(-8, 5); ctx.lineTo(-8, -2); ctx.lineTo(-4, 2); ctx.lineTo(0, -5); ctx.lineTo(4, 2); ctx.lineTo(8, -2); ctx.lineTo(8, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#241a3a";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}

// Live in-battle crown icon, drawn on the ground while nobody currently holds it.
export function drawCrownIcon(ctx, x, y, simTime) {
  const wobble = Math.sin(simTime * 3 + x) * 2;
  drawCrownSpawnMarker(ctx, x, y + wobble);
}

// Gold pulsing bubble around the horse currently holding the Royal Horse crown.
function drawCrownGlow(ctx, h) {
  const pulse = 1 + Math.sin(h.phase * 1.3) * 0.08;
  ctx.save();
  ctx.beginPath();
  ctx.arc(h.x, h.y, (HORSE_R + 8) * pulse, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(227,168,59,0.2)";
  ctx.fill();
  ctx.strokeStyle = "rgba(244,201,93,0.9)";
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();
}

// Mario-Kart-style mystery item box — contents are randomized at pickup, not shown here.
export function drawLootbox(ctx, x, y, simTime) {
  const wobble = Math.sin(simTime * 3 + x) * 2;
  ctx.save();
  ctx.translate(x, y + wobble);
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(-9, -9, 18, 18);
  ctx.fillStyle = "#e3a83b";
  ctx.fillRect(-7.5, -7.5, 15, 15);
  ctx.fillStyle = "#f4ead2";
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 0, 1);
  ctx.restore();
}

// Bubble shield: a translucent blue bubble surrounding a protected horse.
function drawShieldBubble(ctx, h) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(h.x, h.y, HORSE_R + 7, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(91,176,230,0.22)";
  ctx.fill();
  ctx.strokeStyle = "rgba(150,215,255,0.9)";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
}

// Speed boost: a couple of short motion-streaks trailing behind the horse.
function drawBoostTrail(ctx, h) {
  const speed = Math.hypot(h.vx, h.vy) || 1;
  const bx = -h.vx / speed, by = -h.vy / speed; // unit vector pointing backward
  ctx.save();
  ctx.strokeStyle = "rgba(255,221,87,0.85)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const d1 = HORSE_R + 4 + i * 6, d2 = d1 + 7;
    ctx.beginPath();
    ctx.moveTo(h.x + bx * d1, h.y + by * d1);
    ctx.lineTo(h.x + bx * d2, h.y + by * d2);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawStatusEffects(ctx, h) {
  if (!h.alive) return;
  if (h.boosted) drawBoostTrail(ctx, h);
  if (h.shielded) drawShieldBubble(ctx, h);
  if (h.hasCrown) drawCrownGlow(ctx, h);
}

export function drawGround(ctx) {
  ctx.fillStyle = "#3f5233";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += GRID_SIZE) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += GRID_SIZE) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // continuous fence rail around the whole perimeter, with posts at intervals
  const railT = 6;
  ctx.fillStyle = "#7a5230";
  ctx.fillRect(BOUND.x - 8, BOUND.y - railT, BOUND.w + 16, railT);
  ctx.fillRect(BOUND.x - 8, BOUND.y + BOUND.h, BOUND.w + 16, railT);
  ctx.fillRect(BOUND.x - railT, BOUND.y - 8, railT, BOUND.h + 16);
  ctx.fillRect(BOUND.x + BOUND.w, BOUND.y - 8, railT, BOUND.h + 16);

  ctx.fillStyle = "#5c3d1f";
  const postGap = 34, postW = 5, postH = 14;
  for (let x = BOUND.x; x <= BOUND.x + BOUND.w; x += postGap) {
    ctx.fillRect(x - postW / 2, BOUND.y - postH + railT, postW, postH);
    ctx.fillRect(x - postW / 2, BOUND.y + BOUND.h - railT, postW, postH);
  }
  for (let y = BOUND.y; y <= BOUND.y + BOUND.h; y += postGap) {
    ctx.fillRect(BOUND.x - postH + railT, y - postW / 2, postH, postW);
    ctx.fillRect(BOUND.x + BOUND.w - railT, y - postW / 2, postH, postW);
  }
}

export function drawCrate(ctx, o) {
  if (o.type === 'solid') {
    ctx.fillStyle = "#6d7280";
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.strokeStyle = "#41454e"; ctx.lineWidth = 2;
    ctx.strokeRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = "#41454e";
    ctx.fillRect(o.x + 3, o.y + 3, 3, 3);
    ctx.fillRect(o.x + o.w - 6, o.y + 3, 3, 3);
    ctx.fillRect(o.x + 3, o.y + o.h - 6, 3, 3);
    ctx.fillRect(o.x + o.w - 6, o.y + o.h - 6, 3, 3);
  } else {
    ctx.fillStyle = "#8a6a3f";
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.strokeStyle = "#5c4526"; ctx.lineWidth = 2;
    ctx.strokeRect(o.x, o.y, o.w, o.h);

    // cracks appear and spread as the block takes hits, so its remaining
    // health reads at a glance instead of it looking untouched until it pops
    const hp = typeof o.hp === 'number' ? o.hp : BREAKABLE_HP;
    const dmgFrac = 1 - Math.max(0, hp) / BREAKABLE_HP;
    if (dmgFrac > 0) {
      ctx.strokeStyle = "#2a1c10";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(o.x + o.w * 0.2, o.y + o.h * 0.12);
      ctx.lineTo(o.x + o.w * 0.55, o.y + o.h * 0.5);
      ctx.lineTo(o.x + o.w * 0.3, o.y + o.h * 0.88);
      ctx.stroke();
    }
    if (dmgFrac >= 0.5) {
      ctx.beginPath();
      ctx.moveTo(o.x + o.w * 0.82, o.y + o.h * 0.2);
      ctx.lineTo(o.x + o.w * 0.5, o.y + o.h * 0.5);
      ctx.lineTo(o.x + o.w * 0.78, o.y + o.h * 0.82);
      ctx.stroke();
    }
  }
}

// Ground-level hazard tiles — non-colliding, so drawn as flat decals (no black outline
// like the crates get) rather than solid objects.
export function drawTerrain(ctx, t) {
  ctx.save();
  if (t.type === TERRAIN_TYPES.MUD) {
    ctx.fillStyle = "rgba(90,64,33,0.55)";
    ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.fillStyle = "rgba(50,34,16,0.5)";
    ctx.beginPath(); ctx.arc(t.x + t.w * 0.3, t.y + t.h * 0.4, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(t.x + t.w * 0.65, t.y + t.h * 0.65, 2.4, 0, Math.PI * 2); ctx.fill();
  } else if (t.type === TERRAIN_TYPES.ICE) {
    ctx.fillStyle = "rgba(180,225,245,0.5)";
    ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(t.x + t.w * 0.2, t.y + t.h * 0.8); ctx.lineTo(t.x + t.w * 0.5, t.y + t.h * 0.3);
    ctx.moveTo(t.x + t.w * 0.5, t.y + t.h * 0.3); ctx.lineTo(t.x + t.w * 0.8, t.y + t.h * 0.5);
    ctx.stroke();
  } else if (t.type === TERRAIN_TYPES.LAUNCH) {
    ctx.fillStyle = "rgba(227,168,59,0.35)";
    ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.fillStyle = "rgba(244,234,210,0.9)";
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    for (const dy of [-6, 2]) {
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy + dy + 5);
      ctx.lineTo(cx, cy + dy - 1);
      ctx.lineTo(cx + 6, cy + dy + 5);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

// Shrinking-arena safe zone — a stroked circle plus a dim tint outside it.
export function drawZone(ctx, zone) {
  if (!zone) return;
  ctx.save();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.arc(zone.cx, zone.cy, zone.r, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fillStyle = "rgba(120,20,20,0.28)";
  ctx.fill("evenodd");
  ctx.restore();
  ctx.strokeStyle = "rgba(255,120,90,0.85)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(zone.cx, zone.cy, zone.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Floating name + health bar pinned above a horse, replacing a top-of-screen HUD list.
export function drawNameplate(ctx, h, theme, mine) {
  if (!h.alive) return;
  const label = h.owner ? h.owner.name : theme.name.split(' ')[0];
  const barW = 40, barH = 4;
  const cx = h.x;
  const pillH = 24;
  const pillY = h.y - HORSE_R - 17 - pillH;

  ctx.save();
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  const textW = ctx.measureText(label).width;
  const pillW = Math.max(barW, textW + 10);
  const pillX = cx - pillW / 2;

  ctx.fillStyle = 'rgba(20,14,30,0.72)';
  ctx.strokeStyle = mine ? '#e3a83b' : 'transparent';
  ctx.lineWidth = 1.2;
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(pillX, pillY, pillW, pillH, 4); ctx.fill(); if (mine) ctx.stroke(); }
  else { ctx.fillRect(pillX, pillY, pillW, pillH); if (mine) ctx.strokeRect(pillX, pillY, pillW, pillH); }

  ctx.fillStyle = '#f4ead2';
  ctx.textBaseline = 'top';
  ctx.fillText(label, cx, pillY + 2);

  const pct = Math.max(0, h.hp) / (h.maxHp || MAX_HP);
  const barX = cx - barW / 2, barY = pillY + pillH - 6;
  ctx.fillStyle = '#382a4d';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = pct > 0.4 ? '#7fb069' : '#d94f3a';
  ctx.fillRect(barX, barY, barW * pct, barH);

  // Royal Horse: a small crown-time readout above the nameplate — only once this
  // horse has actually held the crown at least once, not a "0.0s" for everyone
  // who's never touched it (the full ranking lives in the side leaderboard instead).
  if (typeof h.crownTime === 'number' && h.crownTime > 0) {
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = h.hasCrown ? '#e3a83b' : '#c9bcd8';
    ctx.fillText(`👑 ${h.crownTime.toFixed(1)}s`, cx, pillY - 12);
  }
  ctx.restore();
}

// camera: optional { x, y, zoom } to zoom in on a point (used for the win-highlight
// effect) — omitted or zoom:1 renders exactly as before, untouched.
export function renderState(ctx, state, myId, camera) {
  const zoomed = camera && camera.zoom && camera.zoom !== 1;
  if (zoomed) {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);
  }

  drawGround(ctx);
  (state.terrain || []).forEach(t => drawTerrain(ctx, t));
  (state.obstacles || []).forEach(o => drawCrate(ctx, o));
  (state.weapons || []).forEach(w => drawWeaponIcon(ctx, w.x, w.y, w.type, 2.2));
  (state.pickups || []).forEach(p => drawLootbox(ctx, p.x, p.y, state.simTime || 0));
  (state.bullets || []).forEach(b => {
    ctx.fillStyle = "#f4ead2";
    ctx.beginPath(); ctx.arc(b.x, b.y, 2.4, 0, Math.PI * 2); ctx.fill();
  });
  (state.rockets || []).forEach(r => drawRocket(ctx, r));
  if (state.crown && state.crown.holderThemeIdx === null && state.crown.pos) {
    drawCrownIcon(ctx, state.crown.pos.x, state.crown.pos.y, state.simTime || 0);
  }
  (state.horses || []).forEach(h => {
    const theme = THEMES[h.themeIdx];
    const mine = !!(h.owner && myId && h.owner.id === myId);
    const hat = h.owner && h.owner.hat ? h.owner.hat : 'none';
    drawHorse(ctx, h.x, h.y, 2.05, theme, h.phase, h.facing, mine, h.alive, h.deathT, hat);
    if (h.alive) (h.weapons || []).forEach(w => drawOrbitingWeapon(ctx, h.x, h.y, w.type, w.angle || 0));
    drawStatusEffects(ctx, h);
    drawNameplate(ctx, h, theme, mine);
  });
  drawZone(ctx, state.zone);

  if (zoomed) ctx.restore();
}
