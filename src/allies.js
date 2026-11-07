// Allies: people you've paid to be on your side for a few days. Pals throw hands, bodyguards shoot.
import * as THREE from '../vendor/three.module.min.js';
import { lerp, angDiff, mr, mpick, canvasTex, scene } from './core.js';
import { resolveBody, floorAt, navTarget, los, blockedAt, randomOpenPoint } from './world.js';
import { buildPerson, SKINS, HAIRS, addRagdoll } from './people.js';
import { spawnTracer } from './fx.js';
import { sfx } from './audio.js';

const ALLY_NAMES = ['BIG TONY', 'KEVIN', 'LITTLE DEB', 'THE ACCOUNTANT', 'NAN', 'DAZ', 'PROFESSOR PUNCH', 'GARY TWO-SHOES', 'MO', 'SPUD'];
const allyMarkerMat = new THREE.SpriteMaterial({
  map: canvasTex(64, 64, (ctx) => { ctx.fillStyle = '#3cff8a'; ctx.beginPath(); ctx.moveTo(32, 6); ctx.lineTo(58, 32); ctx.lineTo(32, 58); ctx.lineTo(6, 32); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#0a3a1a'; ctx.font = 'bold 34px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', 32, 34); }),
  depthTest: false, transparent: true,
});
export const ALLY_TYPES = {
  pal: { hp: 70, speed: 7.4, armed: false, life: 270 },
  guard: { hp: 120, speed: 7.0, armed: true, life: 270 },
};

export class Ally {
  constructor(kind, x, y, z) {
    this.kind = kind; this.T = ALLY_TYPES[kind]; this.name = mpick(ALLY_NAMES);
    this.p = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt: kind === 'guard' ? 0x1a1a1a : 0x2fa84f, pants: 0x2c3e66, gun: this.T.armed, cap: kind === 'guard' ? null : 0x2fa84f, vest: kind === 'guard' ? 0x3a3a3a : null });
    this.g = this.p.group; scene.add(this.g);
    this.marker = new THREE.Sprite(allyMarkerMat); this.marker.scale.setScalar(0.45); this.marker.position.y = 2.3; this.g.add(this.marker);
    this.x = x; this.y = y; this.z = z; this.vx = 0; this.vz = 0; this.vy = 0; this.face = 0; this.phase = 0;
    this.hp = this.T.hp; this.life = this.T.life; this.target = null; this.hitCd = 0; this.thinkT = 0; this.dead = false; this.riding = false;
    this.side = Math.random() < 0.5 ? 1 : -1;
  }
  remove() { scene.remove(this.g); this.dead = true; }
  down(ctx) {
    if (this.dead) return;
    this.dead = true; this.g.position.set(this.x, this.y, this.z);
    addRagdoll(this.p, 1, { x: this.vx, y: 0, z: this.vz }, { x: mr(-3, 3), y: 3, z: mr(-3, 3) }, 1);
    ctx.msg(`${this.name} GOT FLATTENED`);
  }
  // ctx: { player, hunters, inCar, eyeY, msg }
  update(dt, ctx) {
    const P = ctx.player;
    this.life -= dt; this.hitCd -= dt; this.thinkT -= dt;
    if (this.life <= 0) { ctx.msg(`${this.name}'S CONTRACT IS UP`); this.remove(); return; }
    // ride along when you drive
    if (ctx.inCar) { this.riding = true; this.g.visible = false; this.x = P.x; this.z = P.z; this.y = 0; return; }
    if (this.riding) { // hop out next to you
      this.riding = false; this.g.visible = true;
      const s = randomOpenPoint(P.x, P.z, 1.5, 3.5) || { x: P.x + 1.5, z: P.z };
      this.x = s.x; this.z = s.z; this.y = floorAt(s.x, s.z, P.y + 0.5); this.vy = 0;
    }
    const pd = Math.hypot(P.x - this.x, P.z - this.z);
    // left behind on another level or far away: catch up when you're not looking
    if (pd > 45 || (Math.abs(P.y - this.y) > 2.5 && pd < 6)) {
      const s = randomOpenPoint(P.x, P.z, 2, 5);
      if (s && Math.abs(floorAt(s.x, s.z, P.y + 0.5) - P.y) < 0.6) { this.x = s.x; this.z = s.z; this.y = P.y; this.vy = 0; }
    }
    if (this.thinkT <= 0) {
      this.thinkT = 0.3;
      let best = null, bd = this.T.armed ? 24 : 18;
      for (const h of ctx.hunters) {
        if (h.dead || h.state !== 'chase' || Math.abs(h.y - this.y) > 2) continue;
        const dPl = Math.hypot(h.x - P.x, h.z - P.z), d = Math.hypot(h.x - this.x, h.z - this.z);
        if (dPl < 22 && d < bd) { bd = d; best = h; }
      }
      this.target = best;
    }
    let tx = P.x - Math.sin(P.yaw) * 2.6 + Math.cos(P.yaw) * this.side * 1.4, tz = P.z - Math.cos(P.yaw) * 2.6 - Math.sin(P.yaw) * this.side * 1.4, want = 0, spd = this.T.speed;
    const h = this.target && !this.target.dead ? this.target : null;
    if (h) {
      const d = Math.hypot(h.x - this.x, h.z - this.z);
      if (this.T.armed && d < 24 && los(this.x, this.z, h.x, h.z)) {
        // stand and shoot
        want = d > 10 ? 0.6 : 0; tx = h.x; tz = h.z;
        this.face += angDiff(this.face, Math.atan2(h.x - this.x, h.z - this.z)) * Math.min(1, dt * 10);
        if (this.hitCd <= 0) {
          this.hitCd = mr(0.7, 1.1);
          const from = new THREE.Vector3(this.x + Math.sin(this.face) * 0.6, this.y + 1.45, this.z + Math.cos(this.face) * 0.6);
          const hit = Math.random() < 0.55;
          const to = new THREE.Vector3(h.x + (hit ? 0 : mr(-1.5, 1.5)), h.y + 1.2 + (hit ? 0 : mr(-0.5, 1)), h.z + (hit ? 0 : mr(-1.5, 1.5)));
          spawnTracer(from, to, 0x9affc0); sfx.enemyShot(Math.hypot(this.x - P.x, this.z - P.z));
          if (hit) { const dl = d || 1; h.damage(1, (h.x - this.x) / dl, (h.z - this.z) / dl, h.y + 1.2, false); }
        }
      } else {
        tx = h.x; tz = h.z; want = 1;
        if (d < 1.4 && this.hitCd <= 0) { // a proper wallop
          this.hitCd = 0.8; this.punch = 1; sfx.shove();
          const dl = d || 1, ux = (h.x - this.x) / dl, uz = (h.z - this.z) / dl;
          h.kx += ux * 9 * h.T.knock; h.kz += uz * 9 * h.T.knock; h.stun = Math.max(h.stun, 1.1);
          if (Math.random() < 0.5) h.damage(1, ux, uz, h.y + 1.2, false);
        }
      }
      // they hit back
      if (d < 1.5 && h.stun <= 0) this.hp -= dt * (h.T.dmg * 0.9);
    } else if (pd > 3.2) want = 1;
    if (this.hp <= 0) { this.down(ctx); return; }
    // move
    let ex = tx - this.x, ez = tz - this.z; const ed = Math.hypot(ex, ez) || 1;
    if (want > 0 && ed < (h ? 1.1 : 0.6)) want = 0;
    if (!h && pd > 8 && !los(this.x, this.z, P.x, P.z)) { const n = navTarget(this.x, this.z, 2); if (n) { ex = n.x - this.x; ez = n.z - this.z; } }
    else if (want && !los(this.x, this.z, tx, tz)) {
      const a = Math.atan2(ex, ez);
      for (const off of [0.6, -0.6, 1.2, -1.2]) { if (!blockedAt(this.x + Math.sin(a + off) * 2.5, this.z + Math.cos(a + off) * 2.5)) { ex = Math.sin(a + off); ez = Math.cos(a + off); break; } }
    }
    const el = Math.hypot(ex, ez) || 1;
    const k = want * spd * (pd > 12 && !h ? 1.15 : pd < 5 && !h ? 0.55 : 1);
    this.vx = lerp(this.vx, (ex / el) * k, Math.min(1, dt * 8)); this.vz = lerp(this.vz, (ez / el) * k, Math.min(1, dt * 8));
    this.x += this.vx * dt; this.z += this.vz * dt;
    resolveBody(this, 0.35, this.y, 1.8);
    const prevY = this.y; this.vy -= 22 * dt; this.y += this.vy * dt;
    const floor = floorAt(this.x, this.z, Math.max(prevY, this.y));
    if (this.y <= floor || (prevY - floor < 0.45 && this.vy <= 0 && this.y - floor < 0.45)) { this.y = floor; this.vy = 0; }
    // animate
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 0.3 && !(h && this.T.armed && want < 1)) this.face += angDiff(this.face, Math.atan2(this.vx, this.vz)) * Math.min(1, dt * 10);
    this.phase += sp * dt * 2.4;
    const sw = Math.sin(this.phase) * Math.min(1, sp / 3) * 0.8, p = this.p;
    this.punch = Math.max(0, (this.punch || 0) - dt * 4);
    p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
    if (h && this.T.armed && want < 1) { p.armR.rotation.x = -1.5; p.armL.rotation.x = -0.3; }
    else if (this.punch > 0) { p.armR.rotation.x = -1.6 * Math.sin(this.punch * Math.PI); p.armL.rotation.x = -0.8; }
    else { p.armL.rotation.x = -sw * 0.9; p.armR.rotation.x = sw * 0.9; }
    this.g.position.set(this.x, this.y + Math.abs(Math.cos(this.phase)) * Math.min(1, sp / 4) * 0.07, this.z);
    this.g.rotation.y = this.face;
    this.marker.visible = pd > 5;
  }
}
