// Post-processing and reflections. The world is drawn into an off-screen buffer, then glow (bloom),
// a warm grade, film grain, a vignette that tightens when they're close, chromatic fringing and
// edge streaks when you're moving fast are layered on top. Roads (and floors indoors) get a planar
// reflection: a second, half-size render from a mirrored camera, rippled and smeared when it's wet.
import * as THREE from '../vendor/three.module.min.js';
import { renderer, scene, camera, vmScene, vmCamera } from './core.js';
import { baked } from './world.js';
import { interiorFloorMats } from './interiors.js';
import { WX } from './weather.js';

export const PFX = { on: true, refl: true, speed: 0, danger: 0, kick: 0, bloom: 0.75, frameMs: 16, reflSkip: 0, reflScale: 0.5 };

// ---------------------------------------------------------------------
// planar reflections
// ---------------------------------------------------------------------
const reflRT = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType });
const reflCam = new THREE.PerspectiveCamera();
const reflShared = { uRefl: { value: reflRT.texture }, uReflMat: { value: new THREE.Matrix4() }, uWet: { value: 0 }, uTime: { value: 0 } };
const roadAmt = { value: 0 }, floorAmt = { value: 0 };
function makeReflective(mat, amt) {
  if (!mat || mat.userData.reflective) return;
  mat.userData.reflective = true;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, reflShared, { uReflAmt: amt });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW; uniform sampler2D uRefl; uniform mat4 uReflMat; uniform float uReflAmt; uniform float uWet; uniform float uTime;')
      .replace('#include <opaque_fragment>', `
        if (uReflAmt > 0.001) {
          vec2 rip = vec2(sin(vRW.x * 11.0 + vRW.z * 3.0 + uTime * 7.0) * sin(vRW.z * 9.0 - uTime * 5.0), sin(vRW.z * 13.0 + uTime * 6.0) * sin(vRW.x * 7.0 + vRW.z * 5.0)) * 0.0012 * uWet;
          vec4 rc = uReflMat * vec4(vRW, 1.0);
          vec2 ruv = rc.xy / rc.w + rip;
          float smear = mix(0.03, 0.012, uWet);
          vec3 refl = vec3(0.0);
          for (int i = -3; i <= 3; i++) refl += texture2D(uRefl, ruv + vec2(0.0, float(i) * smear)).rgb;
          refl /= 7.0;
          vec3 V = normalize(cameraPosition - vRW);
          float fr = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
          float edge = smoothstep(0.0, 0.04, ruv.y) * smoothstep(1.0, 0.96, ruv.y) * smoothstep(0.0, 0.03, ruv.x) * smoothstep(1.0, 0.97, ruv.x);
          outgoingLight = mix(outgoingLight, refl, uReflAmt * (0.1 + 0.9 * fr) * edge);
        }
        #include <opaque_fragment>`);
  };
  mat.needsUpdate = true;
}
const _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _oq = new THREE.Vector4();
const _cp = new THREE.Vector3(), _look = new THREE.Vector3(), _rot = new THREE.Matrix4(), _n = new THREE.Vector3(0, 1, 0);
const _bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
function renderReflection(planeY) {
  camera.updateMatrixWorld();
  _cp.setFromMatrixPosition(camera.matrixWorld);
  if (_cp.y <= planeY + 0.05) return false;
  _rot.extractRotation(camera.matrixWorld);
  _look.set(0, 0, -1).applyMatrix4(_rot).add(_cp);
  reflCam.position.set(_cp.x, 2 * planeY - _cp.y, _cp.z);
  reflCam.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_n);
  reflCam.lookAt(_look.x, 2 * planeY - _look.y, _look.z);
  reflCam.near = camera.near; reflCam.far = camera.far; reflCam.fov = camera.fov; reflCam.aspect = camera.aspect;
  reflCam.updateProjectionMatrix(); reflCam.updateMatrixWorld();
  reflShared.uReflMat.value.copy(_bias).multiply(reflCam.projectionMatrix).multiply(reflCam.matrixWorldInverse);
  // oblique near plane: nothing below the mirror (the metro, the sewers) leaks into it
  _plane.setFromNormalAndCoplanarPoint(_n, new THREE.Vector3(0, planeY, 0)).applyMatrix4(reflCam.matrixWorldInverse);
  _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
  const e = reflCam.projectionMatrix.elements;
  _oq.x = (Math.sign(_clip.x) + e[8]) / e[0]; _oq.y = (Math.sign(_clip.y) + e[9]) / e[5]; _oq.z = -1; _oq.w = (1 + e[10]) / e[14];
  _clip.multiplyScalar(2 / _clip.dot(_oq));
  e[2] = _clip.x; e[6] = _clip.y; e[10] = _clip.z + 1 - 0.003; e[14] = _clip.w;
  renderer.setRenderTarget(reflRT); renderer.clear(); renderer.render(scene, reflCam);
  return true;
}

// ---------------------------------------------------------------------
// screen passes
// ---------------------------------------------------------------------
const sceneRT = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 4 });
const bloomA = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType });
const bloomB = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType });
const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fsScene = new THREE.Scene();
const fsGeo = new THREE.BufferGeometry();
fsGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
fsGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
const fsQuad = new THREE.Mesh(fsGeo); fsQuad.frustumCulled = false; fsScene.add(fsQuad);
const FS_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const pass = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
const brightMat = pass(`
  uniform sampler2D tIn; uniform vec2 uTexel; varying vec2 vUv;
  void main() {
    vec3 c = (texture2D(tIn, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tIn, vUv + uTexel * vec2(1.0, -1.0)).rgb
            + texture2D(tIn, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tIn, vUv + uTexel * vec2(1.0, 1.0)).rgb) * 0.25;
    float l = max(c.r, max(c.g, c.b));
    gl_FragColor = vec4(c * smoothstep(0.62, 1.25, l), 1.0);
  }`, { tIn: { value: null }, uTexel: { value: new THREE.Vector2() } });
const blurMat = pass(`
  uniform sampler2D tIn; uniform vec2 uDir; varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tIn, vUv).rgb * 0.2270;
    c += (texture2D(tIn, vUv + uDir * 1.3846).rgb + texture2D(tIn, vUv - uDir * 1.3846).rgb) * 0.3162;
    c += (texture2D(tIn, vUv + uDir * 3.2308).rgb + texture2D(tIn, vUv - uDir * 3.2308).rgb) * 0.0703;
    gl_FragColor = vec4(c, 1.0);
  }`, { tIn: { value: null }, uDir: { value: new THREE.Vector2() } });
const compMat = pass(`
  uniform sampler2D tScene; uniform sampler2D tBloom; uniform vec2 uRes;
  uniform float uTime; uniform float uSpeed; uniform float uDanger; uniform float uKick; uniform float uBloom;
  varying vec2 vUv;
  vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 uv = vUv, d = uv - 0.5; float r = length(d);
    // chromatic fringing: a touch always, more when you're flying along or something just hit
    float ca = 0.0015 + 0.005 * uSpeed + 0.004 * uDanger + 0.012 * uKick;
    vec3 col = vec3(texture2D(tScene, uv - d * ca).r, texture2D(tScene, uv).g, texture2D(tScene, uv + d * ca).b);
    // speed streaks: the edges of the screen smear toward the middle
    float sb = uSpeed * smoothstep(0.12, 0.6, r) * 0.07;
    if (sb > 0.001) { vec3 acc = col; for (int i = 1; i <= 6; i++) acc += texture2D(tScene, uv - d * sb * float(i) / 6.0).rgb; col = acc / 7.0; }
    col += texture2D(tBloom, uv).rgb * uBloom;
    col = col * 1.08 / (1.0 + col * 0.12); // soft shoulder so bright lamps don't clip hard
    vec3 s = toSRGB(clamp(col, 0.0, 1.0));
    float l = dot(s, vec3(0.299, 0.587, 0.114));
    s = mix(s, s * vec3(1.06, 1.0, 0.92), smoothstep(0.45, 1.0, l));      // warm highlights
    s += vec3(0.018, 0.006, 0.03) * (1.0 - l);                              // purple-ish haze in the shadows
    s = mix(vec3(l), s, 1.1);                                               // a little more colour
    float vig = smoothstep(0.9 - 0.25 * uDanger, 0.2, r);
    s *= mix(0.5 - 0.15 * uDanger, 1.0, vig);
    s += (hash(uv * uRes + fract(uTime) * 91.0) - 0.5) * 0.04;             // grain
    gl_FragColor = vec4(s, 1.0);
  }`, {
  tScene: { value: sceneRT.texture }, tBloom: { value: bloomA.texture }, uRes: { value: new THREE.Vector2() },
  uTime: { value: 0 }, uSpeed: { value: 0 }, uDanger: { value: 0 }, uKick: { value: 0 }, uBloom: { value: 0.75 },
});
const _sz = new THREE.Vector2();
let lastW = 0, lastH = 0;
function sizeTargets() {
  renderer.getDrawingBufferSize(_sz);
  const w = _sz.x, h = _sz.y;
  if (w === lastW && h === lastH) return;
  lastW = w; lastH = h;
  sceneRT.setSize(w, h);
  bloomA.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2)); bloomB.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
  reflRT.setSize(Math.max(1, Math.round(w * PFX.reflScale)), Math.max(1, Math.round(h * PFX.reflScale)));
  compMat.uniforms.uRes.value.set(w, h);
}
function runPass(mat, target) { fsQuad.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); }

export function initPostFX() { // after the world is built
  for (const m of [baked.ground?.material, baked.mark?.material]) makeReflective(m, roadAmt);
  for (const m of interiorFloorMats) makeReflective(m, floorAmt);
}

let failed = false, frameN = 0;
// o: { drawVM, indoor, floorY, speed, danger, kick, menu }
export function renderFrame(o) {
  const t = performance.now() / 1000;
  if (!PFX.on || failed) {
    renderer.setRenderTarget(null); renderer.clear(); renderer.render(scene, camera);
    if (o.drawVM) { renderer.clearDepth(); renderer.render(vmScene, vmCamera); }
    return;
  }
  try {
    sizeTargets(); frameN++;
    // reflections: roads outside, the floor you're standing on inside
    reflShared.uWet.value = WX.wet; reflShared.uTime.value = t;
    const wantRoad = 0.14 + 0.3 * WX.wet, wantFloor = 0.22;
    const planeY = o.indoor ? o.floorY + 0.004 : 0.02;
    // on a slow machine, refresh the reflection every other frame
    const skip = PFX.frameMs > 30 ? 2 : 1;
    let ok = true;
    if (PFX.refl && frameN % skip === 0) {
      const hideG = baked.ground && baked.ground.visible, hideM = baked.mark && baked.mark.visible;
      if (baked.ground) baked.ground.visible = false; if (baked.mark) baked.mark.visible = false;
      ok = renderReflection(planeY);
      if (baked.ground) baked.ground.visible = hideG; if (baked.mark) baked.mark.visible = hideM;
    }
    roadAmt.value = PFX.refl && ok && !o.indoor ? wantRoad : 0;
    floorAmt.value = PFX.refl && ok && o.indoor ? wantFloor : 0;
    // the world, then the gun in your hands
    renderer.setRenderTarget(sceneRT); renderer.clear(); renderer.render(scene, camera);
    if (o.drawVM) { renderer.clearDepth(); renderer.render(vmScene, vmCamera); }
    // glow
    brightMat.uniforms.tIn.value = sceneRT.texture; brightMat.uniforms.uTexel.value.set(1 / lastW, 1 / lastH); runPass(brightMat, bloomA);
    for (let i = 0; i < 2; i++) {
      blurMat.uniforms.tIn.value = bloomA.texture; blurMat.uniforms.uDir.value.set((1 + i) / bloomA.width, 0); runPass(blurMat, bloomB);
      blurMat.uniforms.tIn.value = bloomB.texture; blurMat.uniforms.uDir.value.set(0, (1 + i) / bloomA.height); runPass(blurMat, bloomA);
    }
    // grade it all onto the screen
    const U = compMat.uniforms;
    U.uTime.value = t; U.uSpeed.value = o.speed; U.uDanger.value = o.danger; U.uKick.value = o.kick; U.uBloom.value = PFX.bloom;
    runPass(compMat, null);
  } catch (err) {
    console.warn('post-processing off:', err); failed = true;
    renderer.setRenderTarget(null);
  }
}
