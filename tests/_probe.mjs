import { openGame } from './harness.mjs';
const g = await openGame();
await g.run((H) => H.startGame(false));
const r = await g.run((H) => {
  for (const h of H.G.hunters) h.remove(); H.G.hunters.length = 0;
  const clearX = (p, a, b) => { for (let k = a; k <= b; k += 0.25) for (const dz of [-0.45, 0, 0.45]) if (Math.abs(k) > 0.4 && H.solidAt(p.x + k, 0.2, p.z + dz, 0.0)) return false; return true; };
  const P = H.streetProps.find((p) => p.kind === 'bin' && p.state === 'up' && clearX(p, -5, 1.5));
  H.player.x = P.x + 1.3; H.player.z = P.z; H.player.y = 0.15; H.player.yaw = Math.PI / 2; H.player.pitch = -0.3; H.player.shoveCd = 0;
  H.playerShove();
  const tr = [];
  H.stepDt(3, 1 / 30, () => { tr.push([P.x.toFixed(2), P.y.toFixed(2), P.z.toFixed(2), P.vx.toFixed(1), P.state].join(' ')); });
  return { at: [P.ox, P.oz], tr: tr.filter((_, i) => i % 6 === 0), cars: H.G.cars.filter((c) => Math.hypot(c.x - P.ox, c.z - P.oz) < 15).length };
});
console.log(JSON.stringify(r, null, 1));
await g.close();
