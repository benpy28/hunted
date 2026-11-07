// The ice cream van, and the shop hours that change through the week.
//  - Two ice cream vans tour PORT HALDEN and ASHFORD from 10 till 8, playing their chime (its own little
//    tune). They pull over by playgrounds, the school gates at home time, the fete, the fun run, the
//    football and anywhere with a crowd. Grown-ups queue at the hatch, kids drag their parents over, and
//    any kid within earshot of the chime forgets all about the face off the telly.
//  - Buy a cone and for a while you're just someone enjoying an ice cream. A bag of sweets from the van
//    keeps kids quiet like the market's pick and mix.
//  - Shop hours: shops open later and shut early on Sundays, ASHFORD has half-day closing on Wednesdays,
//    Thursday is late-night shopping, pubs shut at 11 (half 10 on Sundays), the chemist and barber are shut
//    on Sundays, the barber's shut Mondays too, and the corner marts never close. Shut shops have no
//    shopkeeper, nobody visits them, and you can't buy anything.
import { mr, mpick } from './core.js';
import { cityAt, pointBlocked } from './world.js';
import { playgrounds, schoolInfo } from './kids.js';
import { MK_STATE, markets } from './market.js';
import { eventOn, weekdayOf, funRun, fete } from './townday.js';
import { ground, matchNow } from './matchday.js';

export const IC_STATE = { coneT: 0, cones: 0, served: 0, stops: 0, chimes: 0, lastChime: null, sold: 0 };

// =====================================================================
// The van: a traffic vehicle with its own idea of where to stop
// =====================================================================
const icVans = (K) => K.G.cars.filter((c) => c.kind === 'icecream' && !c.wrecked);
// which side of the van the hatch is on (the kerb side: away from the middle of the road)
export function icHatch(L, extra = 1.0) {
  let sx = L.fz, sz = -L.fx; // one side
  if (L.lane) { const across = L.lane.axis === 'z' ? sx : sz, kerb = -Math.sign(L.lane.dir || 1); if (Math.sign(across) !== kerb) { sx = -sx; sz = -sz; } }
  const d = L.hw + extra;
  return { x: L.x + sx * d, z: L.z + sz * d, sx, sz };
}
// places worth pulling over for, right now
function icPitches(K) {
  const hr = K.hour, day = K.G.day, out = [];
  for (const P of playgrounds) out.push({ x: P.x, z: P.z, why: 'playground', r: 26 });
  if (schoolInfo.gate && weekdayOf(day) < 5 && hr >= 15 && hr < 16.2) out.push({ x: schoolInfo.gate.x, z: schoolInfo.gate.z, why: 'school', r: 30 });
  if (fete.group && eventOn('fete', 'ASHFORD', day, hr) && schoolInfo.field) out.push({ x: schoolInfo.field.x, z: schoolInfo.field.z0, why: 'fete', r: 40 });
  if (funRun.start && eventOn('funrun', funRun.city, day, hr)) out.push({ x: funRun.start.x, z: funRun.start.z, why: 'funrun', r: 40 });
  const M = matchNow(day, hr); if (M && M.on) out.push({ x: ground.cx, z: ground.z1 + 10, why: 'match', r: 40 });
  for (const Mk of markets) out.push({ x: Mk.x, z: Mk.z, why: 'market', r: 36 });
  return out;
}
export const icOpenHours = (hr) => hr >= 10 && hr < 20;
export function icLogic(L, dt, target, K) {
  const hr = K.hour, open = icOpenHours(hr);
  L.icCool = Math.max(0, (L.icCool || 0) - dt);
  // the chime, while driving round in the daytime
  L.chimeT = (L.chimeT ?? mr(1, 5)) - dt;
  if (open && L.chimeT <= 0) { L.chimeT = L.stopT > 0 ? mr(9, 13) : mr(6, 9); IC_STATE.lastChime = { x: L.x, z: L.z, t: K.time }; if (K.near(L.x, L.z, 90)) { K.sfx.chime(); IC_STATE.chimes++; } }
  if (L.stopT > 0) {
    L.stopT -= dt; L.serving = open;
    if (L.stopT <= 0) { L.serving = false; L.icCool = mr(25, 40); }
    return 0;
  }
  L.serving = false;
  if (!open || L.icCool > 0) return target;
  L.icScan = (L.icScan || 0) - dt; if (L.icScan > 0) return target; L.icScan = 0.4;
  // anywhere good just ahead?
  for (const P of icPitches(K)) {
    const ax = P.x - L.x, az = P.z - L.z, ahead = ax * L.fx + az * L.fz, side = Math.abs(ax * L.fz - az * L.fx);
    if (ahead > -2 && ahead < 8 && side < P.r) return icStop(L, K, P.why);
  }
  // or a few people on the pavement who look like they want one
  if (Math.random() < 0.06) {
    let n = 0; for (const h of K.hunters()) if (!h.dead && h.state !== 'chase' && Math.abs(h.x - L.x) < 16 && Math.abs(h.z - L.z) < 16) n++;
    if (n >= 4) return icStop(L, K, 'crowd');
  }
  return target;
}
function icStop(L, K, why) {
  L.stopT = mr(16, 24); L.serving = true; L.icWhy = why; IC_STATE.stops++;
  if (K.near(L.x, L.z, 90)) { K.sfx.chime(); IC_STATE.chimes++; L.chimeT = mr(8, 12); }
  IC_STATE.lastChime = { x: L.x, z: L.z, t: K.time };
  icCallCustomers(L, K);
  return 0;
}
const IC_LINES = ['ONE WITH SPRINKLES, PLEASE', 'TWO CONES AND A LOLLY', 'HAVE YOU GOT ANY OF THE BLUE ONES?', 'IT\'S MELTING! IT\'S MELTING!', 'FIVE DOLLARS FOR A CONE?!', 'ALRIGHT, JUST THE ONE', 'NOT BEFORE YOUR TEA... OH GO ON THEN'];
const IC_KID_LINES = ['ICE CREAM! ICE CREAM!', 'MUM! THE VAN! THE VAN!', 'CAN I? CAN I? CAN I?', 'I WANT A ROCKET!', 'THE MUSIC MEANS IT\'S OPEN!'];
function icCallCustomers(L, K) {
  const H = icHatch(L, 1.0);
  let q = 0;
  for (const h of K.hunters()) {
    if (q >= 6) break;
    if (h.dead || h.state === 'chase' || h.panicT > 0 || h.job || h.racer || h.mdFan || h.contract || h.guard || h.rival) continue;
    const d = Math.hypot(h.x - L.x, h.z - L.z); if (d > 32) continue;
    if (!(h.kid || Math.random() < 0.4)) continue;
    const off = 0.9 + q * 0.75, x = H.x + L.fx * (off - 1.2), z = H.z + L.fz * (off - 1.2);
    if (pointBlocked(x, z, 0.3)) continue;
    K.lifeGo(h, 'queue', x, z, Math.atan2(L.x - x, L.z - z), mr(4, 9) + q * 1.5, { maxGo: 25, icVan: L });
    if (h.kid && K.near(h.x, h.z, 30)) K.sayAt(h.kid, mpick(IC_KID_LINES)); else if (K.near(h.x, h.z, 30) && Math.random() < 0.4) K.say(h, mpick(IC_LINES));
    q++; IC_STATE.served++;
  }
}
// kids within earshot of a chiming (or serving) van only have eyes for the van
export function icDistracted(k, K) {
  for (const L of icVans(K)) if ((L.serving || (IC_STATE.lastChime && K.time - IC_STATE.lastChime.t < 4 && Math.abs(IC_STATE.lastChime.x - L.x) < 30)) && Math.abs(k.x - L.x) < 40 && Math.abs(k.z - L.z) < 40) return L;
  return null;
}
export function icHatchNear(K) {
  const P = K.player;
  if (P.car || P.mode !== 'move' || P.y > 1.2) return null;
  for (const L of icVans(K)) { if (!L.serving || L.driver !== 'traffic') continue; const H = icHatch(L, 0.6); if (Math.hypot(H.x - P.x, H.z - P.z) < 2.0) return L; }
  return null;
}
const IC_MENU = [
  { id: 'ic_cone', name: 'SOFT WHIP CONE', price: 2, heal: 8, cone: 40, desc: 'With a chocolate stick in the top. Nobody suspects someone with an ice cream (+8).' },
  { id: 'ic_rocket', name: 'ROCKET LOLLY', price: 1, heal: 4, cone: 30, desc: 'Red, white and blue, and gone in three bites (+4).' },
  { id: 'ic_choc', name: 'CHOC ICE', price: 2, heal: 6, cone: 30, desc: 'A brick of vanilla in a chocolate shell (+6).' },
  { id: 'ic_slush', name: 'BLUE SLUSH', price: 2, cool: 6, cone: 25, desc: 'Brain freeze. Calms you right down.' },
  { id: 'ic_sweets', name: 'A BAG OF SWEETS', price: 3, sweets: 4, desc: 'Four sweets. E next to a kid to hand one over: they\'ll keep your secret today.' },
];
export function icMenu(K) {
  const P = K.player;
  return {
    cash: () => P.cash, items: () => IC_MENU, state: () => '',
    buy(it) {
      if (P.cash < it.price) return `YOU NEED $${it.price - P.cash} MORE`;
      P.cash -= it.price; K.sfx.cash(); IC_STATE.sold++;
      if (it.heal) P.hp = Math.min(100, P.hp + it.heal);
      if (it.cool) K.coolHeat(it.cool);
      if (it.cone) { IC_STATE.coneT = Math.max(IC_STATE.coneT, it.cone); IC_STATE.cones++; }
      if (it.sweets) { MK_STATE.sweets = (MK_STATE.sweets || 0) + it.sweets; return `${MK_STATE.sweets} SWEETS IN YOUR POCKET`; }
      return mpick(['THERE YOU GO, LOVE', 'MIND IT DOESN\'T DRIP', 'ENJOY!', 'LAST ONE OF THOSE TODAY']);
    },
  };
}
export function updateIceCream(dt, K) {
  if (IC_STATE.coneT > 0) { IC_STATE.coneT -= dt; if (IC_STATE.coneT <= 0) K.showMsg('YOU FINISH YOUR ICE CREAM', 1.4); }
}
export const icConspic = (K) => (IC_STATE.coneT > 0 && !K.player.car && !K.player.sprinting ? -0.12 : 0);
export function resetIceCream() { IC_STATE.coneT = 0; IC_STATE.cones = 0; IC_STATE.served = 0; IC_STATE.stops = 0; IC_STATE.chimes = 0; IC_STATE.lastChime = null; IC_STATE.sold = 0; }
export const iceCreamDebug = (K) => ({ vans: icVans(K).map((L) => ({ x: L.x, z: L.z, serving: !!L.serving, stopT: L.stopT, driver: L.driver })), ...IC_STATE });

// =====================================================================
// Shop hours
// =====================================================================
// [open, close] in hours (close past midnight goes over 24), or null if shut all day
export function shopHours(kind, town, day) {
  const wd = weekdayOf(day), sun = wd === 6, sat = wd === 5, thu = wd === 3, wed = wd === 2;
  const halfDay = town === 'ASHFORD' && wed; // half-day closing in the village
  let h;
  switch (kind) {
    case 'mart': case 'home': return [0, 24];
    case 'cafe': h = sun ? [9, 16] : [7, 18]; break;
    case 'diner': h = sun ? [8, 22] : [6, 23]; break;
    case 'pizza': h = sun ? [12, 23] : [11, 24.5]; break;
    case 'bar': h = sun ? [12, 22.5] : sat ? [11, 24] : [11, 23]; break;
    case 'pharmacy': if (sun) return null; h = [8.5, 18.5]; break;
    case 'barber': if (sun || wd === 0) return null; h = [9, 18]; break;
    case 'laundry': h = sun ? [9, 18] : [7, 21]; break;
    case 'arcade': h = sun ? [11, 20] : [10, 23]; break;
    case 'guns': case 'hire': case 'costume': h = sun ? [10, 17] : [8, 21]; break; // the places you shop
    default: h = sun ? [10, 16] : [9, 17.5]; // books, clothes, florist...
  }
  h = h.slice();
  if (thu && kind !== 'bar' && kind !== 'pizza' && kind !== 'diner') h[1] = Math.max(h[1], 21); // late-night shopping
  if (halfDay && !['bar', 'pizza', 'diner', 'guns', 'hire'].includes(kind)) h[1] = Math.min(h[1], 13);
  if (town === 'SALTMARSH DOCKS' && ['cafe', 'diner'].includes(kind)) h[0] = Math.min(h[0], 5); // early for the dockers
  return h;
}
export function shopOpenAt(kind, town, day, hr) {
  const h = shopHours(kind, town, day); if (!h) return false;
  if (h[1] > 24 && hr < h[1] - 24) return true; // still open from last night
  return hr >= h[0] && hr < h[1];
}
const fmtH = (h) => { h = ((h % 24) + 24) % 24; const hh = Math.floor(h), mm = Math.round((h - hh) * 60); const ap = hh < 12 ? 'AM' : 'PM', h12 = ((hh + 11) % 12) + 1; return `${h12}${mm ? ':' + String(mm).padStart(2, '0') : ''}${ap}`; };
export function shutLine(kind, town, day, hr) {
  const h = shopHours(kind, town, day);
  if (!h) return 'SHUT TODAY';
  if (hr < h[0]) return `SHUT. OPENS AT ${fmtH(h[0])}`;
  const t = shopHours(kind, town, day + 1);
  return `SHUT FOR THE NIGHT${t ? `. OPENS AT ${fmtH(t[0])} TOMORROW` : '. SHUT TOMORROW TOO'}`;
}
export function hoursLine(kind, town, day) { const h = shopHours(kind, town, day); return h ? `${fmtH(h[0])}-${fmtH(h[1])}` : 'SHUT'; }
export function icTownOf(x, z) { const c = cityAt(x, z, 4); return c ? c.name : null; }
