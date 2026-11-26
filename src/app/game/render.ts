/* =========================
   CACCIA AL BUG — DISEGNO
   Tutto in pixel art su un canvas di 192×144, ingrandito via CSS.
   Anche le scritte usano un font bitmap 3×5 fatto a mano.
   ========================= */

import { Item, MAX_LIVES, SKILLS, State, WORLD_H, WORLD_W, multiplier } from './engine';

const C = {
  skyTop: '#0c0d20',
  skyLow: '#1d1f45',
  hill: '#141532',
  hillFar: '#191a3c',
  panel: '#191a38',
  ink: '#eceaf7',
  muted: '#aeacca',
  line: '#2d2e55',
  accent: '#8fcbff',
  amber: '#f5b841',
  bug: '#ff5a5a',
  bugDark: '#a8303c',
  heart: '#ff8fa3',
  metal: '#aeacca',
  metalDark: '#5c5b80',
};

/* -------- Font bitmap 3×5 -------- */

const GLYPHS: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001110',
  '+': '000010111010000', '-': '000000111000000', '!': '010010010000010', ':': '000010000010000',
  '.': '000000000000010', '/': '001001010100100', x: '000101010101000', ' ': '000000000000000',
};

/** Larghezza in pixel di una scritta (3 + 1 di spazio per carattere). */
export const textWidth = (text: string, scale = 1) => (text.length * 4 - 1) * scale;

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, scale = 1): void {
  ctx.fillStyle = color;
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const ch of text) {
    const g = GLYPHS[ch] ?? GLYPHS[ch.toUpperCase()] ?? GLYPHS[' '];
    for (let i = 0; i < 15; i++) {
      if (g[i] === '1') ctx.fillRect(cx + (i % 3) * scale, cy + Math.floor(i / 3) * scale, scale, scale);
    }
    cx += 4 * scale;
  }
}

function drawTextCentered(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, color: string, scale = 1): void {
  drawText(ctx, text, cx - textWidth(text, scale) / 2, y, color, scale);
}

/* -------- Sprite a stringhe -------- */

type Palette = Record<string, string>;

function drawSprite(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, palette: Palette): void {
  const ox = Math.round(x);
  const oy = Math.round(y);
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const color = palette[row[i]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(ox + i, oy + j, 1, 1);
    }
  });
}

const BUG = [
  ['..a.....a..', '...a...a...', '...rrrrr...', 'l.rrRrRrr.l', '.lrrrrrrrl.', 'l.rRrrrRr.l', '..rrrrrrr..', '...rrrrr...', '...........'],
  ['...a...a...', '...a...a...', '...rrrrr...', '.lrrRrRrrl.', 'l.rrrrrrr.l', '.lrRrrrRrl.', '..rrrrrrr..', '...rrrrr...', '...........'],
];

const COFFEE = ['..s.s....', '...s.s...', '.........', 'wwwwwww..', 'wcccccwww', 'wcccccw.w', 'wcccccwww', '.wwwww...', 'ddddddd..'];

const HEART = ['.hh.hh...', 'hHhhhhh..', 'hhhhhhh..', 'hhhhhhh..', '.hhhhh...', '..hhh....', '...h.....', '.........', '.........'];

/* -------- Scena -------- */

/** Stelle fisse dello sfondo, calcolate una volta. */
const STARS = Array.from({ length: 38 }, (_, i) => {
  const a = Math.sin(i * 127.1) * 43758.5453;
  const b = Math.sin(i * 311.7) * 12543.123;
  return { x: Math.floor((a - Math.floor(a)) * WORLD_W), y: 22 + Math.floor((b - Math.floor(b)) * 80), bright: i % 5 === 0 };
});

/** Profilo dei monti dietro la piana di Fondi (inventato, ma somigliante). */
const HILLS = Array.from({ length: WORLD_W }, (_, x) =>
  Math.round(WORLD_H - 34 - 10 * Math.sin(x / 23) - 6 * Math.sin(x / 9 + 1) - 8 * Math.exp(-(((x - 140) / 18) ** 2))),
);
const HILLS_FAR = Array.from({ length: WORLD_W }, (_, x) => Math.round(WORLD_H - 46 - 8 * Math.sin(x / 31 + 2) - 5 * Math.sin(x / 13)));

function drawBackground(ctx: CanvasRenderingContext2D, s: State): void {
  const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  g.addColorStop(0, C.skyTop);
  g.addColorStop(1, C.skyLow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  for (const [i, st] of STARS.entries()) {
    const twinkle = st.bright && Math.sin(s.time * 3 + i) > 0.6;
    ctx.fillStyle = st.bright ? (twinkle ? '#ffffff' : '#cfd6ff') : '#5d6094';
    ctx.fillRect(st.x, st.y, 1, 1);
  }

  ctx.fillStyle = C.hillFar;
  HILLS_FAR.forEach((h, x) => ctx.fillRect(x, h, 1, WORLD_H - h));
  ctx.fillStyle = C.hill;
  HILLS.forEach((h, x) => ctx.fillRect(x, h, 1, WORLD_H - h));

  // Qualche finestra accesa giù in paese.
  ctx.fillStyle = C.amber;
  for (let x = 6; x < WORLD_W; x += 17) ctx.fillRect(x, WORLD_H - 10 - ((x * 7) % 9), 1, 1);
}

function drawSkill(ctx: CanvasRenderingContext2D, it: Item): void {
  const skill = SKILLS[it.skill];
  const x = Math.round(it.x);
  const y = Math.round(it.y);
  ctx.fillStyle = skill.color;
  ctx.fillRect(x + 1, y, it.w - 2, it.h);
  ctx.fillRect(x, y + 1, it.w, it.h - 2);
  ctx.fillStyle = C.panel;
  ctx.fillRect(x + 1, y + 1, it.w - 2, it.h - 2);
  drawText(ctx, skill.code, x + 3, y + 2, skill.color);
}

function drawItem(ctx: CanvasRenderingContext2D, it: Item, time: number): void {
  switch (it.kind) {
    case 'skill':
      return drawSkill(ctx, it);
    case 'bug':
      return drawSprite(ctx, BUG[Math.floor(time * 8) % 2], it.x, it.y, { r: C.bug, R: C.bugDark, l: C.bugDark, a: C.muted });
    case 'coffee':
      return drawSprite(ctx, COFFEE, it.x, it.y + Math.sin(time * 6) * 0.6, { w: C.ink, c: '#7f5f43', s: C.muted, d: C.line });
    case 'heart':
      return drawSprite(ctx, HEART, it.x, it.y, { h: C.heart, H: '#ffffff' });
  }
}

/** Il portatile del giocatore: lo schermo mostra la serie in corso. */
function drawPlayer(ctx: CanvasRenderingContext2D, s: State): void {
  const p = s.player;
  if (s.hurt > 0 && Math.floor(s.hurt * 12) % 2 === 0) return;
  const x = Math.round(p.x);
  const y = Math.round(p.y);

  // Schermo.
  ctx.fillStyle = C.metalDark;
  ctx.fillRect(x + 3, y - 2, p.w - 6, 10);
  const glow = s.slowmo > 0 ? '#e2c49b' : multiplier(s.combo) > 1 ? C.amber : C.accent;
  ctx.fillStyle = '#0c0d20';
  ctx.fillRect(x + 4, y - 1, p.w - 8, 8);
  ctx.fillStyle = glow;
  // Righe di "codice" che scorrono.
  for (let r = 0; r < 3; r++) {
    const len = 4 + ((r * 5 + Math.floor(s.time * 4)) % 9);
    ctx.fillRect(x + 6 + (r === 1 ? 2 : 0), y + 1 + r * 2, Math.min(len, p.w - 14), 1);
  }
  // Base e tastiera.
  ctx.fillStyle = C.metal;
  ctx.fillRect(x, y + 8, p.w, 3);
  ctx.fillRect(x + 1, y + 11, p.w - 2, 1);
  ctx.fillStyle = C.metalDark;
  for (let k = 3; k < p.w - 3; k += 2) ctx.fillRect(x + k, y + 9, 1, 1);
}

function drawHud(ctx: CanvasRenderingContext2D, s: State, best: number): void {
  drawText(ctx, String(s.score).padStart(5, '0'), 3, 3, C.ink);
  if (best > 0) drawText(ctx, `TOP ${best}`, 3, 10, C.muted);

  // Vite.
  for (let i = 0; i < MAX_LIVES; i++) {
    const x = WORLD_W - 3 - (MAX_LIVES - i) * 8;
    drawSprite(ctx, HEART.slice(0, 7).map((r) => r.slice(0, 7)), x, 3, i < s.lives ? { h: C.heart, H: '#ffffff' } : { h: C.line, H: C.line });
  }

  // Lo stack: un quadratino per tecnologia, si accende quando la raccogli.
  const total = SKILLS.length * 5 - 1;
  const sx = Math.round((WORLD_W - total) / 2);
  SKILLS.forEach((sk, i) => {
    ctx.fillStyle = s.stack[i] ? sk.color : C.line;
    ctx.fillRect(sx + i * 5, 4, 4, 4);
  });
  drawTextCentered(ctx, `LV ${s.level}`, WORLD_W / 2, 11, C.muted);

  const m = multiplier(s.combo);
  if (m > 1) drawText(ctx, `x${m}`, WORLD_W - 3 - textWidth(`x${m}`), 12, C.amber);
  if (s.slowmo > 0) drawTextCentered(ctx, 'SLOW', WORLD_W / 2, 18, '#e2c49b');
}

export function render(ctx: CanvasRenderingContext2D, s: State, best: number): void {
  ctx.save();
  if (s.shake > 0) {
    const k = Math.ceil(s.shake * 2);
    ctx.translate(Math.round((Math.sin(s.time * 90) * k)), Math.round(Math.cos(s.time * 70) * k));
  }

  drawBackground(ctx, s);
  for (const it of s.items) drawItem(ctx, it, s.time);
  if (s.phase !== 'over') drawPlayer(ctx, s);

  for (const k of s.sparks) {
    ctx.fillStyle = k.color;
    ctx.fillRect(Math.round(k.x), Math.round(k.y), 1, 1);
  }
  for (const p of s.popups) {
    const color = p.ttl < 0.25 && Math.floor(p.ttl * 20) % 2 ? C.muted : p.color;
    drawTextCentered(ctx, p.text, p.x, p.y, color);
  }
  ctx.restore();

  if (s.phase !== 'ready') drawHud(ctx, s, best);

  if (s.hurt > 0.9) {
    ctx.fillStyle = 'rgba(255, 90, 90, 0.18)';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }
}
