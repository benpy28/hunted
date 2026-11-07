// News: Channel 9 runs on the billboards and on TVs around town. When nobody knows who you are it's
// pie contests and the weather; as your profile climbs, more screens switch over to you, with a police
// sketch of the look people last clocked you in, where you were last seen and a crawl along the bottom.
import * as THREE from '../vendor/three.module.min.js';
import { adMats } from './world.js';

const NW = 512, NH = 256;
const newsCanvas = document.createElement('canvas'); newsCanvas.width = NW; newsCanvas.height = NH;
const nctx = newsCanvas.getContext('2d');
export const newsTex = new THREE.CanvasTexture(newsCanvas);
newsTex.colorSpace = THREE.SRGBColorSpace;
export const newsMat = new THREE.MeshBasicMaterial({ map: newsTex });
const adMaps = adMats.map((m) => m.map);
// screens switch to the news in this order as you get more wanted
const NEWS_ORDER = [3, 6, 0, 5, 1, 7, 2, 4];
const NEWS_SCREENS = [1, 2, 4, 5, 7, 8];

const FILLER = [
  ['LOCAL NEWS', 'PENSIONER WINS PIE CONTEST', 'JUDGES "STILL FULL"'],
  ['LOCAL NEWS', 'PIGEON ELECTED TO COUNCIL', 'PROMISES "MORE CRUMBS"'],
  ['TRAFFIC', 'ROUTE 9 "FINE, MOSTLY"', 'SAYS MAN IN HELICOPTER'],
  ['SPORT', 'HALDEN HARRIERS LOSE AGAIN', 'FANS "USED TO IT"'],
  ['LOCAL NEWS', 'GIANT MARROW SETS RECORD', 'GROWER WEEPS WITH JOY'],
  ['CONSUMER', 'FIZZO RECALLS "TOO FIZZY" CANS', 'NOBODY HURT, SOME BURPING'],
];
const HEADLINES = [
  null,
  ['DEVELOPING', 'SUSPICIOUS PERSON REPORTED', 'POLICE SAY "PROBABLY NOTHING"'],
  ['BREAKING', 'BOUNTY TARGET SPOTTED', 'PUBLIC URGED TO KEEP EYES PEELED'],
  ['BREAKING', 'WANTED: THIS FACE', 'BOUNTY RAISED AGAIN'],
  ['BREAKING', 'MOST WANTED ON THE LOOSE', 'POLICE AIR UNITS UP'],
  ['EMERGENCY', 'PUBLIC ENEMY NUMBER ONE', 'STAY INDOORS. OR DON\'T. WE\'RE NOT YOUR MUM.'],
];
const CRAWL_BITS = [
  'DR. MOLAR REMINDS YOU TO FLOSS', 'BURGER BARN NOW OPEN TILL 5AM', 'SUNNY FM 98.4: ALL HITS, ALL DAY',
  'SCIENTISTS CONFIRM WATER STILL WET', 'NEXA ONE PHONE "PROBABLY NOT LISTENING"', 'LOST CAT FOUND, WAS ON ROOF',
];

let crawlX = NW, flashT = 0, lastLevel = 0, fillerI = 0, fillerT = 0, newsAcc = 0;
// draws a pencil sketch of a face wearing whatever disguise bits people last clocked you in
function drawSketch(ctx, x, y, look) {
  ctx.fillStyle = '#efe8d6'; ctx.fillRect(x, y, 128, 150);
  ctx.strokeStyle = '#333'; ctx.lineWidth = 3; ctx.fillStyle = '#d9cfba';
  const cx = x + 64, cy = y + 82;
  if (look.body === 'hivis') { ctx.fillStyle = '#e8e030'; ctx.fillRect(x + 20, y + 128, 88, 22); ctx.fillStyle = '#d9cfba'; }
  else { ctx.beginPath(); ctx.moveTo(x + 18, y + 150); ctx.quadraticCurveTo(cx, y + 116, x + 110, y + 150); ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(cx, cy, 32, 40, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // hair / hats
  const hd = look.head;
  if (hd === 'clownwig') { for (const [c, o] of [['#e23', -34], ['#fb2', -18], ['#2c4', 18], ['#36e', 34]]) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx + o, cy - 30, 16, 0, Math.PI * 2); ctx.fill(); } }
  else if (hd === 'mullet') { ctx.fillStyle = '#5a3a1a'; ctx.fillRect(cx - 30, cy - 44, 60, 14); ctx.fillRect(cx + 22, cy - 34, 14, 48); ctx.fillRect(cx - 36, cy - 34, 14, 48); }
  else if (hd === 'tophat') { ctx.fillStyle = '#222'; ctx.fillRect(cx - 40, cy - 44, 80, 8); ctx.fillRect(cx - 24, cy - 92, 48, 50); }
  else if (hd === 'cowboy') { ctx.fillStyle = '#c87a2a'; ctx.beginPath(); ctx.ellipse(cx, cy - 38, 62, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(cx - 28, cy - 76, 56, 38); }
  else { ctx.beginPath(); ctx.moveTo(cx - 32, cy - 14); ctx.quadraticCurveTo(cx - 30, cy - 50, cx, cy - 44); ctx.quadraticCurveTo(cx + 34, cy - 50, cx + 32, cy - 14); ctx.stroke(); }
  // eyes / glasses
  const ey = look.eyes;
  if (ey === 'specs') { ctx.lineWidth = 4; for (const o of [-15, 15]) { ctx.beginPath(); ctx.arc(cx + o, cy - 6, 14, 0, Math.PI * 2); ctx.stroke(); } ctx.lineWidth = 3; }
  else if (ey === 'aviators') { ctx.fillStyle = '#7a6a2a'; for (const o of [-15, 15]) { ctx.beginPath(); ctx.ellipse(cx + o, cy - 4, 12, 9, 0, 0, Math.PI * 2); ctx.fill(); } }
  else { ctx.fillStyle = '#333'; for (const o of [-12, 12]) { ctx.beginPath(); ctx.arc(cx + o, cy - 6, 3, 0, Math.PI * 2); ctx.fill(); } }
  // face furniture
  const fc = look.face;
  if (fc === 'nose') { ctx.fillStyle = '#e88a9a'; ctx.beginPath(); ctx.arc(cx, cy + 8, 10, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#222'; ctx.fillRect(cx - 26, cy - 22, 20, 5); ctx.fillRect(cx + 6, cy - 22, 20, 5); }
  else { ctx.beginPath(); ctx.moveTo(cx, cy - 2); ctx.lineTo(cx - 4, cy + 12); ctx.lineTo(cx + 3, cy + 12); ctx.stroke(); }
  if (fc === 'tache') { ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.ellipse(cx - 9, cy + 19, 11, 5, 0.3, 0, Math.PI * 2); ctx.ellipse(cx + 9, cy + 19, 11, 5, -0.3, 0, Math.PI * 2); ctx.fill(); }
  if (fc === 'beard') { ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(cx - 30, cy + 10); ctx.lineTo(cx, cy + 68); ctx.lineTo(cx + 30, cy + 10); ctx.fill(); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(cx - 10, cy + 25); ctx.lineTo(cx + 10, cy + 25); ctx.stroke(); }
  ctx.fillStyle = '#c8202a'; ctx.fillRect(x, y + 132, 128, 18);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center'; ctx.fillText('POLICE SKETCH', cx, y + 142);
}

function drawNews(s, t) {
  const ctx = nctx;
  const lvl = s.super ? -1 : s.level;
  ctx.fillStyle = lvl >= 3 ? '#2a0a0e' : '#0a1830'; ctx.fillRect(0, 0, NW, NH);
  // header
  const breaking = flashT > 0 && Math.sin(t * 10) > 0;
  ctx.fillStyle = breaking ? '#fff' : '#c8202a'; ctx.fillRect(0, 0, NW, 40);
  ctx.fillStyle = breaking ? '#c8202a' : '#fff'; ctx.font = 'bold 26px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  let head, title, sub;
  if (lvl < 0) { head = 'LIVE'; title = 'THE PARAGON SAVES CITY'; sub = 'AGAIN. PROBABLY. NOBODY DARES SAY NO.'; }
  else if (lvl === 0) [head, title, sub] = s.festival ? ['WHAT\'S ON', s.festival, 'IN ' + s.festivalCity + ' TODAY'] : FILLER[fillerI];
  else [head, title, sub] = HEADLINES[lvl];
  ctx.fillText('CHANNEL 9 · ' + head, 14, 21);
  if (Math.sin(t * 4) > 0) { ctx.fillStyle = breaking ? '#c8202a' : '#fff'; ctx.beginPath(); ctx.arc(NW - 70, 20, 7, 0, Math.PI * 2); ctx.fill(); }
  ctx.font = 'bold 20px Arial'; ctx.textAlign = 'right'; ctx.fillText(s.clock, NW - 10, 21);
  // body
  const showFace = lvl >= 1;
  const tx = showFace ? 158 : 20;
  if (showFace) drawSketch(ctx, 16, 52, s.look);
  ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = 'bold 30px Arial Black, Arial';
  ctx.fillText(title, tx, 76, NW - tx - 12);
  ctx.fillStyle = '#9ad0ff'; ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText(sub, tx, 108, NW - tx - 12);
  if (showFace) {
    ctx.fillStyle = '#ffcf7a'; ctx.font = 'bold 22px Arial';
    ctx.fillText('★'.repeat(lvl) + '☆'.repeat(5 - lvl), tx, 142);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px Arial';
    ctx.fillText('LAST SEEN: ' + s.lastSeen, tx, 172, NW - tx - 12);
    ctx.fillText(s.kills ? `${s.kills} PEOPLE "DEALT WITH" SO FAR` : 'DAY ' + s.day + ' OF THE MANHUNT', tx, 198, NW - tx - 12);
  } else {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Arial';
    ctx.fillText('WEATHER: ' + s.weather, tx, 160);
    ctx.fillText('DAY ' + s.day + '  ·  ' + s.city, tx, 190);
  }
  // crawl
  ctx.fillStyle = '#f5c518'; ctx.fillRect(0, NH - 34, NW, 34);
  ctx.fillStyle = '#111'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'left';
  ctx.fillText(s.crawl, crawlX, NH - 16);
  const w = ctx.measureText(s.crawl).width;
  return w;
}

// s: { level, super, look, lastSeen, kills, day, clock, weather, city, festival, festivalCity, dark, crawl }
export function updateNews(dt, s) {
  const t = performance.now() / 1000;
  if (s.level > lastLevel) flashT = 4;
  lastLevel = s.level; flashT = Math.max(0, flashT - dt);
  fillerT -= dt; if (fillerT <= 0) { fillerT = 14; fillerI = (fillerI + 1) % FILLER.length; }
  // more screens carry the story the more wanted you are; a power cut takes the boards out
  const n = s.super ? 8 : NEWS_SCREENS[Math.min(s.level, 5)];
  NEWS_ORDER.forEach((ai, k) => { const want = k < n ? newsTex : adMaps[ai]; if (adMats[ai].map !== want) { adMats[ai].map = want; adMats[ai].needsUpdate = true; } });
  for (const m of adMats) m.color.setScalar(s.dark ? 0.08 : 1);
  newsMat.color.setScalar(s.dark ? 0.05 : 1);
  newsAcc += dt; if (newsAcc < 1 / 15) return; // 15 fps is plenty for a crawl
  crawlX -= newsAcc * 70; newsAcc = 0;
  s.crawl = s.crawl + '   ·   ' + CRAWL_BITS[Math.floor(t / 20) % CRAWL_BITS.length] + '   ·   ';
  const w = drawNews(s, t);
  if (crawlX < -w) crawlX = NW;
  newsTex.needsUpdate = true;
}
