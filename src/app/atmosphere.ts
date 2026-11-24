/**
 * Colori del cielo durante il giorno e nuvole in pixel art.
 */

import { daylight, duskiness } from './panorama';
import { Weather } from './weather';

type RGB = [number, number, number];

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t) as RGB;
const css = (c: RGB) => `rgb(${c.map((v) => Math.round(v)).join(' ')})`;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Colore in alto e all'orizzonte, per altezza del Sole (gradi). */
const SKY_STOPS: Array<[alt: number, top: string, low: string]> = [
  [-18, '#0c0d20', '#11122a'], // notte
  [-12, '#0d0f2b', '#1a1f4a'], // crepuscolo astronomico
  [-6, '#16204f', '#4a3f74'], // crepuscolo nautico
  [-2, '#24386e', '#d9785a'], // l'ora blu, arancio sull'orizzonte
  [2, '#3d64a3', '#ffad6e'], // alba o tramonto
  [8, '#4f86c9', '#f3d3a6'], // luce dorata
  [20, '#3f7fcf', '#b5d8f2'], // giorno
];

function skyColors(sunAlt: number): [RGB, RGB] {
  if (sunAlt <= SKY_STOPS[0][0]) return [hex(SKY_STOPS[0][1]), hex(SKY_STOPS[0][2])];
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    const [a0, t0, l0] = SKY_STOPS[i];
    const [a1, t1, l1] = SKY_STOPS[i + 1];
    if (sunAlt <= a1) {
      const t = (sunAlt - a0) / (a1 - a0);
      return [mix(hex(t0), hex(t1), t), mix(hex(l0), hex(l1), t)];
    }
  }
  const last = SKY_STOPS[SKY_STOPS.length - 1];
  return [hex(last[1]), hex(last[2])];
}

export interface SkyPaint {
  top: string;
  low: string;
  /** Bagliore caldo attorno al Sole quando è basso. */
  glow: string;
  glowOpacity: number;
}

export function skyPaint(sunAlt: number, weather: Weather): SkyPaint {
  let [top, low] = skyColors(sunAlt);
  const day = daylight(sunAlt);
  const grey = mix(hex('#15161f'), hex('#9aa3ad'), day);
  const cover = weather.clouds * 0.85 + (weather.rain > 0 ? 0.1 : 0);
  top = mix(top, mix(grey, hex('#7d8692'), day * 0.3), cover * 0.75);
  low = mix(low, grey, cover * 0.7);
  const dusk = duskiness(sunAlt);
  return {
    top: css(top),
    low: css(low),
    glow: css(mix(hex('#ff8a4c'), hex('#fff0c8'), day)),
    glowOpacity: Math.max(dusk * 0.7, day * 0.25) * (1 - cover * 0.8),
  };
}

/** Quanto si vedono stelle e pianeti: 0 di giorno, 1 a notte fonda e cielo sereno. */
export function starVisibility(sunAlt: number, weather: Weather): number {
  return clamp01((-sunAlt - 4) / 8) * (1 - weather.clouds * 0.92);
}

export const CLOUD_W = 480;
export const CLOUD_H = 150;

/**
 * Disegna uno strato di nuvole largo CLOUD_W (ripetibile in orizzontale),
 * colorato secondo la luce: bianche di giorno, rosate al tramonto, scure di notte.
 * Ogni nuvola è un cumulo di "bolle" con la base piatta.
 */
export function drawClouds(ctx: CanvasRenderingContext2D, sunAlt: number, weather: Weather): void {
  const W = CLOUD_W;
  const H = CLOUD_H;
  ctx.clearRect(0, 0, W, H);
  if (weather.clouds < 0.05) return;

  const day = daylight(sunAlt);
  const dusk = duskiness(sunAlt);
  const dark = weather.rain > 0 || weather.storm ? 0.35 : 0;
  let lit = mix(hex('#3a3f6a'), hex('#ffffff'), day);
  let shade = mix(hex('#1b1e40'), hex('#c3ccd8'), day);
  lit = mix(lit, hex('#ffc0a0'), dusk * 0.6);
  shade = mix(shade, hex('#8a6a8f'), dusk * 0.5);
  lit = mix(lit, hex('#6d7480'), dark * (day + 0.3));
  shade = mix(shade, hex('#3e434d'), dark * (day + 0.3));

  let state = 7;
  const rand = () => (state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296;

  // Campo di densità accumulato bolla per bolla (solo nel suo riquadro, ripetuto ai bordi).
  const density = new Float32Array(W * H);
  const count = Math.round(3 + weather.clouds * 28);
  for (let n = 0; n < count; n++) {
    const cx = rand() * W;
    // Le nuvole più lontane stanno più in basso, verso l'orizzonte, e sono più piccole.
    const depth = rand();
    const base = H * (0.25 + depth * 0.65);
    const size = 1.4 - depth * 0.8;
    const width = (30 + rand() * 60) * size;
    const bubbles = 4 + Math.floor(rand() * 5);
    for (let b = 0; b < bubbles; b++) {
      const u = (b + 0.5) / bubbles;
      const r = (6 + rand() * 10) * size * (1 - Math.abs(u - 0.5) * 0.9);
      const bx = cx + (u - 0.5) * width;
      const by = base - r * (0.5 + rand() * 0.5);
      for (let y = Math.max(0, Math.floor(by - r)); y < Math.min(base, by + r); y++) {
        for (let x = Math.floor(bx - r * 1.2); x < bx + r * 1.2; x++) {
          const d = Math.hypot((x - bx) / 1.2, y - by) / r;
          if (d >= 1) continue;
          const xx = ((x % W) + W) % W;
          density[y * W + xx] += (1 - d * d) * 1.2;
        }
      }
    }
  }

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  const img = ctx.createImageData(W, H);
  const data = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = density[y * W + x];
      if (v < 0.2 || bayer(x, y) > (v - 0.2) * 3) continue;
      // Chiare in alto, dove arriva la luce; più scure dove sopra c'è altra nuvola.
      const above = y > 2 ? density[(y - 3) * W + x] : 0;
      const c = mix(lit, shade, Math.min(1, above * 0.55));
      const i = (y * W + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255 * Math.min(0.95, 0.6 + v * 0.3);
    }
  }
  ctx.putImageData(img, 0, 0);
}

export const RAIN_TILE = 128;

/**
 * Tre strati di gocce (lontano, medio, vicino) da ripetere come sfondo.
 * Ogni goccia ha lunghezza, luminosità e posizione diverse; più piove, più sono fitte.
 * Restituisce le immagini come data URL, dal più vicino al più lontano.
 */
export function rainLayers(intensity: number, storm: boolean): string[] {
  if (typeof document === 'undefined') return [];
  let state = 11;
  const rand = () => (state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const layers: Array<{ count: number; len: [number, number]; alpha: [number, number] }> = [
    { count: 10, len: [6, 11], alpha: [0.55, 0.85] }, // vicino
    { count: 18, len: [4, 7], alpha: [0.35, 0.6] }, // medio
    { count: 28, len: [2, 4], alpha: [0.2, 0.4] }, // lontano
  ];
  const density = 0.5 + intensity * 1.2 + (storm ? 0.4 : 0);

  return layers.map(({ count, len, alpha }) => {
    const canvas = document.createElement('canvas');
    canvas.width = RAIN_TILE;
    canvas.height = RAIN_TILE;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return '';
    for (let i = 0; i < Math.round(count * density); i++) {
      const x = Math.floor(rand() * RAIN_TILE);
      const y = Math.floor(rand() * RAIN_TILE);
      const l = Math.round(len[0] + rand() * (len[1] - len[0]));
      const a = alpha[0] + rand() * (alpha[1] - alpha[0]);
      // Goccia inclinata dal vento (1 px ogni 4 in basso), più chiara in testa.
      for (let k = 0; k < l; k++) {
        const t = k / l;
        ctx.fillStyle = `rgba(214, 226, 242, ${(a * (0.45 + t * 0.55)).toFixed(3)})`;
        ctx.fillRect((x - Math.floor(k / 4) + RAIN_TILE) % RAIN_TILE, (y + k) % RAIN_TILE, 1, 1);
      }
    }
    return canvas.toDataURL();
  });
}

/** Dimensione dei pixel del fulmine sullo schermo. */
export const BOLT_PX = 3;

/**
 * Disegna una saetta in pixel art: un canale principale a zig-zag dalla base
 * delle nuvole fino a terra, con qualche ramo più sottile.
 * Le misure sono in pixel del canvas (già divise per BOLT_PX).
 */
export function drawBolt(ctx: CanvasRenderingContext2D, x0: number, top: number, bottom: number): void {
  const core = '#f6f4ff';
  const glow = 'rgba(185, 180, 255, 0.35)';
  let seed = Math.floor(Math.random() * 1e9);
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

  const strike = (x: number, y: number, end: number, width: number, alpha: number, branches: number) => {
    while (y < end) {
      const step = 1 + Math.floor(rand() * 3);
      const dx = Math.round((rand() - 0.5) * 5);
      for (let k = 0; k < step && y < end; k++, y++) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = glow;
        ctx.fillRect(x - width, y, width * 2 + 1, 1);
        ctx.fillStyle = core;
        ctx.fillRect(x, y, width, 1);
      }
      x += dx;
      // Ogni tanto parte un ramo, più corto e più debole.
      if (branches > 0 && rand() < 0.12) {
        strike(x, y, Math.min(end, y + 6 + rand() * 14), 1, alpha * 0.6, branches - 1);
      }
    }
  };
  strike(Math.round(x0), Math.round(top), Math.round(bottom), 2, 1, 3);
  ctx.globalAlpha = 1;
}
