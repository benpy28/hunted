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
