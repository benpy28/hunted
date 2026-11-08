// People tests: everyone gets a cartoon face, a skin tone, a hairstyle, and their expression shows
// how they feel about you.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
before(async () => { g = await openGame(); await g.run((H) => H.startGame(false)); });
after(async () => { await g?.close(); });

test('a crowd has many skin tones, hairstyles and faces', async () => {
  const s = await g.run((H) => {
    const made = [];
    for (let i = 0; i < 60; i++) made.push(new H.Hunter(H.player.x + 30 + (i % 10), H.player.z + 30 + Math.floor(i / 10), 'civ', false));
    const skins = new Set(), styles = new Set(), faces = new Set();
    let painted = 0;
    for (const h of made) {
      const L = h.p.look; skins.add(L.skin); styles.add(L.hairStyle); faces.add(L.face.eyes + L.face.mouth);
      if (h.p.headMats[4].map) painted++;
      h.remove();
    }
    return { skins: skins.size, styles: styles.size, faces: faces.size, painted };
  });
  assert.ok(s.skins >= 7, `skin tones: ${s.skins}`);
  assert.ok(s.styles >= 7, `hairstyles: ${s.styles}`);
  assert.ok(s.faces >= 10, `face combos: ${s.faces}`);
  assert.equal(s.painted, 60, 'every head has a painted face');
});

test('chasers look angry and people who are scared of you look scared', async () => {
  const s = await g.run((H) => {
    const h = new H.Hunter(H.player.x + 6, H.player.z, 'civ', false);
    H.G.hunters.push(h);
    h.state = 'chase'; h.noticeT = 0; h.update(0.03);
    const chase = h.p.mood;
    h.stun = 2; h.update(0.03);
    const stunned = h.p.mood;
    h.remove(); H.G.hunters.splice(H.G.hunters.indexOf(h), 1);
    return { chase, stunned };
  });
  assert.equal(s.chase, 'angry');
  assert.equal(s.stunned, 'scared');
});
