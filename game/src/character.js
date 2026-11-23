// Character design — pixelated 3D voxel people for Solmar.
// Top-down GTA 1 style, camera slightly angled: you see the top of the
// head, the shoulders and the jacket, with blocky legs swinging under
// them as they walk. Every person is built from crisp integer pixel
// rectangles on a small grid — no smooth curves for the body — with a
// hard dark outline, a lighter top face and a darker side face on the
// head and torso, so each figure reads as a little 3D pixel block
// seen from above at a slight angle.
// Local space: the person faces -Y (up the screen) before rotation;
// `angle` rotates them to face any direction.
//
// PLAYER — "Milo" look, the one the user will play:
//   skin #f5cd9a, black spiky pixel hair, blue jacket #2f6fd0,
//   dark jeans #2e3a52, white shoes. Two dark pixel eyes and a
//   blocky pixel smile on the facing side, high contrast.
// PEDESTRIANS — same voxel body, varied shirts / hair / skin.
// POLICE — navy uniform #20242c, peaked cap with a silver badge pixel.
export const PLAYER_LOOK = { shirt: '#2f6fd0', hair: '#1a1a1a', skin: '#f5cd9a', pants: '#2e3a52', shoes: '#f5f5f5' };
export const PED_VARIANTS = [
  { name: 'Red shirt', shirt: '#e33f2f', hair: '#5a3a1a', skin: '#f5cd9a', pants: '#3a3a44', shoes: '#e8e8e8' },
  { name: 'Green shirt', shirt: '#7ec850', hair: '#c9a227', skin: '#e8b07d', pants: '#2e3a52', shoes: '#ffffff' },
  { name: 'Pink shirt', shirt: '#ff7fb0', hair: '#1a1a1a', skin: '#c98a5a', pants: '#5a3a6e', shoes: '#f5f5f5' },
];
export const POLICE_LOOK = { shirt: '#20242c', hair: '#1a1a1a', skin: '#e8b07d', pants: '#20242c', shoes: '#111111', cap: true };

// One crisp pixel block: integer coordinates only, so edges stay hard.
function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// Shade a flat colour darker by a fixed step (no gradients).
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

// A 3D voxel block in local space: front face, a lighter top face and
// a darker right side face, all hard pixel rects, with a dark outline.
function voxel(ctx, x, y, w, h, color) {
  px(ctx, x - 1, y - 1, w + 2, h + 2, '#141414'); // hard outline
  px(ctx, x, y, w, h, color);                    // front face
  px(ctx, x, y, w, 3, shade(color, 42));         // lighter top face
  px(ctx, x + w - 3, y, 3, h, shade(color, -42)); // darker side face
}

// Draw one person. phase = walk cycle 0..2PI (0 = standing), walking = bool.
export function drawPerson(ctx, x, y, angle, look, phase = 0, walking = false) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angle + Math.PI / 2); // face -Y in local space
  const swing = walking ? Math.round(Math.sin(phase) * 8) : 0;
  const swing2 = walking ? Math.round(Math.sin(phase + Math.PI) * 8) : 0;
  const bob = walking ? -Math.round(Math.abs(Math.sin(phase)) * 2) : 0;

  // Pixel-block shadow: two flat slabs under the feet.
  px(ctx, -14, 12, 28, 4, 'rgba(0,0,0,0.20)');
  px(ctx, -12, 16, 24, 3, 'rgba(0,0,0,0.14)');
  ctx.translate(0, bob);

  // Legs: chunky pixel blocks swinging forward/back along the facing axis.
  voxel(ctx, -10, swing - 6, 7, 15, look.pants);
  voxel(ctx, 3, swing2 - 6, 7, 15, look.pants);
  // Shoes: white pixel blocks at the bottom of each leg.
  px(ctx, -10, swing + 8, 7, 5, '#141414');
  px(ctx, -10, swing + 9, 7, 3, look.shoes);
  px(ctx, 3, swing2 + 8, 7, 5, '#141414');
  px(ctx, 3, swing2 + 9, 7, 3, look.shoes);

  // Arms: pixel blocks on each side, swinging opposite to the legs.
  voxel(ctx, -17, Math.round(swing2 * 0.6) - 8, 6, 15, look.shirt);
  voxel(ctx, 11, Math.round(swing * 0.6) - 8, 6, 15, look.shirt);
  // Pixel hands.
  px(ctx, -17, Math.round(swing2 * 0.6) + 7, 6, 5, look.skin);
  px(ctx, 11, Math.round(swing * 0.6) + 7, 6, 5, look.skin);

  // Torso / jacket: one wide voxel block.
  voxel(ctx, -12, -16, 24, 24, look.shirt);
  // Jacket detail: dark pixel zip down the middle, belt at the waist,
  // and a light collar notch at the top.
  px(ctx, -1, -13, 2, 19, 'rgba(0,0,0,0.35)');
  px(ctx, -12, 5, 24, 3, 'rgba(0,0,0,0.35)');
  px(ctx, -6, -16, 4, 4, '#e8e8e8');
  px(ctx, 2, -16, 4, 4, '#e8e8e8');

  // Head: a voxel block — skin front, lighter top face, darker side.
  voxel(ctx, -9, -36, 18, 16, look.skin);
  // Hair: dark cap across the rear (top) of the head, plus three
  // spiky pixel tufts sticking up at the back.
  px(ctx, -9, -36, 18, 5, look.hair);
  px(ctx, -9, -36, 4, 10, look.hair);
  px(ctx, 5, -36, 4, 10, look.hair);
  px(ctx, -8, -41, 3, 5, look.hair);
  px(ctx, -2, -43, 4, 7, look.hair);
  px(ctx, 5, -41, 3, 5, look.hair);
  // Face on the facing side: two dark pixel eyes and a blocky smile.
  px(ctx, -5, -28, 3, 4, '#1a1a1a');
  px(ctx, 2, -28, 3, 4, '#1a1a1a');
  px(ctx, -4, -22, 2, 2, '#7a4a21');
  px(ctx, -2, -21, 4, 2, '#7a4a21');
  px(ctx, 2, -22, 2, 2, '#7a4a21');
  ctx.restore();
}

// Police officer: same voxel body, navy uniform + peaked cap with badge.
export function drawPolice(ctx, x, y, angle, phase = 0, walking = false) {
  drawPerson(ctx, x, y, angle, POLICE_LOOK, phase, walking);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angle + Math.PI / 2);
  // Peaked cap: navy voxel slab over the hair, dark brim at the front.
  px(ctx, -10, -37, 20, 7, '#141414');
  px(ctx, -9, -36, 18, 5, '#20242c');
  px(ctx, -9, -36, 18, 2, '#3a4152');
  px(ctx, -11, -31, 22, 3, '#11141a');
  // Silver badge pixel on the cap front.
  px(ctx, -2, -35, 4, 4, '#d9d9d9');
  px(ctx, -1, -34, 2, 2, '#ffffff');
  ctx.restore();
}

// Top-down car. Local space faces -Y. Length ~52, width ~28.
// body colour, darker roof, windshield, headlights (front) + taillights.
export function drawCarTop(ctx, x, y, angle, color, kind = 'traffic') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(2, 3, 17, 29, 0, 0, Math.PI * 2); ctx.fill();
  // Wheels.
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-17, -20, 6, 12); ctx.fillRect(11, -20, 6, 12);
  ctx.fillRect(-17, 10, 6, 12); ctx.fillRect(11, 10, 6, 12);
  // Body.
  ctx.fillStyle = color;
  roundRect(ctx, -14, -26, 28, 52, 8); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  roundRect(ctx, -14, -26, 28, 12, 8); ctx.fill();
  // Roof.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  roundRect(ctx, -11, -8, 22, 18, 5); ctx.fill();
  // Windshield + rear window.
  ctx.fillStyle = '#9fc8e8';
  roundRect(ctx, -11, -14, 22, 6, 3); ctx.fill();
  roundRect(ctx, -11, 12, 22, 5, 3); ctx.fill();
  if (kind === 'taxi') {
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(-6, -4, 12, 6);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 5px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 1);
  }
  if (kind === 'police') {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(-14, 2, 28, 10);
    // Light bar.
    ctx.fillStyle = '#ff2e2e'; ctx.fillRect(-10, -11, 8, 4);
    ctx.fillStyle = '#2e6bff'; ctx.fillRect(2, -11, 8, 4);
  }
  // Headlights (front, -Y) and taillights.
  ctx.fillStyle = '#fff8c9';
  ctx.fillRect(-11, -27, 7, 3); ctx.fillRect(4, -27, 7, 3);
  ctx.fillStyle = '#ff2e2e';
  ctx.fillRect(-11, 24, 7, 3); ctx.fillRect(4, 24, 7, 3);
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
