// Street props: bins and wheelie bins get kicked over and tumble, spill rubbish and bowl people over;
// hydrants burst when hit hard enough and the jet flings people (and you) into the air.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
before(async () => {
  g = await openGame(); await g.run((H) => H.startGame(false));
  await g.run((H) => { H.faceTo = (H, x, z) => { H.player.yaw = Math.atan2(-(x - H.player.x), -(z - H.player.z)); H.player.pitch = 0; } });
  await g.run((H) => { H.clear = (H) => { for (const h of H.G.hunters) h.remove(); H.G.hunters.length = 0; H.player.hp = 100; H.player.alive = true; H.player.bike = null; H.player.vx = H.player.vz = 0; H.G.heat = 0; } });
});
after(async () => { await g?.close(); });




test('the streets have kickable bins, wheelie bins and hydrants, upright and solid', async () => {
  const s = await g.run((H) => {
    const by = (k) => H.streetProps.filter((p) => p.kind === k);
    return { bins: by('bin').length, wheelies: by('wheelie').length, hydrants: by('hydrant').length,
      solid: H.streetProps.filter((p) => !!H.solidAt(p.x, 0.2, p.z, 0.02)).length, notSolid: H.streetProps.filter((p) => !H.solidAt(p.x, 0.2, p.z, 0.02)).slice(0, 3).map((p) => [p.kind, p.x, p.z, p.col.h, p.col.y0]), total: H.streetProps.length, up: H.streetProps.filter((p) => p.state === 'up').length };
  });
  assert.ok(s.bins > 80 && s.wheelies > 80 && s.hydrants > 80, JSON.stringify(s));
  assert.equal(s.up, s.total);
  assert.equal(s.solid, s.total, 'every prop blocks you until it is knocked over ' + JSON.stringify(s.notSolid));
});

test('a shove sends a bin flying: the lid comes off, rubbish spills, and it ends up on its side', async () => {
  const s = await g.run((H) => {
    H.clear(H);
    const clearX = (p, a, b) => { for (let k = a; k <= b; k += 0.25) for (const dz of [-0.45, 0, 0.45]) if (Math.abs(k) > 0.4 && H.solidAt(p.x + k, 0.2, p.z + dz, 0.0)) return false; return true; };
    const P = H.streetProps.find((p) => p.kind === 'bin' && p.state === 'up' && clearX(p, -5, 1.5));
    H.player.x = P.x + 1.3; H.player.z = P.z; H.player.y = 0.15; H.faceTo(H, P.x, P.z); H.player.shoveCd = 0;
    const litter0 = H.streetPropDebug().spLitter;
    H.playerShove();
    const flying = P.state === 'loose' && P.vy > 0, lidOff = P.lid.state === 'loose', solidNow = !!H.solidAt(P.ox, 0.2, P.oz, 0.02);
    let t = 0, rest = null; // (traffic may come along and knock it on again, so catch it once it first settles)
    H.stepDt(5, 1 / 30, () => { t += 1 / 30; if (!rest && t > 1 && Math.hypot(P.vx, P.vz) < 0.4 && Math.abs(P.vy) < 0.1) rest = { y: P.y, side: Math.abs(Math.cos(P.rx)), moved: Math.hypot(P.x - P.ox, P.z - P.oz) }; });
    return { flying, lidOff, solidNow, litter: H.streetPropDebug().spLitter - litter0, moved: rest ? rest.moved : 0, y: rest ? rest.y : 9, rest: rest ? 0 : 9, side: rest ? rest.side : 9 };
  });
  assert.ok(s.flying && s.lidOff, 'kicked up and the lid pops off');
  assert.equal(s.solidNow, false, 'its spot is no longer solid');
  assert.ok(s.litter >= 4, 'rubbish on the ground');
  assert.ok(s.moved > 2, `only went ${s.moved.toFixed(1)} m`);
  assert.ok(s.y < 0.6 && s.rest < 0.6 && s.side < 0.3, `should lie still on its side (y ${s.y.toFixed(2)}, v ${s.rest.toFixed(2)}, cos ${s.side.toFixed(2)})`);
});

test('sprinting into a wheelie bin bowls it over', async () => {
  const s = await g.run((H) => {
    H.clear(H);
    const P = H.streetProps.find((p) => p.kind === 'wheelie' && p.state === 'up' && !H.solidAt(p.x - 3, 0.5, p.z, 0.05) && !H.solidAt(p.x - 1.5, 0.5, p.z, 0.05));
    H.player.x = P.x - 3; H.player.z = P.z; H.player.y = P.y - 0.5; H.faceTo(H, P.x, P.z);
    H.player.stam = 100; H.player.exhausted = false;
    H.stepDt(1, 1 / 30, () => { H.input.fwd = 1; H.input.sprint = true; });
    H.input.fwd = 0; H.input.sprint = false;
    return { st: P.state };
  });
  assert.equal(s.st, 'loose');
});

test('a bin kicked hard down the street floors the people it hits', async () => {
  const s = await g.run((H) => {
    H.clear(H);
    const clearX = (p, a, b) => { for (let k = a; k <= b; k += 0.25) for (const dz of [-0.45, 0, 0.45]) if (Math.abs(k) > 0.4 && H.solidAt(p.x + k, 0.2, p.z + dz, 0.0)) return false; return true; };
    const P = H.streetProps.find((p) => p.kind === 'bin' && p.state === 'up' && clearX(p, -2, 4.5));
    H.player.x = P.x - 1.5; H.player.z = P.z; H.player.y = 0.15;
    const h = new H.Hunter(P.x + 3, P.z, 'civ', false, 'search'); H.G.hunters.push(h); h.y = 0.15;
    const P0 = { x: P.x + 3, z: P.z };
    H.kickProp(P, 1, 0, 12, H.BK, 1.5);
    let hit = false;
    H.stepDt(1, 1 / 60, () => { if (h.dead || h.stun > 0.5) hit = true; if (!h.dead) { h.x = P0.x; h.z = P0.z; } });
    return { hit };
  });
  assert.ok(s.hit, 'the bin went straight through them');
});

test('cars smash through bins and burst hydrants', async () => {
  const s = await g.run((H) => {
    H.clear(H);
    const c = H.G.cars.find((c) => c.kind === 'car' && !c.wrecked && !c.far);
    const B = H.streetProps.find((p) => p.kind === 'bin' && p.state === 'up');
    const Y = H.streetProps.find((p) => p.kind === 'hydrant' && !p.burst);
    const ram = (P) => { c.driver = null; c.lane = null; c.heading = 0; c.x = P.x; c.z = P.z - 2.5; c.speed = 12; H.step(1 / 30); };
    H.player.x = B.x + 20; H.player.z = B.z + 20;
    ram(B); const bin = B.state;
    ram(Y); const hyd = !!Y.burst;
    return { bin, hyd };
  });
  assert.equal(s.bin, 'loose');
  assert.ok(s.hyd);
});

test('kicking a hydrant just hurts your foot, but three bullets burst it into a jet', async () => {
  const s = await g.run((H) => {
    H.clear(H);
    const V = H.camera.position.constructor;
    const aim = (p) => new V(p.x - (p.x + 5), 0.55 - 1.0, 0).normalize();
    const Y = H.streetProps.find((p) => { if (p.kind !== 'hydrant' || p.burst || H.G.cars.some((c) => Math.hypot(c.x - p.x - 2.5, c.z - p.z) < 7) || H.solidAt(p.x + 1.2, 0.2, p.z, 0.05) || H.solidAt(p.x + 5, 0.2, p.z, 0.05)) return false; const o = new V(p.x + 5, 1.0, p.z), r = H.rayProps(o, aim(p), 50); return r && r.P === p && H.raycastWorld(o, aim(p), 50).t > r.t - 0.4; });
    H.player.x = Y.x + 1.2; H.player.z = Y.z; H.player.y = 0.15; H.faceTo(H, Y.x, Y.z); H.player.shoveCd = 0;
    const hp0 = H.player.hp;
    H.playerShove();
    const kicked = { burst: !!Y.burst, hurt: H.player.hp < hp0 };
    H.player.x = Y.x + 5; H.player.z = Y.z; H.faceTo(H, Y.x, Y.z);
    H.camera.position.set(H.player.x, 1.0, H.player.z);
    const dir = aim(Y);
    const dbg = { world: H.raycastWorld(H.camera.position, dir, 50).t, rp: (H.rayProps(H.camera.position, dir, 50) || {}).t, cars: H.G.cars.filter((c) => Math.hypot(c.x - Y.x, c.z - Y.z) < 8).length, hs: H.G.hunters.filter((h) => !h.dead && Math.hypot(h.x - Y.x, h.z - Y.z) < 8).length };
    for (let i = 0; i < 3; i++) H.fireRay(dir, 50, false);
    return { kicked, burst: !!Y.burst, n: H.geysers.length, hits: Y.hits, dbg, cam: H.camera.position.toArray(), y: [Y.x, Y.z] };
  });
  assert.equal(s.kicked.burst, false);
  assert.ok(s.kicked.hurt, 'stubbing your toe on a hydrant hurts');
  assert.ok(s.burst && s.n >= 1, 'three shots burst it ' + JSON.stringify(s));
});

test('a bursting hydrant launches anyone on top of it, you included, and soaks people running through', async () => {
  const s = await g.run((H) => {
    H.clear(H);
    const Y = H.streetProps.find((p) => p.kind === 'hydrant' && !p.burst && !H.solidAt(p.x + 1.5, 0.5, p.z, 0.05));
    H.player.x = Y.x + 30; H.player.z = Y.z;
    const h = new H.Hunter(Y.x + 0.3, Y.z, 'civ', false, 'search'); H.G.hunters.push(h);
    const r = new H.Hunter(Y.x + 1.5, Y.z, 'runner', false, 'chase'); H.G.hunters.push(r);
    H.hitHydrant(Y, 3, H.BK);
    H.stepDt(1, 1 / 30, () => { h.x = Y.x + 0.3; h.z = Y.z; });
    const flung = h.dead, soaked = r.soakT > 0 || r.dead;
    // now you step onto it
    H.player.x = Y.x + 0.2; H.player.z = Y.z; H.player.y = 0.15; H.player.vy = 0; H.player.vx = H.player.vz = 0;
    let top = 0;
    H.stepDt(1.5, 1 / 30, () => { top = Math.max(top, H.player.y); });
    return { flung, soaked, top };
  });
  assert.ok(s.flung, 'the person standing on it went flying');
  assert.ok(s.soaked, 'the chaser running through the spray got soaked');
  assert.ok(s.top > 4, `you only went ${s.top.toFixed(1)} m up`);
});

test('overnight the council tidies up everything you are not looking at', async () => {
  const s = await g.run((H) => {
    const P = H.streetProps.find((p) => p.state === 'loose' || p.burst);
    H.player.x = P.ox + 200; H.player.z = P.oz;
    H.tidyStreetProps(H.player.x, H.player.z);
    return { up: P.state === 'up', fixed: !P.burst, solid: !!H.solidAt(P.ox, 0.2, P.oz, 0.02) };
  });
  assert.ok(s.up && s.fixed && s.solid);
});
