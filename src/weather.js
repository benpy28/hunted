// Weather and town events: rain, thunderstorms, fog, power cuts and festivals.
// The sky changes every in-game day or so. Bad weather makes you harder to spot,
// a blacked-out town is dark enough to slip through, and a festival packs the
// streets with people you can disappear into.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, mr, mpick, scene, camera, puffTex, GeoBuf } from './core.js';
import { CITIES, PITCH, emissiveFacades, baked } from './world.js';
import { sfx, setRain } from './audio.js';

export const WX = {
  kind: 'clear', t: 75, // seconds until the sky changes
  rain: 0, fog: 0, cloud: 0, wet: 0, flash: 0, boltT: 6,
  sight: 1, crowd: 1, here: null, night: false,
  blackout: null,  // { city, t }
  festival: null,  // { city, day }
  rolledNight: -1, rolledDay: 0,
};
const WX_KINDS = {
  clear: { rain: 0, fog: 0, cloud: 0 },
  overcast: { rain: 0, fog: 0.12, cloud: 0.7 },
  rain: { rain: 0.65, fog: 0.25, cloud: 0.85 },
  storm: { rain: 1, fog: 0.35, cloud: 1 },
  fog: { rain: 0, fog: 1, cloud: 0.45 },
};
const WX_ODDS = ['clear', 'clear', 'clear', 'overcast', 'overcast', 'rain', 'rain', 'storm', 'fog', 'fog'];
export const WX_NAMES = { clear: 'CLEAR', overcast: 'OVERCAST', rain: 'RAIN', storm: 'THUNDERSTORM', fog: 'FOG' };
const WX_LINES = {
  clear: 'THE SKY CLEARS. EVERYONE CAN SEE YOU AGAIN.',
  overcast: 'CLOUDING OVER.',
  rain: 'RAIN ROLLING IN. HEADS DOWN, HOODS UP: HARDER TO SPOT YOU.',
  storm: 'THUNDERSTORM. NOBODY IS LOOKING AT ANYTHING BUT THE SKY.',
  fog: 'THICK FOG. YOU COULD BE ANYONE OUT THERE.',
};
export const FESTIVALS = { 'PORT HALDEN': 'HARBOUR LIGHTS FESTIVAL', ASHFORD: 'GIANT VEGETABLE FAIR', 'SALTMARSH DOCKS': 'SALTMARSH FISH FRY' };

// ---------------------------------------------------------------------
// rain: streaks drawn on the GPU in a box that follows the camera
// ---------------------------------------------------------------------
const RAIN_N = 5000;
const rainGeo = new THREE.BufferGeometry();
{
  const pos = new Float32Array(RAIN_N * 6), end = new Float32Array(RAIN_N * 2), rnd = new Float32Array(RAIN_N * 2);
  for (let i = 0; i < RAIN_N; i++) {
    const x = Math.random() * 50, y = Math.random() * 26, z = Math.random() * 50, r = Math.random();
    for (let k = 0; k < 2; k++) { pos.set([x, y, z], (i * 2 + k) * 3); end[i * 2 + k] = k; rnd[i * 2 + k] = r; }
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rainGeo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  rainGeo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
}
const rainMat = new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAmt: { value: 0 }, uCol: { value: new THREE.Color(0xb8c4d8) } },
  vertexShader: `
    attribute float aEnd; attribute float aRnd;
    uniform float uT; uniform vec3 uCam; uniform float uAmt; varying float vA;
    void main() {
      vec3 p = position;
      float spd = 20.0 + aRnd * 8.0;
      p.y = mod(p.y - uT * spd, 26.0) + uCam.y - 11.0;
      p.x = mod(p.x - uCam.x + uT * 1.8, 50.0) - 25.0 + uCam.x;
      p.z = mod(p.z - uCam.z, 50.0) - 25.0 + uCam.z;
      p.y += aEnd * 0.7; p.x -= aEnd * 0.06;
      float d = length(p.xz - uCam.xz);
      vA = (1.0 - smoothstep(9.0, 25.0, d)) * step(aRnd, uAmt) * (0.25 + 0.75 * aEnd);
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: `uniform vec3 uCol; varying float vA; void main() { if (vA < 0.01) discard; gl_FragColor = vec4(uCol, vA * 0.5); }`,
  transparent: true, depthWrite: false,
});
const rainLines = new THREE.LineSegments(rainGeo, rainMat);
rainLines.frustumCulled = false; rainLines.renderOrder = 5; rainLines.visible = false;
scene.add(rainLines);

// lightning bolt: a jagged line far off in the sky
const boltMat = new THREE.LineBasicMaterial({ color: 0xe8f0ff, transparent: true, fog: false });
const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18 * 3), 3));
const bolt = new THREE.Line(boltGeo, boltMat); bolt.frustumCulled = false; bolt.visible = false; scene.add(bolt);
function strikeBolt() {
  const a = mr(0, Math.PI * 2), r = mr(120, 260), p = boltGeo.attributes.position;
  let x = camera.position.x + Math.cos(a) * r, z = camera.position.z + Math.sin(a) * r, y = 150;
  for (let i = 0; i < 18; i++) { p.setXYZ(i, x, y, z); y -= 150 / 17; x += mr(-7, 7); z += mr(-7, 7); }
  p.needsUpdate = true; bolt.visible = true;
}

// ---------------------------------------------------------------------
// festival dressing: bunting and lanterns strung over the town's main streets
// ---------------------------------------------------------------------
const FLAG_COLS = [0xe8402a, 0xf5c518, 0x2a9d8f, 0x3a6ad8, 0xe86ab0, 0xffffff, 0x7ad04a];
const festDecor = {};
function buildFestival(city) {
  const flags = new GeoBuf(), lights = new GeoBuf();
  const string = (ax, az, bx, bz) => { // a drooping line from a to b with pennants and bulbs
    const N = 10, pts = [];
    for (let k = 0; k <= N; k++) { const u = k / N; pts.push([lerp(ax, bx, u), 7.4 - Math.sin(u * Math.PI) * 1.1, lerp(az, bz, u)]); }
    for (let k = 0; k < N; k++) {
      flags.beam(pts[k], pts[k + 1], 0.04, 0x333333);
      const [x0, y0, z0] = pts[k], [x1, y1, z1] = pts[k + 1], mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, my = (y0 + y1) / 2;
      const col = new THREE.Color(FLAG_COLS[(k + Math.round(ax + az)) % FLAG_COLS.length]);
      flags.quad([x0, y0, z0], [x1, y1, z1], [mx, my - 0.75, mz], [mx, my - 0.75, mz], [0, 0, 1], [0, 0, 1, 0, 0.5, 1, 0.5, 1], col);
      if (k % 2 === 0) lights.box(x0 - 0.1, x0 + 0.1, y0 - 0.25, y0 - 0.05, z0 - 0.1, z0 + 0.1, k % 4 ? 0xffd27a : 0xff7a5a);
    }
  };
  const reach = 2 * PITCH;
  for (let s = -reach; s <= reach; s += 7) {
    if (Math.abs(s) < 11) continue;
    string(city.cx + s, city.cz - 9.5, city.cx + s, city.cz + 9.5); // across the east-west street
    string(city.cx - 9.5, city.cz + s, city.cx + 9.5, city.cz + s); // across the north-south street
  }
  // a big criss-cross over the main junction
  string(city.cx - 10, city.cz - 10, city.cx + 10, city.cz + 10); string(city.cx - 10, city.cz + 10, city.cx + 10, city.cz - 10);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(flags.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  g.add(new THREE.Mesh(lights.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true })));
  g.visible = false; scene.add(g);
  return g;
}
for (const c of CITIES) festDecor[c.name] = buildFestival(c);

// fireworks: one shared pool of additive points
const FW_N = 900;
const fwGeo = new THREE.BufferGeometry();
fwGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FW_N * 3), 3));
fwGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(FW_N * 3), 3));
const fwPts = new THREE.Points(fwGeo, new THREE.PointsMaterial({ size: 2.2, map: puffTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
fwPts.frustumCulled = false; scene.add(fwPts);
const fwVel = new Float32Array(FW_N * 3), fwLife = new Float32Array(FW_N), fwCol = new Float32Array(FW_N * 3);
let fwNext = 0, fwT = 2;
const FW_COLS = [0xff4a3a, 0xffd23a, 0x5ad8ff, 0xb46aff, 0x6aff8a, 0xffffff];
function burstFirework(x, y, z) {
  const col = new THREE.Color(mpick(FW_COLS)), P = fwGeo.attributes.position;
  for (let k = 0; k < 70; k++) {
    const i = fwNext; fwNext = (fwNext + 1) % FW_N;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(mr(-1, 1)), sp = mr(9, 13);
    P.setXYZ(i, x, y, z);
    fwVel[i * 3] = Math.sin(ph) * Math.cos(th) * sp; fwVel[i * 3 + 1] = Math.cos(ph) * sp; fwVel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
    fwLife[i] = mr(1.4, 2.2); fwCol[i * 3] = col.r; fwCol[i * 3 + 1] = col.g; fwCol[i * 3 + 2] = col.b;
  }
  sfx.firework();
}
function updateFireworks(dt) {
  const P = fwGeo.attributes.position, Cc = fwGeo.attributes.color;
  for (let i = 0; i < FW_N; i++) {
    if (fwLife[i] <= 0) { Cc.setXYZ(i, 0, 0, 0); continue; }
    fwLife[i] -= dt;
    fwVel[i * 3 + 1] -= 6 * dt; for (let a = 0; a < 3; a++) fwVel[i * 3 + a] *= 1 - dt * 1.2;
    P.setXYZ(i, P.getX(i) + fwVel[i * 3] * dt, P.getY(i) + fwVel[i * 3 + 1] * dt, P.getZ(i) + fwVel[i * 3 + 2] * dt);
    const k = clamp(fwLife[i] / 1.2, 0, 1);
    Cc.setXYZ(i, fwCol[i * 3] * k, fwCol[i * 3 + 1] * k, fwCol[i * 3 + 2] * k);
  }
  P.needsUpdate = true; Cc.needsUpdate = true;
}

// ---------------------------------------------------------------------
// simulation. ctx: { day, hour, city (name or null), covered, say(msg), banner(html) }
// ---------------------------------------------------------------------
function setWeather(kind, ctx, quiet) {
  if (kind === WX.kind) return;
  WX.kind = kind;
  if (!quiet && ctx && !ctx.covered) ctx.say(WX_LINES[kind]);
}
export function resetWeather() {
  WX.kind = 'clear'; WX.t = 75; WX.rain = WX.fog = WX.cloud = WX.wet = WX.flash = 0;
  WX.blackout = null; WX.festival = null; WX.rolledNight = -1; WX.rolledDay = 0;
  for (const k in festDecor) festDecor[k].visible = false;
}
export function forceWeather(kind) { WX.kind = kind; WX.t = 120; } // debug + tests
export function updateWeather(dt, ctx) {
  const t = performance.now() / 1000;
  WX.here = ctx.city;
  WX.night = ctx.hour >= 19.5 || ctx.hour < 5.5;
  // the sky
  WX.t -= dt;
  if (WX.t <= 0) {
    WX.t = mr(55, 130);
    let next = mpick(WX_ODDS);
    if (WX.kind === 'storm' && next === 'clear') next = 'rain'; // storms ease off rather than vanish
    setWeather(next, ctx);
  }
  const K = WX_KINDS[WX.kind], ease = Math.min(1, dt * 0.12);
  WX.rain = lerp(WX.rain, K.rain, ease); WX.fog = lerp(WX.fog, K.fog, ease); WX.cloud = lerp(WX.cloud, K.cloud, ease);
  WX.wet = clamp(WX.wet + (WX.rain > 0.2 ? dt * 0.05 : -dt * 0.008), 0, 1);
  // thunder and lightning
  WX.flash = Math.max(0, WX.flash - dt * 3.5);
  if (WX.kind === 'storm' && WX.rain > 0.6) {
    WX.boltT -= dt;
    if (WX.boltT <= 0) { WX.boltT = mr(5, 14); WX.flash = 1; strikeBolt(); sfx.thunder(Math.random() < 0.3); }
  }
  if (WX.flash < 0.5) bolt.visible = false; else boltMat.opacity = WX.flash;
  // power cuts: most nights there's a chance one town goes dark, storms make it likelier
  const nightId = ctx.day; // the day counter ticks over at half four, so one night never spans two
  if (WX.night && WX.rolledNight !== nightId) {
    WX.rolledNight = nightId;
    if (Math.random() < (WX.kind === 'storm' ? 0.75 : 0.35)) {
      const city = ctx.city && Math.random() < 0.5 ? ctx.city : mpick(CITIES).name;
      WX.blackout = { city, t: mr(35, 60) };
      if (ctx.city === city) { ctx.say('POWER CUT! THE WHOLE TOWN JUST WENT DARK.'); sfx.powerDown(); }
      else ctx.say(`POWER CUT REPORTED IN ${city}.`);
    }
  }
  if (WX.blackout) {
    WX.blackout.t -= dt;
    if (WX.blackout.t <= 0 || !WX.night) { if (ctx.city === WX.blackout.city) ctx.say('THE LIGHTS FLICKER BACK ON.'); WX.blackout = null; }
  }
  // festivals: from day 2, some days one town throws a party
  if (WX.rolledDay !== ctx.day) {
    WX.rolledDay = ctx.day; WX.festival = null;
    if (ctx.day >= 2 && Math.random() < 0.4) {
      const city = mpick(CITIES).name;
      WX.festival = { city, day: ctx.day };
      ctx.banner(`${FESTIVALS[city]}<small>TODAY IN ${city}. BIG CROWDS, EASY TO BLEND IN.</small>`);
    }
  }
  for (const k in festDecor) festDecor[k].visible = !!WX.festival && WX.festival.city === k;
  const festHere = WX.festival && WX.festival.city === ctx.city;
  const darkHere = WX.blackout && WX.blackout.city === ctx.city;
  // fireworks over the party after dark
  if (festHere && (WX.night || ctx.hour > 18.5) && !ctx.covered) {
    fwT -= dt;
    if (fwT <= 0) { fwT = mr(0.8, 2.4); const c = CITIES.find((q) => q.name === ctx.city); burstFirework(c.cx + mr(-40, 40), mr(45, 75), c.cz + mr(-40, 40)); }
  }
  updateFireworks(dt);
  // how well people can see you
  WX.sight = (1 - 0.28 * WX.rain) * (1 - 0.45 * WX.fog) * (darkHere ? 0.55 : 1) * (festHere ? 0.85 : 1);
  if (WX.flash > 0.5) WX.sight = Math.max(WX.sight, 0.95); // lightning lights you right up
  WX.crowd = festHere ? 1.5 : 1 - 0.3 * WX.rain; // more people out for a party, fewer in the rain
  // sound + rain visuals
  rainLines.visible = WX.rain > 0.02 && !ctx.covered;
  rainMat.uniforms.uT.value = t; rainMat.uniforms.uAmt.value = WX.rain; rainMat.uniforms.uCam.value.copy(camera.position);
  setRain(ctx.covered ? WX.rain * 0.06 : WX.rain * 0.32);
}

// ---------------------------------------------------------------------
// look: runs after the day/night lighting each frame and bends it to the weather
// ---------------------------------------------------------------------
const C_OVERCAST = new THREE.Color(0x737b84), C_FOGGY = new THREE.Color(0x9aa2a8), C_FLASH = new THREE.Color(0xd8e4ff);
const _wc = new THREE.Color();
const groundBase = new THREE.Color(1, 1, 1);
export function applyWeatherLook(hemi, sun, dayAmt, under) {
  const out = 1 - under;
  const lvl = 0.12 + 0.88 * dayAmt;
  _wc.copy(C_OVERCAST).multiplyScalar(lvl);
  scene.background.lerp(_wc, WX.cloud * 0.7 * out);
  _wc.copy(C_FOGGY).multiplyScalar(lvl);
  scene.background.lerp(_wc, WX.fog * 0.8 * out);
  scene.fog.color.copy(scene.background);
  scene.fog.near = lerp(scene.fog.near, 3, WX.fog * 0.9 * out);
  scene.fog.far = lerp(scene.fog.far, 150, WX.rain * 0.6 * out);
  scene.fog.far = lerp(scene.fog.far, 60, WX.fog * out);
  sun.intensity *= 1 - WX.cloud * 0.75;
  hemi.intensity *= 1 - WX.cloud * 0.18;
  if (WX.flash > 0) { hemi.intensity += WX.flash * 2.2 * out; scene.background.lerp(C_FLASH, WX.flash * 0.6 * out); }
  // power cut: windows, street lamps and shop fronts go dark
  const dark = WX.blackout && WX.blackout.city === WX.here;
  if (dark) { for (const m of emissiveFacades) m.emissiveIntensity *= 0.04; hemi.intensity *= 0.8; }
  if (baked.glow) baked.glow.visible = !dark;
  if (baked.shop) baked.shop.material.color.setScalar(dark ? 0.12 : 1);
  // wet streets go dark and glossy
  if (baked.ground) baked.ground.material.color.copy(groundBase).multiplyScalar(1 - WX.wet * 0.35);
  if (baked.grass) baked.grass.material.color.copy(groundBase).multiplyScalar(1 - WX.wet * 0.2);
}
