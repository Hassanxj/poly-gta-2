// Solmar — the top-down city for the GTA 1 style game.
// World is 2400 x 1800. Roads form a grid every 300px; blocks hold
// buildings, a park, and the beach + sea along the south edge.
export const WORLD_W = 2400;
export const WORLD_H = 1800;
export const ROAD_W = 92;
export const GRID = 300;

// Deterministic little RNG so the city is the same every load.
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const rng = makeRng(20261123);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

export const ROAD_XS = [150, 450, 750, 1050, 1350, 1650, 1950, 2250];
export const ROAD_YS = [150, 450, 750, 1050, 1350, 1650];

// Mission targets (centres, on roads / open ground).
export const TARGETS = {
  docks: { x: 2250, y: 450, label: 'DOCKS' },
  pier: { x: 1050, y: 1650, label: 'PIER' },
  safehouse: { x: 150, y: 150, label: 'SAFEHOUSE' },
};

const ROOF_COLORS = ['#b5543f', '#c97b4a', '#8a6f9e', '#5d8a6a', '#7a7f8c', '#a85f6e', '#4f7d8c'];
const ROOF_TRIMS = ['#e8dcc3', '#d9c9a8', '#cbb98f'];

export const buildings = [];
for (const bx of ROAD_XS.slice(0, -1)) {
  for (const by of ROAD_YS.slice(0, -1)) {
    // Skip the park block and the safehouse block.
    if (bx === 750 && by === 750) continue;
    if (bx === 150 && by === 150) continue;
    const x = bx + ROAD_W / 2 + 18;
    const y = by + ROAD_W / 2 + 18;
    const w = GRID - ROAD_W - 36 - Math.floor(rng() * 30);
    const h = GRID - ROAD_W - 36 - Math.floor(rng() * 30);
    buildings.push({
      x, y, w, h,
      color: pick(ROOF_COLORS),
      trim: pick(ROOF_TRIMS),
      // rooftop details: vents / skylights / AC boxes
      vents: Array.from({ length: 2 + Math.floor(rng() * 3) }, () => ({
        dx: 14 + rng() * (w - 40), dy: 14 + rng() * (h - 40),
        s: 8 + rng() * 10,
      })),
    });
  }
}

export const park = { x: 750 + ROAD_W / 2, y: 750 + ROAD_W / 2, w: GRID - ROAD_W, h: GRID - ROAD_W };
export const beach = { y: 1650 + ROAD_W / 2, h: WORLD_H - (1650 + ROAD_W / 2) };

// Trees scattered in the park, on sidewalks and near the beach.
export const trees = [];
for (let i = 0; i < 26; i++) {
  trees.push({ x: park.x + 16 + rng() * (park.w - 32), y: park.y + 16 + rng() * (park.h - 32), r: 9 + rng() * 7 });
}
for (let i = 0; i < 18; i++) {
  trees.push({ x: 60 + rng() * (WORLD_W - 120), y: beach.y + 14 + rng() * 40, r: 8 + rng() * 6 });
}

// Collision: axis-aligned rectangles (buildings) + sea (south of beach sand).
export function solidAt(x, y) {
  if (y > WORLD_H - 26) return true; // the sea
  for (const b of buildings) {
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  }
  return false;
}
export function circleHitsSolid(x, y, r) {
  return solidAt(x - r, y) || solidAt(x + r, y) || solidAt(x, y - r) || solidAt(x, y + r) || solidAt(x, y);
}

// Snap a point to the nearest road centre (for cars / pedestrians).
export function nearestRoadX(x) {
  let best = ROAD_XS[0], bd = 1e9;
  for (const rx of ROAD_XS) { const d = Math.abs(rx - x); if (d < bd) { bd = d; best = rx; } }
  return best;
}
export function nearestRoadY(y) {
  let best = ROAD_YS[0], bd = 1e9;
  for (const ry of ROAD_YS) { const d = Math.abs(ry - y); if (d < bd) { bd = d; best = ry; } }
  return best;
}

export const CAR_COLORS = ['#e33f2f', '#2f7de3', '#f2c230', '#e8e8e8', '#7ec850', '#c05fd0', '#f28c2e'];
export const PED_SHIRTS = ['#e33f2f', '#2f7de3', '#f2c230', '#7ec850', '#c05fd0', '#f28c2e', '#e8e8e8', '#ff7fb0'];
export const PED_HAIR = ['#1a1a1a', '#5a3a1a', '#c9a227', '#7a4a21', '#888888', '#3a2a1a'];
export const PED_SKINS = ['#f5cd9a', '#e8b07d', '#c98a5a', '#f0d0b0'];

export function drawCity(ctx, cam) {
  // Ground: grass blocks.
  ctx.fillStyle = '#6fae5e';
  ctx.fillRect(cam.x, cam.y, cam.w, cam.h);
  // Beach sand, then sea.
  ctx.fillStyle = '#e8d9a0';
  ctx.fillRect(cam.x, Math.max(cam.y, beach.y), cam.w, beach.h);
  ctx.fillStyle = '#2f7fc9';
  ctx.fillRect(cam.x, Math.max(cam.y, WORLD_H - 26), cam.w, 26);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let x = 0; x < WORLD_W; x += 90) {
    ctx.fillRect(x, WORLD_H - 30, 46, 3);
  }
  // Sidewalks: light border around every block.
  ctx.fillStyle = '#c9c2b2';
  for (const bx of ROAD_XS.slice(0, -1)) {
    for (const by of ROAD_YS.slice(0, -1)) {
      ctx.fillRect(bx + ROAD_W / 2 - 8, by + ROAD_W / 2 - 8, GRID - ROAD_W + 16, GRID - ROAD_W + 16);
    }
  }
  // Roads.
  ctx.fillStyle = '#3d3d44';
  for (const rx of ROAD_XS) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD_H - 40);
  for (const ry of ROAD_YS) ctx.fillRect(0, ry - ROAD_W / 2, WORLD_W, ROAD_W);
  // Lane dashes.
  ctx.fillStyle = '#f5d76e';
  for (const rx of ROAD_XS) for (let y = 0; y < WORLD_H; y += 56) ctx.fillRect(rx - 2, y, 4, 30);
  for (const ry of ROAD_YS) for (let x = 0; x < WORLD_W; x += 56) ctx.fillRect(x, ry - 2, 30, 4);
  // Crosswalks at every junction.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const rx of ROAD_XS) for (const ry of ROAD_YS) {
    for (let i = -3; i <= 3; i++) {
      ctx.fillRect(rx - 34 + i * 10, ry - ROAD_W / 2 + 6, 6, 12);
      ctx.fillRect(rx - 34 + i * 10, ry + ROAD_W / 2 - 18, 6, 12);
    }
  }
  // Park.
  ctx.fillStyle = '#4f9e4a';
  ctx.fillRect(park.x, park.y, park.w, park.h);
  ctx.fillStyle = '#7ab5e8';
  ctx.beginPath(); ctx.ellipse(park.x + park.w / 2, park.y + park.h / 2, 34, 22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d9c9a8';
  ctx.fillRect(park.x + 10, park.y + park.h / 2 - 6, park.w - 20, 12);
  // Trees.
  for (const t of trees) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(t.x + 3, t.y + 4, t.r, t.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2f7d3a';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#57a34a';
    ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
  }
  // Buildings with rooftops.
  for (const b of buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = b.trim; ctx.lineWidth = 4;
    ctx.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, 10);
    for (const v of b.vents) {
      ctx.fillStyle = '#55555e';
      ctx.fillRect(b.x + v.dx, b.y + v.dy, v.s, v.s);
      ctx.fillStyle = '#8a8a92';
      ctx.fillRect(b.x + v.dx + 2, b.y + v.dy + 2, v.s - 4, v.s - 4);
    }
  }
  // Docks (east edge): containers + crane silhouette on the ground.
  ctx.fillStyle = '#8a6f4d';
  ctx.fillRect(2320, 380, 70, 140);
  const contCols = ['#c94f3d', '#3d7dc9', '#e8b13d'];
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = contCols[i];
    ctx.fillRect(2330, 392 + i * 42, 52, 32);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2;
    ctx.strokeRect(2330, 392 + i * 42, 52, 32);
  }
  // Pier (south): wooden walkway into the sea.
  ctx.fillStyle = '#a8825a';
  ctx.fillRect(TARGETS.pier.x - 16, 1650, 32, 150);
  ctx.fillStyle = '#8a6f4d';
  for (let y = 1660; y < 1790; y += 18) ctx.fillRect(TARGETS.pier.x - 16, y, 32, 3);
  // Bus stop + parking bays on the main east-west road (y = 1050).
  ctx.fillStyle = '#2f7de3';
  ctx.fillRect(700, 1050 - ROAD_W / 2 + 8, 34, 18);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('BUS', 717, 1050 - ROAD_W / 2 + 21);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) ctx.strokeRect(1150 + i * 44, 1050 - ROAD_W / 2 + 8, 36, 26);
  // Safehouse (north-west block): small house with a red roof.
  ctx.fillStyle = '#e8dcc3';
  ctx.fillRect(170, 170, 90, 70);
  ctx.fillStyle = '#b5543f';
  ctx.beginPath();
  ctx.moveTo(160, 172); ctx.lineTo(215, 132); ctx.lineTo(270, 172); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4a3226';
  ctx.fillRect(205, 205, 20, 35);
}
