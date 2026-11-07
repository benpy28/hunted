// Daily routines: what townsfolk want to do depends on the hour, and they walk in through the door to
// do it: coffee and lunch in cafes, shopping, drinks in bars, shifts in the docks warehouses, and home
// to bed at night.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
before(async () => { g = await openGame(); await g.run((H) => H.startGame(false)); });
after(async () => { await g?.close(); });

test('what people fancy changes through the day', async () => {
  const s = await g.run((H) => [3, 8, 13, 15, 19, 23].map((hr) => { const w = H.cityLifeDebug.routineWants(hr); return Object.keys(w).sort((a, b) => w[b] - w[a])[0]; }));
  assert.deepEqual(s, ['home', 'eat', 'eat', 'browse', 'drink', 'drink']);
  const night = await g.run((H) => H.cityLifeDebug.routineWants(2).home), noon = await g.run((H) => H.cityLifeDebug.routineWants(13).home || 0);
  assert.ok(night > noon, 'more people head home at night');
});

// put one townsperson next to a place, send them on an outing and watch it play out
const OUTING = (H, { want, kind, home }) => {
  for (const h of H.G.hunters) h.remove(); H.G.hunters.length = 0;
  const cands = H.walkIns.filter((W) => (kind ? W.kind === kind : W.home === !!home));
  for (const W of cands) {
    const [ox, oz] = W.path[0];
    H.player.x = ox + 40; H.player.z = oz + 40; H.player.y = H.floorAt(H.player.x, H.player.z, 1);
    H.navRecenter(ox, oz, true);
    const h = new H.Hunter(ox, oz, 'civ', false, 'search'); h.job = null; H.G.hunters.push(h);
    if (!H.cityLifeDebug.routineVisit(h, want, H.LIFE)) { h.remove(); H.G.hunters.length = 0; continue; }
    const P = h.act.W; h.x = P.path[0][0]; h.z = P.path[0][1]; // they pick the nearest place of that kind: start them at its door
    const r = P.rect, inRect = () => h.x > r.x0 && h.x < r.x1 && h.z > r.z0 && h.z < r.z1;
    let doing = null;
    for (let i = 0; i < 40 * 10 && !doing; i++) { H.step(0.1); h.panicT = 0; if (h.act && h.act.phase === 'do') doing = { inside: inRect(), visible: h.g.visible, hidden: !!h.inside, cup: !!(h.cup && h.cup.visible), kind: h.act.kind }; if (!h.act) break; }
    if (!doing) return { fail: 'never got there', W: P.name };
    h.act.dur = h.act.t + 0.2;
    let out = false;
    for (let i = 0; i < 40 * 10 && !out; i++) { H.step(0.1); h.panicT = 0; if (!h.act) out = true; }
    return { ...doing, left: out && !inRect(), visibleAfter: h.g.visible };
  }
  return { fail: 'no place' };
};

test('at lunchtime people walk into a cafe and eat inside where you can see them, then walk back out', async () => {
  const s = await g.run((H, src) => (0, eval)(src)(H, { want: 'eat', kind: 'cafe' }), OUTING.toString());
  assert.equal(s.fail, undefined, s.fail);
  assert.deepEqual({ inside: s.inside, visible: s.visible, cup: s.cup, kind: s.kind }, { inside: true, visible: true, cup: true, kind: 'eat' });
  assert.ok(s.left, 'walked back out of the cafe');
});

test('at night people go home: in through the front door and out of sight until morning', async () => {
  const s = await g.run((H, src) => (0, eval)(src)(H, { want: 'home', home: true }), OUTING.toString());
  assert.equal(s.fail, undefined, s.fail);
  assert.equal(s.kind, 'home');
  assert.equal(s.visible, false, 'curtains drawn');
  assert.equal(s.hidden, true, 'nobody at home can spot you');
  assert.ok(s.left && s.visibleAfter, 'out again afterwards');
});

test('dock workers go into the warehouses for a shift', async () => {
  const s = await g.run((H) => {
    for (const h of H.G.hunters) h.remove(); H.G.hunters.length = 0;
    for (const Wh of H.warehouses) {
      const d = Wh.doors[0];
      H.player.x = d.ox + 40; H.player.z = d.oz + 40; H.player.y = H.floorAt(H.player.x, H.player.z, 1);
      H.navRecenter(d.ox, d.oz, true);
      const h = new H.Hunter(d.ox, d.oz, 'civ', false, 'search'); h.job = null; H.G.hunters.push(h);
      if (!H.cityLifeDebug.routineVisit(h, 'work', H.LIFE) || h.act.wh !== Wh) { h.remove(); H.G.hunters.length = 0; continue; }
      for (let i = 0; i < 400; i++) { H.step(0.1); h.panicT = 0; if (!h.act || h.act.phase === 'do') break; }
      const z = H.zoneAt(h.x, h.y + 0.5, h.z);
      return { doing: h.act && h.act.phase === 'do', kind: h.act && h.act.kind, inWarehouse: !!(z && z.warehouse) };
    }
    return { fail: true };
  });
  assert.deepEqual(s, { doing: true, kind: 'work', inWarehouse: true });
});
