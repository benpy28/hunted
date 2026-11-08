// Audio: a tiny synth, no sound files.
import { clamp } from './core.js';

let actx = null, master = null;
export function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); master = actx.createGain(); master.gain.value = 0.5; master.connect(actx.destination); } catch { actx = null; }
}
function tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
  if (!actx) return;
  const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
let noiseBuf = null;
function noise(dur, vol = 0.3, freq = 1200, q = 0.8, delay = 0) {
  if (!actx) return;
  if (!noiseBuf) { noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = actx.currentTime + delay, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
}
export const sfx = {
  shot: () => { noise(0.16, 0.55, 900, 0.6); tone(140, 0.12, 'square', 0.12, 0.4); },
  enemyShot: (d) => { const v = clamp(0.35 - d / 120, 0.03, 0.35); noise(0.14, v, 1400, 0.7); },
  hurt: () => { tone(220, 0.18, 'sawtooth', 0.12, 0.5); noise(0.1, 0.25, 500); },
  hit: () => { tone(900, 0.05, 'square', 0.06); },
  shove: () => noise(0.18, 0.25, 600, 0.5),
  pickup: () => { tone(660, 0.08, 'sine', 0.15); tone(990, 0.12, 'sine', 0.15, 1, 0.07); },
  reload: () => { tone(300, 0.04, 'square', 0.08); tone(500, 0.04, 'square', 0.08, 1, 0.5); },
  empty: () => tone(1200, 0.03, 'square', 0.05),
  day: () => { tone(523, 0.3, 'triangle', 0.18); tone(659, 0.3, 'triangle', 0.18, 1, 0.15); tone(784, 0.5, 'triangle', 0.18, 1, 0.3); },
  alarm: () => { for (let i = 0; i < 3; i++) { tone(880, 0.12, 'square', 0.09, 1, i * 0.25); tone(660, 0.12, 'square', 0.09, 1, i * 0.25 + 0.12); } },
  heart: (v) => { tone(55, 0.12, 'sine', v); tone(50, 0.12, 'sine', v * 0.8, 1, 0.16); },
  crash: () => { noise(0.4, 0.5, 300, 0.4); tone(80, 0.3, 'sawtooth', 0.15, 0.5); },
  horn: () => { tone(380, 0.35, 'square', 0.06); tone(470, 0.35, 'square', 0.05); },
  thud: () => { noise(0.12, 0.3, 200, 0.6); },
};
sfx.drone = () => { tone(1400, 0.06, 'square', 0.04); tone(1800, 0.06, 'square', 0.04, 1, 0.08); };
sfx.cash = () => { tone(1046, 0.08, 'square', 0.08); tone(1318, 0.15, 'square', 0.08, 1, 0.08); };
sfx.bonk = () => { tone(190, 0.09, 'square', 0.13, 0.6); noise(0.07, 0.35, 1800, 1.2); tone(620, 0.05, 'triangle', 0.08, 1.4); };
sfx.whoosh = () => noise(0.25, 0.22, 700, 0.5);
sfx.homerun = () => { noise(0.12, 0.6, 2400, 1.4); tone(160, 0.12, 'square', 0.15, 0.5); tone(300, 0.7, 'triangle', 0.12, 4, 0.08); tone(1250, 0.35, 'sine', 0.06, 0.5, 0.75); };
sfx.swap = () => { tone(420, 0.04, 'square', 0.05); tone(260, 0.05, 'square', 0.05, 1, 0.05); };
sfx.pump = () => { noise(0.08, 0.25, 900, 1); noise(0.08, 0.25, 600, 1, 0.12); };
sfx.shotgun = () => { noise(0.3, 0.75, 500, 0.5); tone(90, 0.2, 'square', 0.16, 0.4); };
sfx.smg = () => { noise(0.08, 0.38, 1300, 0.7); tone(180, 0.05, 'square', 0.07, 0.5); };
sfx.clap = () => { for (let i = 0; i < 6; i++) noise(0.03, 0.12, 2500 + Math.random() * 1500, 1.5, i * 0.09 + Math.random() * 0.05); };
sfx.sting = () => { tone(110, 0.5, 'sawtooth', 0.14, 0.7); tone(104, 0.6, 'sawtooth', 0.12, 0.6, 0.12); tone(55, 0.9, 'square', 0.1, 1, 0.3); };
sfx.vzap = () => { noise(0.12, 0.3, 3200, 2); tone(1600, 0.1, 'square', 0.06, 0.3); };
sfx.ice = () => { tone(1900, 0.12, 'sine', 0.08, 1.5); noise(0.1, 0.18, 5000, 3); };
sfx.cheer = () => { for (let i = 0; i < 4; i++) noise(0.5, 0.08, 900 + i * 300, 0.6, i * 0.05); tone(520, 0.2, 'triangle', 0.05, 1.2, 0.1); };
sfx.sigh = () => { noise(0.9, 0.05, 500, 0.5); };
sfx.bell = () => { tone(2350, 0.35, 'sine', 0.07); tone(2350, 0.3, 'sine', 0.06, 1, 0.13); tone(4700, 0.12, 'sine', 0.02, 1, 0.13); };
sfx.bin = () => { noise(0.3, 0.45, 2200, 1.6); tone(330, 0.25, 'triangle', 0.1, 0.7); noise(0.18, 0.25, 800, 0.8, 0.12); };
sfx.thunk = () => { tone(180, 0.1, 'triangle', 0.08, 0.7); noise(0.06, 0.15, 1500, 1.2); };
sfx.clank = () => { tone(1250, 0.18, 'square', 0.05, 0.9); tone(1880, 0.12, 'sine', 0.05); };
sfx.gush = () => { noise(1.4, 0.35, 1800, 0.4); noise(0.9, 0.25, 600, 0.6, 0.1); };
sfx.lid = () => { tone(150, 0.22, 'sawtooth', 0.05, 0.8); noise(0.12, 0.3, 700, 0.9, 0.18); tone(95, 0.12, 'square', 0.08, 0.6, 0.2); };
sfx.smash = () => { noise(0.35, 0.45, 4200, 2.2); tone(2600, 0.08, 'sine', 0.05, 1.3); tone(3300, 0.12, 'sine', 0.04, 1.2, 0.05); noise(0.2, 0.2, 2600, 1.4, 0.08); };
sfx.flap = () => { for (let i = 0; i < 7; i++) noise(0.05, 0.16, 900 + Math.random() * 500, 0.8, i * 0.06 + Math.random() * 0.03); };
sfx.camBeep = () => { tone(1760, 0.08, 'square', 0.05); tone(1760, 0.08, 'square', 0.05, 1, 0.14); tone(2200, 0.12, 'square', 0.05, 1, 0.28); };
sfx.paper = () => { noise(0.12, 0.18, 3200, 1.4); noise(0.08, 0.12, 2200, 1.2, 0.1); };
sfx.meow = () => { tone(720, 0.12, 'triangle', 0.07, 1.25); tone(900, 0.28, 'triangle', 0.06, 0.62, 0.1); };
sfx.compactor = () => { tone(60, 1.2, 'sawtooth', 0.12, 1.4); noise(1.2, 0.3, 300, 0.5); tone(45, 0.8, 'square', 0.08, 1, 0.5); };
sfx.explode = () => { noise(0.9, 0.6, 180, 0.4); tone(60, 0.7, 'sawtooth', 0.2, 0.4); };

// continuous rotor / propeller hum, volume driven by distance to the nearest aircraft
let rotorGain = null, droneGain = null;
export function setAircraftVolume(heli, drone) {
  if (!actx) return;
  if (!rotorGain) {
    if (!noiseBuf) noise(0.01, 0.0001);
    const src = actx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const am = actx.createGain(); am.gain.value = 0.5;
    const lfo = actx.createOscillator(); lfo.frequency.value = 11; const lfoG = actx.createGain(); lfoG.gain.value = 0.5;
    lfo.connect(lfoG); lfoG.connect(am.gain);
    rotorGain = actx.createGain(); rotorGain.gain.value = 0;
    src.connect(lp); lp.connect(am); am.connect(rotorGain); rotorGain.connect(master);
    src.start(); lfo.start();
    const o = actx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 190;
    const lp2 = actx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 900;
    droneGain = actx.createGain(); droneGain.gain.value = 0;
    o.connect(lp2); lp2.connect(droneGain); droneGain.connect(master); o.start();
  }
  rotorGain.gain.setTargetAtTime(clamp(heli, 0, 0.9), actx.currentTime, 0.2);
  droneGain.gain.setTargetAtTime(clamp(drone, 0, 0.05), actx.currentTime, 0.2);
}
sfx.vault = () => { noise(0.12, 0.18, 700, 0.6); tone(180, 0.08, 'sine', 0.06, 0.7); };
sfx.climb = () => { noise(0.08, 0.15, 1100, 0.9); tone(240, 0.05, 'triangle', 0.05); };
sfx.slide = () => noise(0.55, 0.16, 2400, 0.4);
sfx.roll = () => { noise(0.3, 0.25, 400, 0.5); tone(90, 0.2, 'sine', 0.12, 0.6); };
sfx.land = (k) => { noise(0.12, 0.12 + clamp(k, 0, 1) * 0.3, 260, 0.6); };
sfx.step = () => noise(0.05, 0.05, 1600, 1.2);
sfx.swoosh = () => { noise(0.25, 0.3, 900, 0.5); tone(300, 0.2, 'sine', 0.08, 0.5); };
sfx.bonk = () => { tone(520, 0.08, 'square', 0.12, 0.4); tone(160, 0.25, 'sine', 0.2, 0.5); noise(0.1, 0.35, 900, 0.8); };
// zipline whir: pitch and volume follow speed
let zipOsc = null, zipGain = null;
export function setZipSound(v) {
  if (!actx) return;
  if (!zipOsc) {
    if (!noiseBuf) noise(0.01, 0.0001);
    const src = actx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    zipOsc = actx.createBiquadFilter(); zipOsc.type = 'bandpass'; zipOsc.Q.value = 6; zipOsc.frequency.value = 600;
    zipGain = actx.createGain(); zipGain.gain.value = 0;
    src.connect(zipOsc); zipOsc.connect(zipGain); zipGain.connect(master); src.start();
  }
  zipOsc.frequency.setTargetAtTime(400 + v * 90, actx.currentTime, 0.05);
  zipGain.gain.setTargetAtTime(v > 0 ? clamp(0.1 + v / 60, 0, 0.5) : 0, actx.currentTime, 0.08);
}
// superpower mode: screaming bystanders and eye lasers
sfx.scream = () => { const f = 520 + Math.random() * 420; tone(f, 0.55, 'triangle', 0.06, 1.45); tone(f * 1.02, 0.55, 'sawtooth', 0.02, 1.45); };
sfx.zap = () => { tone(1500 + Math.random() * 300, 0.07, 'sawtooth', 0.035, 0.5); };
// weather: a rain hiss that follows the downpour, rolling thunder and festival fireworks
let rainGain = null;
export function setRain(v) {
  if (!actx) return;
  if (!rainGain) {
    if (!noiseBuf) noise(0.01, 0.0001);
    const src = actx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
    rainGain = actx.createGain(); rainGain.gain.value = 0;
    src.connect(hp); hp.connect(lp); lp.connect(rainGain); rainGain.connect(master); src.start();
  }
  rainGain.gain.setTargetAtTime(clamp(v, 0, 0.4), actx.currentTime, 0.4);
}
sfx.thunder = (near) => { const d = near ? 0 : 0.6 + Math.random() * 1.2; if (near) noise(0.25, 0.6, 1800, 0.4); noise(2.6, near ? 0.75 : 0.45, 90, 0.5, d); tone(42, 2.2, 'sine', near ? 0.25 : 0.14, 0.7, d); };
sfx.firework = () => { const d = 0.5 + Math.random() * 0.4; tone(900, 0.5, 'sine', 0.03, 2.5); noise(0.5, 0.45, 260, 0.5, d); noise(0.9, 0.12, 3200, 1, d + 0.05); };
sfx.powerDown = () => { tone(220, 1.2, 'sawtooth', 0.08, 0.2); noise(0.3, 0.2, 400, 0.6); };
