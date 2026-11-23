// Solmar — a top-down open-city crime game, GTA 1 style.
// Written for the make.fun gta6-01 bounty. Canvas 2D, no network, no library.
// The player is a little person with a face, arms and legs (see character.js);
// the city is a road grid of pastel rooftops, a park, a beach and a pier (see city.js).
import { drawPerson, drawPolice, drawCarTop, PLAYER_LOOK, PED_VARIANTS, POLICE_LOOK } from './character.js';
import {
  WORLD_W, WORLD_H, ROAD_XS, ROAD_YS, ROAD_W, GRID, TARGETS,
  buildings, park, beach, trees, solidAt, circleHitsSolid,
  nearestRoadX, nearestRoadY, CAR_COLORS, PED_SHIRTS, PED_HAIR, PED_SKINS, drawCity,
} from './city.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');
const VW = 1280, VH = 720;

const $ = (id) => document.getElementById(id);
const cashEl = $('cash'), scoreEl = $('score'), bestEl = $('best'),
  starsEl = $('stars'), missionEl = $('mission'), healthFill = $('healthfill'),
  toastEl = $('toast');

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || null;
const SEED = parseInt(params.get('seed') || '1', 10) || 1;

let rngState = SEED * 2654435761 >>> 0;
function rnd() { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

// ---------- audio: tiny WebAudio beeps, no files ----------
let actx = null;
function beep(freq, dur = 0.08, type = 'square', vol = 0.05) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch (e) { /* sound is optional */ }
}
const sfx = {
  steal() { beep(520, 0.09); setTimeout(() => beep(780, 0.1), 70); },
  shoot() { beep(180, 0.06, 'sawtooth', 0.04); },
  hit() { beep(140, 0.12, 'sawtooth', 0.06); },
  mission() { [660, 830, 990].forEach((f, i) => setTimeout(() => beep(f, 0.12), i * 90)); },
  horn() { beep(330, 0.18, 'square', 0.05); },
  bust() { [400, 300, 200].forEach((f, i) => setTimeout(() => beep(f, 0.15), i * 120)); },
};

// ---------- state ----------
const MISSIONS = [
  { name: 'First Wheels', text: 'Job 1: First Wheels — steal a car, drive to the docks', target: TARGETS.docks, needCar: true },
  { name: 'Beach Run', text: 'Job 2: Beach Run — deliver the package to the pier', target: TARGETS.pier, needCar: true },
  { name: 'Heat Wave', text: 'Job 3: Heat Wave — escape to the safehouse', target: TARGETS.safehouse, needCar: false },
];

let state = 'title'; // title | play | pause | over | win
let player, cars, peds, police, bullets, particles, skids, floaters;
let cash, score, health, wanted, wantedTimer, missionIdx, missionDone, best;
let cam = { x: 0, y: 0 };
let mouse = { x: VW / 2, y: VH / 2, down: false };
let toastTimer = 0;
let shotReady = false;
let shotZoom = 1; // title close-up zoom: 3 on the 'start' shot, 1 elsewhere

const keys = {};
addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
  if (e.key.toLowerCase() === 'p' && (state === 'play' || state === 'pause')) togglePause();
  if (e.key.toLowerCase() === 'e' && state === 'play') tryEnterExitCar();
  if (e.key.toLowerCase() === 'f' && state === 'play') shoot();
  if (e.key.toLowerCase() === 'h' && state === 'play') sfx.horn();
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * (VW / r.width);
  mouse.y = (e.clientY - r.top) * (VH / r.height);
});
canvas.addEventListener('mousedown', () => { if (state === 'play') shoot(); });
$('startBtn').onclick = () => { startGame(); };
$('resumeBtn').onclick = () => { togglePause(); };
$('retryBtn').onclick = () => { startGame(); };
$('againBtn').onclick = () => { startGame(); };

function togglePause() {
  if (state === 'play') { state = 'pause'; $('pause').classList.remove('hidden'); }
  else if (state === 'pause') { state = 'play'; $('pause').classList.add('hidden'); }
}

function toast(msg, ms = 2600) {
  toastEl.textContent = msg; toastEl.style.display = 'block';
  toastTimer = ms;
}

function bestScore() {
  try { return parseInt(localStorage.getItem('solmar-best') || '0', 10) || 0; } catch (e) { return 0; }
}
function saveBest() {
  try { if (score > best) localStorage.setItem('solmar-best', String(score)); } catch (e) { /* no storage */ }
}

// ---------- setup ----------
function makeCar(x, y, angle, kind) {
  return {
    x, y, angle, speed: 0, kind: kind || 'traffic',
    color: kind === 'police' ? '#20242c' : kind === 'taxi' ? '#f2c230' : pick(CAR_COLORS),
    hp: 100, ai: null, brake: false, dead: false, hitCd: 0,
  };
}

function spawnTraffic() {
  const list = [];
  for (let i = 0; i < 10; i++) {
    const vertical = rnd() < 0.5;
    const c = makeCar(
      vertical ? pick(ROAD_XS) + (rnd() < 0.5 ? -20 : 20) : 120 + rnd() * (WORLD_W - 240),
      vertical ? 120 + rnd() * (WORLD_H - 240) : pick(ROAD_YS) + (rnd() < 0.5 ? -20 : 20),
      0, rnd() < 0.18 ? 'taxi' : 'traffic',
    );
    // Vertical roads run north/south (angle +/-PI/2); horizontal roads east/west (0 or PI).
    c.angle = vertical ? (rnd() < 0.5 ? -Math.PI / 2 : Math.PI / 2) : (rnd() < 0.5 ? 0 : Math.PI);
    c.speed = 60 + rnd() * 50;
    c.ai = { nextTurn: 0 };
    list.push(c);
  }
  return list;
}

function spawnParked() {
  const spots = [
    { x: 450, y: 1050, a: Math.PI / 2 }, { x: 750, y: 450, a: 0 },
    { x: 1350, y: 750, a: Math.PI }, { x: 1650, y: 1350, a: Math.PI / 2 },
    { x: 1050, y: 1350, a: 0 }, { x: 1950, y: 1050, a: Math.PI },
  ];
  return spots.map((s) => makeCar(s.x, s.y, s.a, 'traffic'));
}

function spawnPeds() {
  const list = [];
  for (let i = 0; i < 12; i++) {
    const v = PED_VARIANTS[i % PED_VARIANTS.length];
    const look = { shirt: v.shirt, hair: v.hair, skin: v.skin, pants: v.pants, shoes: v.shoes };
    list.push({
      x: 200 + rnd() * (WORLD_W - 400), y: 200 + rnd() * (WORLD_H - 400),
      angle: rnd() * Math.PI * 2, look, phase: rnd() * Math.PI * 2,
      speed: 28 + rnd() * 22, dir: rnd() < 0.5 ? 1 : -1, axis: rnd() < 0.5 ? 'x' : 'y',
      flee: 0, walkT: 0,
    });
  }
  return list;
}

function resetWorld() {
  rngState = SEED * 2654435761 >>> 0;
  player = {
    x: 150, y: 260, angle: -Math.PI / 2, phase: 0, walking: false,
    speed: 175, inCar: null, look: PLAYER_LOOK,
  };
  cars = [...spawnParked(), ...spawnTraffic()];
  peds = spawnPeds();
  police = [];
  bullets = []; particles = []; skids = []; floaters = [];
  cash = 0; score = 0; health = 100; wanted = 0; wantedTimer = 0;
  missionIdx = 0; missionDone = false;
  best = bestScore();
  cam.x = clamp(player.x - VW / 2, 0, WORLD_W - VW);
  cam.y = clamp(player.y - VH / 2, 0, WORLD_H - VH);
}

function startGame() {
  resetWorld();
  state = 'play';
  for (const id of ['title', 'pause', 'over', 'win']) $(id).classList.add('hidden');
  missionEl.textContent = MISSIONS[0].text;
  toast('Steal a car — press E next to one', 3200);
}

function addWanted(n) {
  wanted = clamp(wanted + n, 0, 5);
  wantedTimer = 25;
  if (wanted > 0 && police.length < wanted) spawnPolice();
}

function spawnPolice() {
  const n = wanted - police.length;
  for (let i = 0; i < n; i++) {
    const c = makeCar(
      clamp(player.x + (rnd() < 0.5 ? -1 : 1) * (500 + rnd() * 300), 100, WORLD_W - 100),
      clamp(player.y + (rnd() < 0.5 ? -1 : 1) * (400 + rnd() * 200), 100, WORLD_H - 100),
      0, 'police',
    );
    c.x = nearestRoadX(c.x); c.y = nearestRoadY(c.y);
    c.speed = 150;
    police.push(c);
  }
}

function explode(x, y, big) {
  for (let i = 0; i < (big ? 26 : 12); i++) {
    const a = rnd() * Math.PI * 2, s = 60 + rnd() * 220;
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.5 + rnd() * 0.5, max: 1,
      color: pick(['#ff6b2e', '#f2c230', '#e33f2f', '#888888']),
      r: 3 + rnd() * 5,
    });
  }
  sfx.hit();
}

function floater(x, y, text, color) {
  floaters.push({ x, y, text, color: color || '#7dff7a', life: 1.4 });
}

// ---------- actions ----------
function nearestCar(maxD) {
  let bestCar = null, bd = maxD;
  for (const c of [...cars, ...police]) {
    if (c.dead) continue;
    const d = dist(player, c);
    if (d < bd) { bd = d; bestCar = c; }
  }
  return bestCar;
}

function tryEnterExitCar() {
  if (player.inCar) {
    const c = player.inCar;
    player.inCar = null;
    player.x = c.x + Math.cos(c.angle + Math.PI / 2) * 40;
    player.y = c.y + Math.sin(c.angle + Math.PI / 2) * 40;
    player.angle = c.angle;
    c.speed = 0;
    return;
  }
  const c = nearestCar(58);
  if (!c) { toast('No car close enough', 1200); return; }
  player.inCar = c;
  c.speed = 0;
  cash += 0; score += 25;
  addWanted(1);
  sfx.steal();
  toast('Car stolen! +1 wanted star', 2000);
  floater(c.x, c.y - 30, '+25', '#7dff7a');
}

function shoot() {
  if (player.inCar) return; // on foot only — GTA 1 keeps the shooting on the street
  const wx = cam.x + mouse.x, wy = cam.y + mouse.y;
  const a = Math.atan2(wy - player.y, wx - player.x);
  player.angle = a;
  bullets.push({
    x: player.x + Math.cos(a) * 22, y: player.y + Math.sin(a) * 22,
    vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, life: 0.7,
  });
  particles.push({ x: player.x + Math.cos(a) * 26, y: player.y + Math.sin(a) * 26, vx: 0, vy: 0, life: 0.08, max: 0.08, color: '#fff8c9', r: 6 });
  sfx.shoot();
  addWanted(0); // shooting in the street draws attention
  wanted = Math.max(wanted, 1); wantedTimer = 25;
  if (police.length < wanted) spawnPolice();
}

function damagePlayer(n, src) {
  if (state !== 'play') return;
  health -= n;
  sfx.hit();
  if (health <= 0) {
    health = 0;
    state = 'over';
    saveBest();
    $('overText').textContent = `Busted in Solmar. Score ${score} · Cash $${cash} · Best ${Math.max(best, score)}`;
    $('over').classList.remove('hidden');
    sfx.bust();
  }
}

function completeMission() {
  const m = MISSIONS[missionIdx];
  cash += 500; score += 500;
  floater(player.x, player.y - 40, '+$500', '#f2c230');
  sfx.mission();
  toast(`${m.name} complete! +$500`, 3000);
  missionIdx += 1;
  if (missionIdx >= MISSIONS.length) {
    missionDone = true;
    state = 'win';
    saveBest();
    $('winText').textContent = `All three jobs done. Score ${score} · Cash $${cash} · Best ${Math.max(best, score)}`;
    $('win').classList.remove('hidden');
  } else {
    missionEl.textContent = MISSIONS[missionIdx].text;
  }
}

function checkMission() {
  if (missionDone || state !== 'play') return;
  const m = MISSIONS[missionIdx];
  const t = m.target;
  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;
  if (Math.hypot(px - t.x, py - t.y) < 80) {
    if (m.needCar && !player.inCar) { toast('You need a car for this job', 1500); return; }
    completeMission();
  }
}

// ---------- update ----------
function update(dt) {
  if (state !== 'play') return;
  if (toastTimer > 0) { toastTimer -= dt * 1000; if (toastTimer <= 0) toastEl.style.display = 'none'; }

  // Wanted decay: lay low for 25s and the heat drops.
  if (wanted > 0) {
    wantedTimer -= dt;
    if (wantedTimer <= 0) { wanted -= 1; wantedTimer = 25; if (wanted === 0) police = []; }
  }

  const up = keys['w'] || keys['arrowup'], down = keys['s'] || keys['arrowdown'],
    left = keys['a'] || keys['arrowleft'], right = keys['d'] || keys['arrowright'];

  if (player.inCar) {
    const c = player.inCar;
    const steer = (left ? -1 : 0) + (right ? 1 : 0);
    const gas = (up ? 1 : 0) + (down ? -0.6 : 0);
    const dir = c.speed >= 0 ? 1 : -1;
    c.angle += steer * 2.4 * dt * clamp(Math.abs(c.speed) / 120, 0, 1) * dir;
    c.speed += gas * 260 * dt;
    c.speed -= c.speed * 0.9 * dt; // drag
    c.speed = clamp(c.speed, -120, 340);
    if (Math.abs(steer) > 0 && Math.abs(c.speed) > 180) {
      skids.push({ x: c.x, y: c.y, a: c.angle, life: 1.2 });
    }
    // The car faces (cos angle, sin angle) in world space (drawCarTop
    // rotates local -Y by angle + PI/2), so forward is that vector.
    const fx = Math.cos(c.angle), fy = Math.sin(c.angle);
    const tx = c.x + fx * c.speed * dt, ty = c.y + fy * c.speed * dt;
    if (!circleHitsSolid(tx, ty, 20)) { c.x = tx; c.y = ty; }
    else { c.hp -= 12; c.speed *= -0.3; if (c.hp <= 0) wreckCar(c); }
    c.x = clamp(c.x, 30, WORLD_W - 30); c.y = clamp(c.y, 30, WORLD_H - 30);
    player.x = c.x; player.y = c.y; player.angle = c.angle;
    // Car-car bumps.
    for (const o of [...cars, ...police]) {
      if (o === c || o.dead) continue;
      if (dist(c, o) < 46) {
        o.hp -= 6; c.hp -= 4; c.speed *= 0.6;
        const push = Math.atan2(o.y - c.y, o.x - c.x);
        o.x += Math.cos(push) * 6; o.y += Math.sin(push) * 6;
        if (o.hp <= 0) wreckCar(o);
        if (c.hp <= 0) wreckCar(c);
      }
    }
  } else {
    let mx = (right ? 1 : 0) - (left ? 1 : 0);
    let my = (down ? 1 : 0) - (up ? 1 : 0);
    player.walking = mx !== 0 || my !== 0;
    if (player.walking) {
      const len = Math.hypot(mx, my) || 1;
      mx /= len; my /= len;
      player.angle = Math.atan2(my, mx);
      player.phase += dt * 9;
      const nx = player.x + mx * player.speed * dt;
      const ny = player.y + my * player.speed * dt;
      if (!circleHitsSolid(nx, player.y, 12)) player.x = nx;
      if (!circleHitsSolid(player.x, ny, 12)) player.y = ny;
      player.x = clamp(player.x, 20, WORLD_W - 20);
      player.y = clamp(player.y, 20, WORLD_H - 20);
    } else { player.phase = 0; }
  }

  updateTraffic(dt);
  updatePeds(dt);
  updatePolice(dt);
  updateBullets(dt);
  updateParticles(dt);
  checkMission();
  updateHud();
  updateCamera(dt);
}

function wreckCar(c) {
  if (c.dead) return;
  c.dead = true;
  explode(c.x, c.y, true);
  if (player.inCar === c) {
    player.inCar = null;
    player.x = c.x + 40; player.y = c.y + 40;
    damagePlayer(20, 'wreck');
  }
  score += 10;
}

function updateTraffic(dt) {
  for (const c of cars) {
    if (c.dead || c === player.inCar || !c.ai) continue; // parked cars have no AI — they sit until stolen
    // Drive along the grid: pick an axis, keep to the road, turn at junctions.
    c.ai.nextTurn -= dt;
    const onX = Math.abs(c.y - nearestRoadY(c.y)) < 8;
    const onY = Math.abs(c.x - nearestRoadX(c.x)) < 8;
    if (c.ai.nextTurn <= 0 && onX && onY) {
      const dirs = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      c.angle = pick(dirs);
      c.ai.nextTurn = 2 + rnd() * 4;
    }
    // Ease toward the road centre on the cross axis: moving east/west
    // (angle ~0 or PI) snap y to the road; moving north/south snap x.
    if (Math.abs(Math.sin(c.angle)) < 0.3) c.y += (nearestRoadY(c.y) - c.y) * dt * 1.5;
    if (Math.abs(Math.cos(c.angle)) < 0.3) c.x += (nearestRoadX(c.x) - c.x) * dt * 1.5;
    const fx = Math.cos(c.angle), fy = Math.sin(c.angle);
    const tx = c.x + fx * c.speed * dt, ty = c.y + fy * c.speed * dt;
    if (!circleHitsSolid(tx, ty, 20)) { c.x = tx; c.y = ty; }
    else { c.angle += Math.PI / 2; c.speed = 60; }
    c.x = clamp(c.x, 30, WORLD_W - 30); c.y = clamp(c.y, 30, WORLD_H - 30);
    // Slow down for the car ahead.
    for (const o of [...cars, ...police]) {
      if (o === c || o.dead) continue;
      if (dist(c, o) < 60 && Math.abs(angDiff(Math.atan2(o.y - c.y, o.x - c.x), c.angle)) < 0.6) c.speed = Math.max(20, c.speed - 80 * dt);
    }
  }
  cars = cars.filter((c) => !c.dead || c === player.inCar);
}

function updatePeds(dt) {
  for (const p of peds) {
    p.walkT -= dt;
    if (p.flee > 0) {
      p.flee -= dt;
      const a = Math.atan2(p.y - player.y, p.x - player.x);
      p.x += Math.cos(a) * 90 * dt; p.y += Math.sin(a) * 90 * dt;
      p.angle = a; p.phase += dt * 10;
      continue;
    }
    if (p.walkT <= 0) {
      p.axis = rnd() < 0.5 ? 'x' : 'y';
      p.dir = rnd() < 0.5 ? 1 : -1;
      p.walkT = 2 + rnd() * 4;
    }
    const sp = p.speed * dt;
    if (p.axis === 'x') {
      const nx = p.x + p.dir * sp;
      if (!circleHitsSolid(nx, p.y, 10)) { p.x = nx; p.angle = p.dir > 0 ? 0 : Math.PI; p.phase += dt * 6; }
      else p.dir *= -1;
    } else {
      const ny = p.y + p.dir * sp;
      if (!circleHitsSolid(p.x, ny, 10)) { p.y = ny; p.angle = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2; p.phase += dt * 6; }
      else p.dir *= -1;
    }
    p.x = clamp(p.x, 20, WORLD_W - 20); p.y = clamp(p.y, 20, WORLD_H - 20);
  }
}

function updatePolice(dt) {
  for (const c of police) {
    if (c.dead) continue;
    c.hitCd -= dt;
    const target = player.inCar || player;
    const want = Math.atan2(target.y - c.y, target.x - c.x);
    c.angle += clamp(angDiff(want, c.angle), -2.6 * dt, 2.6 * dt);
    c.speed = clamp(c.speed + 120 * dt, 0, 300);
    const fx = Math.cos(c.angle), fy = Math.sin(c.angle);
    const tx = c.x + fx * c.speed * dt, ty = c.y + fy * c.speed * dt;
    if (!circleHitsSolid(tx, ty, 20)) { c.x = tx; c.y = ty; }
    else { c.angle += Math.PI / 3; }
    // Ram the player.
    if (dist(c, target) < 48 && c.hitCd <= 0) {
      c.hitCd = 1.2;
      c.speed *= -0.4;
      if (player.inCar) { player.inCar.hp -= 10; if (player.inCar.hp <= 0) wreckCar(player.inCar); }
      else damagePlayer(12, 'police');
      floater(player.x, player.y - 30, '-12 HP', '#ff5a5a');
    }
  }
  police = police.filter((c) => !c.dead);
}

function updateBullets(dt) {
  for (const b of bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (solidAt(b.x, b.y)) { b.life = 0; particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.15, max: 0.15, color: '#f2c230', r: 4 }); continue; }
    for (const c of [...cars, ...police]) {
      if (c.dead || c === player.inCar) continue;
      if (dist(b, c) < 26) {
        b.life = 0; c.hp -= 34; score += 10;
        if (c.hp <= 0) wreckCar(c);
        else addWanted(0), wanted = Math.max(wanted, 1), wantedTimer = 25;
        break;
      }
    }
    for (const p of peds) {
      if (dist(b, p) < 16) { b.life = 0; p.flee = 3; score += 5; break; }
    }
  }
  bullets = bullets.filter((b) => b.life > 0);
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt;
    p.vx = (p.vx || 0) * 0.92; p.vy = (p.vy || 0) * 0.92;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
  for (const f of floaters) { f.y -= 30 * dt; f.life -= dt; }
  floaters = floaters.filter((f) => f.life > 0);
  for (const s of skids) s.life -= dt;
  skids = skids.filter((s) => s.life > 0);
}

function updateCamera(dt) {
  const tx = clamp(player.x - VW / 2, 0, WORLD_W - VW);
  const ty = clamp(player.y - VH / 2, 0, WORLD_H - VH);
  cam.x += (tx - cam.x) * Math.min(1, dt * 5);
  cam.y += (ty - cam.y) * Math.min(1, dt * 5);
}

function updateHud() {
  cashEl.textContent = '$' + cash;
  scoreEl.textContent = score;
  bestEl.textContent = Math.max(best, score);
  healthFill.style.width = health + '%';
  healthFill.style.background = health > 50 ? '#39d353' : health > 25 ? '#f2c230' : '#e33f2f';
  let stars = '';
  for (let i = 0; i < 5; i++) stars += `<span class="${i < wanted ? '' : 'off'}">★</span>`;
  starsEl.innerHTML = stars;
}

// ---------- render ----------
function drawBeacon(t, pulse) {
  const r = 26 + Math.sin(pulse * 4) * 6;
  ctx.strokeStyle = '#f2c230'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(242,194,48,0.25)';
  ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(t.label, t.x, t.y + 44);
}

function render(time) {
  ctx.clearRect(0, 0, VW, VH);
  ctx.save();
  // Title close-up: when shotZoom is 3, zoom onto the player so the new
  // pixel character fills a large part of the frame (face and jacket
  // clearly visible); the DOM title screen still shows on top. The
  // player is dropped low (about 90% down the screen) so the whole
  // upright figure fits in the clear band below the title text,
  // instead of dead centre where the title words would sit on the face.
  const zoom = shotZoom;
  let view = { x: cam.x, y: cam.y, w: VW, h: VH };
  if (zoom !== 1) {
    ctx.translate(VW / 2, VH * 0.90);
    ctx.scale(zoom, zoom);
    ctx.translate(-player.x, -player.y);
    view = { x: player.x - VW / (2 * zoom), y: player.y - VH / (2 * zoom), w: VW / zoom, h: VH / zoom };
  } else {
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
  }
  drawCity(ctx, view);

  // Skid marks.
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (const s of skids) {
    ctx.globalAlpha = clamp(s.life, 0, 1) * 0.7;
    ctx.beginPath();
    ctx.moveTo(s.x - Math.cos(s.a) * 12, s.y - Math.sin(s.a) * 12);
    ctx.lineTo(s.x + Math.cos(s.a) * 12, s.y + Math.sin(s.a) * 12);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Mission beacon.
  if (!missionDone && state !== 'title') drawBeacon(MISSIONS[missionIdx].target, time / 1000);

  // Pedestrians.
  for (const p of peds) drawPerson(ctx, p.x, p.y, p.angle, p.look, p.phase, true);

  // Cars: traffic, then police, then the player's car on top.
  for (const c of cars) if (!c.dead) drawCarTop(ctx, c.x, c.y, c.angle, c.color, c.kind);
  for (const c of police) if (!c.dead) drawCarTop(ctx, c.x, c.y, c.angle, c.color, 'police');
  if (player.inCar) {
    // The player's car is drawn in the traffic list; add a small marker above it.
    ctx.fillStyle = '#7dff7a';
    ctx.beginPath(); ctx.arc(player.x, player.y - 34, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke();
  } else {
    drawPerson(ctx, player.x, player.y, player.angle, player.look, player.phase, player.walking);
  }

  // Bullets.
  ctx.fillStyle = '#fff8c9';
  for (const b of bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill(); }

  // Particles.
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / (p.max || 1), 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Floating score text.
  ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.life, 0, 1);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawMinimap();
}

function drawMinimap() {
  const sx = mini.width / WORLD_W, sy = mini.height / WORLD_H;
  mctx.fillStyle = '#1d5c2e'; mctx.fillRect(0, 0, mini.width, mini.height);
  mctx.fillStyle = '#3d3d44';
  for (const rx of ROAD_XS) mctx.fillRect(rx * sx - 3, 0, 7, mini.height);
  for (const ry of ROAD_YS) mctx.fillRect(0, ry * sy - 3, mini.width, 7);
  mctx.fillStyle = '#2f7fc9'; mctx.fillRect(0, mini.height - 4, mini.width, 4);
  if (!missionDone) {
    const t = MISSIONS[missionIdx].target;
    mctx.fillStyle = '#f2c230';
    mctx.beginPath(); mctx.arc(t.x * sx, t.y * sy, 5, 0, Math.PI * 2); mctx.fill();
  }
  mctx.fillStyle = '#ff5a5a';
  for (const c of police) { mctx.beginPath(); mctx.arc(c.x * sx, c.y * sy, 3, 0, Math.PI * 2); mctx.fill(); }
  mctx.fillStyle = '#7dff7a';
  mctx.beginPath(); mctx.arc(player.x * sx, player.y * sy, 4, 0, Math.PI * 2); mctx.fill();
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5;
  mctx.beginPath(); mctx.arc(player.x * sx, player.y * sy, 5, 0, Math.PI * 2); mctx.stroke();
}

// ---------- staging for screenshots ----------
function stageShot(kind) {
  resetWorld();
  shotZoom = kind === 'start' ? 3 : 1;
  state = 'play';
  for (const id of ['title', 'pause', 'over', 'win']) $(id).classList.add('hidden');
  if (kind === 'start') {
    state = 'title';
    $('title').classList.remove('hidden');
    // Face up-screen so the close-up shows the face upright: hair on
    // top, eyes, then smile, then the blue jacket below.
    player.x = 1050; player.y = 750; player.angle = -Math.PI / 2;
    cam.x = clamp(player.x - VW / 2, 0, WORLD_W - VW);
    cam.y = clamp(player.y - VH / 2, 0, WORLD_H - VH);
  } else if (kind === 'play') {
    const c = cars[0];
    player.inCar = c; c.speed = 170; c.angle = Math.PI / 2;
    c.x = 1050; c.y = 750; player.x = c.x; player.y = c.y;
    wanted = 2; wantedTimer = 25; spawnPolice();
    // spawnPolice() drops them 500-800px away (off-frame); pull both into
    // the viewport on the player's road so the chase reads in the shot:
    // one ahead in the direction of travel, one behind.
    if (police[0]) { police[0].x = c.x; police[0].y = c.y + 220; police[0].angle = Math.PI / 2; police[0].speed = 150; }
    if (police[1]) { police[1].x = c.x; police[1].y = c.y - 220; police[1].angle = Math.PI / 2; police[1].speed = 150; }
    cash = 500; score = 525;
    missionEl.textContent = MISSIONS[0].text;
    cam.x = clamp(player.x - VW / 2, 0, WORLD_W - VW);
    cam.y = clamp(player.y - VH / 2, 0, WORLD_H - VH);
  } else if (kind === 'end') {
    state = 'win';
    cash = 1500; score = 1800;
    missionEl.textContent = 'All three jobs done — Solmar is yours';
    $('winText').textContent = `All three jobs done. Score ${score} · Cash $${cash}`;
    $('win').classList.remove('hidden');
    player.x = 150; player.y = 260;
    cam.x = 0; cam.y = 0;
  }
  updateHud();
}

// ---------- main loop ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state === 'play') update(dt);
  render(now);
  if (SHOT && !shotReady) {
    // Let one full frame paint before signalling readiness.
    shotReady = true;
    setTimeout(() => { window.__shotReady = true; }, 350);
  }
  requestAnimationFrame(loop);
}

resetWorld();
if (SHOT) stageShot(SHOT);
updateHud();
requestAnimationFrame(loop);
