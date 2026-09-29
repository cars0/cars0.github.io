// Lightweight procedural SFX via the Web Audio API — no audio files to fetch or host.
// Everything is synthesized (oscillators + a short noise burst), which also happens
// to fit the pixel-art/chiptune vibe. Call unlockAudio() from a user gesture first;
// browsers refuse to start audio before one.

let ctx = null;
let muted = localStorage.getItem('hb-muted') === '1';

function ensureCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function unlockAudio() {
  try { ensureCtx(); } catch { /* audio unsupported — sfx() calls just no-op */ }
}

export function setMuted(v) {
  muted = !!v;
  localStorage.setItem('hb-muted', muted ? '1' : '0');
}
export function isMuted() { return muted; }

function tone(freq, duration, opts = {}) {
  if (muted) return;
  let ac;
  try { ac = ensureCtx(); } catch { return; }
  const { type = 'square', gain = 0.18, sweepTo = null, delay = 0 } = opts;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t0 + duration);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(g); g.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noiseBurst(duration, opts = {}) {
  if (muted) return;
  let ac;
  try { ac = ensureCtx(); } catch { return; }
  const { gain = 0.2, filterFreq = 2000 } = opts;
  const size = Math.max(1, Math.floor(ac.sampleRate * duration));
  const buffer = ac.createBuffer(1, size, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = filterFreq;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  src.connect(filter); filter.connect(g); g.connect(ac.destination);
  src.start();
}

export function sfx(name) {
  switch (name) {
    case 'swordHit': tone(180, 0.08, { type: 'square', gain: 0.18, sweepTo: 90 }); break;
    case 'gunshot':
      noiseBurst(0.12, { gain: 0.28, filterFreq: 3500 });
      tone(90, 0.1, { type: 'sine', gain: 0.2, sweepTo: 40 });
      break;
    case 'bowShot':
      tone(240, 0.1, { type: 'triangle', gain: 0.16, sweepTo: 600 }); // string twang
      noiseBurst(0.05, { gain: 0.1, filterFreq: 4000 });
      break;
    case 'blockBreak': noiseBurst(0.18, { gain: 0.22, filterFreq: 1100 }); break;
    case 'rocketLaunch': tone(110, 0.22, { type: 'sawtooth', gain: 0.16, sweepTo: 70 }); break;
    case 'explosion':
      noiseBurst(0.32, { gain: 0.3, filterFreq: 900 });
      tone(70, 0.28, { type: 'sine', gain: 0.24, sweepTo: 30 });
      break;
    case 'pickupWeapon': tone(520, 0.08, { type: 'triangle', gain: 0.15, sweepTo: 780 }); break;
    case 'pickupItem':
      tone(440, 0.07, { gain: 0.15, sweepTo: 660 });
      tone(660, 0.09, { gain: 0.13, sweepTo: 990, delay: 0.06 });
      break;
    case 'death': tone(220, 0.35, { type: 'sawtooth', gain: 0.16, sweepTo: 60 }); break;
    case 'revive': [520, 660, 880].forEach((f, i) => tone(f, 0.12, { type: 'sine', gain: 0.14, delay: i * 0.08 })); break;
    case 'multikill': [660, 880, 1100].forEach((f, i) => tone(f, 0.1, { type: 'square', gain: 0.14, delay: i * 0.07 })); break;
    case 'victory': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, { type: 'triangle', gain: 0.18, delay: i * 0.15 })); break;
    case 'zoneWarning': tone(150, 0.15, { type: 'sawtooth', gain: 0.08 }); break;
    case 'wildcardSpawn': [560, 840].forEach((f, i) => tone(f, 0.09, { type: 'triangle', gain: 0.14, delay: i * 0.05 })); break;
    case 'crownPickup': [660, 990, 1320].forEach((f, i) => tone(f, 0.1, { type: 'sine', gain: 0.15, delay: i * 0.06 })); break;
    case 'crownDrop': tone(300, 0.18, { type: 'sawtooth', gain: 0.14, sweepTo: 120 }); break;
    case 'click': tone(320, 0.05, { type: 'square', gain: 0.1 }); break;
    case 'reaction': tone(700, 0.06, { type: 'sine', gain: 0.12, sweepTo: 900 }); break;
    case 'countdownTick': tone(440, 0.09, { type: 'square', gain: 0.16 }); break;
    case 'countdownGo':
      tone(440, 0.05, { type: 'square', gain: 0.16 });
      tone(880, 0.22, { type: 'triangle', gain: 0.2, delay: 0.06 });
      break;
  }
}
