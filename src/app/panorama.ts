/**
 * Panorama della piana di Fondi visto dalle Crocette (monti Aurunci, ~500 m),
 * disegnato pixel per pixel in stile 16 bit.
 *
 * La vista è panoramica da est (sinistra) a ovest-nordovest (destra) e ogni
 * elemento sta al suo azimut reale: i monti Aurunci, Gaeta, Sperlonga, le isole
 * pontine, Fondi con il Castello Caetani, il lago, Terracina e il Circeo,
 * poi i monti verso Monte San Biagio. I colori seguono la luce del giorno.
 */

export const PANO_W = 480;
export const PANO_H = 120;

/** Azimut del bordo sinistro e ampiezza della vista, in gradi. */
export const AZ_LEFT = 90;
export const AZ_SPAN = 210;
/** Colonne del canvas per grado (la stessa scala vale in altezza). */
export const PX_PER_DEG = PANO_W / AZ_SPAN;
/** Riga dell'orizzonte del mare. L'orizzonte vero (altezza 0°) sta poco sopra. */
export const HORIZON = 42;
export const ALT0_ROW = HORIZON - 1.5;

/** Colonna del canvas per un azimut (può uscire dai bordi). */
export const azToX = (az: number): number => {
  const d = ((((az - AZ_LEFT - AZ_SPAN / 2) % 360) + 540) % 360) - 180;
  return (d + AZ_SPAN / 2) * PX_PER_DEG;
};

const SHORE = 54;

type RGB = readonly [number, number, number];

const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Ogni colore ha una versione notturna (illuminata dalla luna) e una diurna. */
const PALETTE = {
  mountainFar: ['#1c2048', '#7c93ab'],
  mountainFarRim: ['#30366f', '#9bb0c4'],
  mountain: ['#13153a', '#5e7553'],
  mountainRim: ['#262b5e', '#7b9264'],
  islandFar: ['#2a2f68', '#9fb3c9'],
  circeo: ['#22265a', '#7f95ad'],
  circeoLow: ['#2a2f66', '#90a5bb'],
  circeoRim: ['#4a5194', '#aec0d2'],
  seaFar: ['#232a62', '#6a9bcb'],
  seaNear: ['#121636', '#3f72aa'],
  ripple: ['#2c3470', '#8dbbe2'],
  sand: ['#2a2c52', '#dccb9f'],
  dune: ['#1b1d40', '#b4a777'],
  lake: ['#1d2456', '#5d8db6'],
  lakeTop: ['#2a3268', '#8db6d6'],
  plainFar: ['#16193f', '#93a66c'],
  plainNear: ['#0f1130', '#6f8a4a'],
  field: ['#13163a', '#a9b46d'],
  grove: ['#0b0d27', '#3e6a33'],
  road: ['#1f2148', '#a39d90'],
  building: ['#232657', '#e8dfcb'],
  buildingSide: ['#1a1c46', '#c2b59b'],
  roof: ['#3a3f7c', '#b4654a'],
  stone: ['#9c7448', '#d6c49c'],
  stoneLight: ['#c69a62', '#ebdcb6'],
  stoneShade: ['#6e5236', '#a8946c'],
  hill: ['#0a0b1c', '#4b6637'],
  hillRim: ['#2c3164', '#6e8b4f'],
  hillRim2: ['#171a3c', '#5b7841'],
  tree: ['#0d0e24', '#36552a'],
  treeRim: ['#343a72', '#5d7d42'],
} as const;

type ColorName = keyof typeof PALETTE;

// Luci artificiali e riflessi: non cambiano con il giorno, ne cambia solo l'intensità.
const WARM = hex('#ffbf66');
const COOL = hex('#dfe6ff');
const STREET = hex('#ffb04a');
const MOON_GLADE = [hex('#f4efd6'), hex('#b8b69c'), hex('#6a71a6')] as const;
const SUN_GLINT = [hex('#fffbe8'), hex('#ffe3a6'), hex('#c9a26a')] as const;
const DUSK = hex('#ff9a5c');
const GREY = hex('#8a8f9c');

/** Matrice di Bayer 4×4 per il dithering delle sfumature. */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const bayer = (x: number, y: number) => (BAYER[y & 3][x & 3] + 0.5) / 16;

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Profilo per punti [x, altezza] con interpolazione lineare (0 fuori dai punti). */
function profile(points: ReadonlyArray<readonly [number, number]>, x: number): number {
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, h0] = points[i];
    const [x1, h1] = points[i + 1];
    if (x >= x0 && x <= x1) return h0 + ((h1 - h0) * (x - x0)) / (x1 - x0);
  }
  return 0;
}

/** Rumore 1D liscio (random walk smussato), utile per creste e coste. */
function smoothNoise(rand: () => number, length: number, amplitude: number): number[] {
  const raw = Array.from({ length }, () => rand() * 2 - 1);
  return raw.map((_, i) => {
    let sum = 0;
    for (let k = -3; k <= 3; k++) sum += raw[Math.min(length - 1, Math.max(0, i + k))];
    return (sum / 7) * amplitude;
  });
}

export interface PanoramaOptions {
  /** Altezza del Sole in gradi: decide giorno, crepuscolo e notte. */
  sunAlt: number;
  /** Colonna del Sole nel canvas (per il riflesso sul mare). */
  sunX: number;
  /** Altezza e colonna della Luna. */
  moonAlt: number;
  moonX: number;
  /** Frazione illuminata della Luna, da 0 a 1. */
  illumination: number;
  /** Copertura nuvolosa, da 0 a 1: spegne i colori e i riflessi. */
  overcast: number;
  /** Nebbia nella piana, da 0 a 1. */
  fog?: number;
}

/** Quanta luce c'è: 0 di notte (Sole sotto −6°), 1 di giorno (sopra +10°). */
export const daylight = (sunAlt: number) => clamp01((sunAlt + 6) / 16);

/** Quanto pesa la luce calda di alba e tramonto (massima col Sole sull'orizzonte). */
export const duskiness = (sunAlt: number) => clamp01(1 - Math.abs(sunAlt - 1) / 9);

export function drawPanorama(ctx: CanvasRenderingContext2D, opts: PanoramaOptions): void {
  const W = PANO_W;
  const H = PANO_H;
  const img = ctx.createImageData(W, H);
  const data = img.data;
  const rand = seeded(23);

  const day = daylight(opts.sunAlt);
  const dusk = duskiness(opts.sunAlt);
  const overcast = clamp01(opts.overcast);
  // Le luci si accendono al tramonto e si spengono dopo l'alba.
  const lights = clamp01((3 - opts.sunAlt) / 9);

  const C = Object.fromEntries(
    Object.entries(PALETTE).map(([name, [night, noon]]) => {
      let c = mix(hex(night), hex(noon), day);
      c = mix(c, DUSK, dusk * 0.22 * (1 - overcast));
      c = mix(c, mix(GREY, c, 0.35), overcast * 0.45 * day);
      return [name, c];
    }),
  ) as Record<ColorName, RGB>;

  /** Disegna un pixel, con fusione se alpha < 1. */
  const put = (x: number, y: number, c: RGB, a = 1) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
    const i = (y * W + x) * 4;
    const da = data[i + 3] / 255;
    const oa = a + da * (1 - a);
    for (let k = 0; k < 3; k++) {
      data[i + k] = (c[k] * a + data[i + k] * da * (1 - a)) / oa;
    }
    data[i + 3] = oa * 255;
  };

  /** Piccolo alone luminoso intorno a una luce. */
  const glow = (x: number, y: number, c: RGB, radius: number, strength: number) => {
    if (strength <= 0) return;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const d = Math.hypot(dx, dy) / (radius + 0.5);
        if (d < 1) put(x + dx, y + dy, c, (1 - d) * (1 - d) * strength);
      }
    }
  };

  /** Una luce artificiale, visibile solo quando fa buio. */
  const lamp = (x: number, y: number, c: RGB, a: number) => put(x, y, c, a * lights);

  /* --- Isole pontine sull'orizzonte (Zannone, Ponza, Palmarola, a ~70 km) --- */
  const islands: Array<ReadonlyArray<readonly [number, number]>> = [
    [[285, 0], [287, 1], [289, 1.4], [291, 0]], // Zannone
    [[292, 0], [294, 1.5], [297, 2.4], [300, 1.6], [302, 2], [305, 0]], // Ponza
    [[308, 0], [310, 1.6], [312, 2], [315, 0]], // Palmarola
  ];
  for (const island of islands) {
    for (let x = 280; x < 320; x++) {
      const h = Math.round(profile(island, x));
      for (let y = HORIZON - h; y < HORIZON; y++) put(x, y, C.islandFar);
    }
  }

  /* --- Monte Circeo, che si alza dal mare oltre Terracina --- */
  const circeoNoise = smoothNoise(rand, W, 0.8);
  const circeo: ReadonlyArray<readonly [number, number]> = [
    [334, 0], [340, 3], [345, 7], [349, 10], [352, 12], [355, 11], [358, 12], [362, 9], [366, 5], [370, 2], [374, 0],
  ];
  for (let x = 334; x < 374; x++) {
    const h = Math.max(0, Math.round(profile(circeo, x) + circeoNoise[x]));
    for (let y = HORIZON - h; y < HORIZON; y++) {
      const depth = (y - (HORIZON - h)) / Math.max(1, h);
      put(x, y, depth > 0.6 && bayer(x, y) < (depth - 0.6) * 2.5 ? C.circeoLow : C.circeo);
    }
    if (h > 1) put(x, HORIZON - h, C.circeoRim, 0.9);
  }

  /* --- Il mare, tra Gaeta e il Circeo --- */
  for (let y = HORIZON; y < SHORE; y++) {
    const t = (y - HORIZON) / (SHORE - HORIZON);
    for (let x = 140; x < 390; x++) put(x, y, bayer(x, y) < t ? C.seaNear : C.seaFar);
  }
  for (let i = 0; i < 110; i++) {
    const y = HORIZON + 1 + Math.floor(rand() * (SHORE - HORIZON - 2));
    const x = 140 + Math.floor(rand() * 250);
    const len = 2 + Math.floor(rand() * (2 + (y - HORIZON) / 3));
    for (let k = 0; k < len; k++) put(x + k, y, C.ripple, 0.6);
  }

  /** Scia di luce sul mare: stretta all'orizzonte, larga verso riva, fatta di trattini. */
  const glade = (cx: number, colors: readonly RGB[], strength: number, spread: number) => {
    if (strength <= 0.02 || cx < 140 || cx > 390) return;
    for (let y = HORIZON; y < SHORE; y++) {
      const t = (y - HORIZON) / (SHORE - HORIZON);
      const half = (1 + t * 3 + t * t * 10) * spread;
      const dashes = Math.round((2 + t * 8) * Math.min(1, strength + 0.2));
      if (t < 0.4) put(cx, y, colors[0], 0.9 * strength);
      for (let i = 0; i < dashes; i++) {
        const offset = (rand() * 2 - 1) * half * Math.sqrt(rand());
        const len = 1 + Math.floor(rand() * (1 + t * 3));
        const d = Math.abs(offset) / half;
        const c = d < 0.3 ? colors[0] : d < 0.65 ? colors[1] : colors[2];
        for (let k = 0; k < len; k++) put(cx + offset + k - len / 2, y, c, (1 - d * 0.5) * strength);
      }
    }
  };
  // Più l'astro è basso, più la scia è lunga e stretta; sparisce se è alto o coperto.
  const altFade = (alt: number) => (alt <= 0 ? 0 : clamp01(1 - alt / 55));
  glade(opts.moonX, MOON_GLADE, (0.35 + 0.65 * opts.illumination) * altFade(opts.moonAlt) * (1 - day) * (1 - overcast), 0.6 + 0.4 * opts.illumination);
  glade(opts.sunX, SUN_GLINT, altFade(opts.sunAlt + 0.5) * (1 - overcast * 0.9) * 0.9, 1.2);

  /* --- Monti Aurunci (sinistra) e monti verso Monte San Biagio (destra) --- */
  const ridgeNoise = smoothNoise(rand, W, 1.6);
  const drawRange = (points: ReadonlyArray<readonly [number, number]>, x0: number, x1: number, foot: (x: number) => number) => {
    for (let x = x0; x < x1; x++) {
      const h = profile(points, x);
      if (h <= 0) continue;
      const top = Math.round(HORIZON - h + ridgeNoise[x]);
      const base = foot(x);
      for (let y = top; y < base; y++) {
        const t = (y - top) / Math.max(1, base - top);
        put(x, y, bayer(x, y) < t * 0.8 ? C.mountain : C.mountainFar);
      }
      put(x, top, C.mountainFarRim);
    }
  };
  // A sinistra la catena scende verso il golfo di Gaeta.
  drawRange(
    [[0, 30], [14, 34], [30, 27], [48, 31], [66, 24], [84, 26], [102, 17], [120, 11], [134, 6], [146, 2], [152, 0]],
    0, 152,
    (x) => SHORE + 10 + Math.round((152 - x) * 0.25),
  );
  // Gaeta e il promontorio di Monte Orlando, appena visibili sul mare.
  for (let x = 150; x < 166; x++) {
    const h = Math.round(profile([[150, 0], [153, 2], [157, 3], [161, 2], [166, 0]], x));
    for (let y = HORIZON - h; y < HORIZON + 1; y++) put(x, y, C.mountainFar);
  }
  // A destra i monti tra Fondi e Terracina.
  drawRange(
    [[372, 0], [382, 5], [396, 9], [410, 15], [426, 20], [444, 26], [462, 31], [480, 35]],
    372, W,
    (x) => SHORE + 6 + Math.round((x - 372) * 0.3),
  );

  /* --- Costa: spiaggia, dune e i paesi sul mare --- */
  const duneNoise = smoothNoise(rand, W, 0.9);
  for (let x = 140; x < 392; x++) {
    const top = SHORE + Math.round(duneNoise[x]);
    for (let y = top; y < SHORE + 3; y++) put(x, y, y === top ? C.sand : C.dune);
  }

  /** Un piccolo paese sulla costa: case chiare di giorno, luci di notte. */
  const coastTown = (x0: number, x1: number, y: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + rand() * (x1 - x0);
      const yy = y - rand() * 2.5;
      put(x, yy, rand() > 0.4 ? C.building : C.roof, day * 0.9);
      lamp(x, yy, rand() > 0.3 ? WARM : COOL, 0.55 + rand() * 0.45);
    }
  };
  coastTown(234, 244, SHORE - 1, 22); // Sperlonga, sul suo sperone
  coastTown(328, 344, SHORE - 3, 34); // Terracina, ai piedi del Circeo
  coastTown(151, 162, HORIZON, 14); // Gaeta

  /* --- La piana di Fondi --- */
  const plainTop = SHORE + 3;
  for (let y = plainTop; y < H; y++) {
    const t = (y - plainTop) / (H - plainTop);
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 0) continue; // i monti restano davanti
      put(x, y, bayer(x, y) < t ? C.plainNear : C.plainFar);
    }
  }

  // Lago di Fondi tra la piana e il mare, e il piccolo lago di San Puoto vicino a Sperlonga.
  const lakeNoise = smoothNoise(rand, W, 0.8);
  const lakeMask = new Uint8Array(W * H);
  const lake = (x0: number, x1: number, y0: number, depth: number) => {
    const cx = (x0 + x1) / 2;
    const half = (x1 - x0) / 2;
    for (let x = x0; x < x1; x++) {
      const u = (x - cx) / half;
      const d = Math.max(0, 1 - u * u) * depth + lakeNoise[x];
      for (let y = y0; y < y0 + d; y++) {
        put(x, y, y === y0 ? C.lakeTop : C.lake);
        lakeMask[y * W + x] = 1;
      }
    }
  };
  lake(314, 358, plainTop, 5);
  lake(246, 256, plainTop, 2);

  // Appezzamenti: più alti verso chi guarda. Molti sono aranceti a filari.
  const isLake = (x: number, y: number) => lakeMask[Math.min(H - 1, y) * W + Math.min(W - 1, Math.max(0, x))] === 1;
  for (let i = 0; i < 80; i++) {
    const y = plainTop + 3 + rand() * (H - plainTop - 10);
    const t = (y - plainTop) / (H - plainTop);
    const w = 8 + rand() * (14 + t * 34);
    const h = 1 + Math.round(t * 5 + rand() * 2);
    const x = 140 + rand() * 250;
    const isGrove = rand() > 0.4;
    const step = t > 0.5 ? 3 : 2;
    for (let yy = Math.floor(y); yy < y + h; yy++) {
      for (let xx = Math.floor(x); xx < x + w; xx++) {
        if (isLake(xx, yy)) continue;
        if (isGrove) {
          if (xx % step === 0 && (yy - plainTop) % 2 === 0) put(xx, yy, C.grove);
        } else if (bayer(xx, yy) < 0.5) {
          put(xx, yy, C.field);
        }
      }
    }
  }

  // Via Appia: scende dai monti verso Itri, attraversa Fondi e va verso Terracina.
  const appia: ReadonlyArray<readonly [number, number]> = [[150, 74], [210, 82], [262, 86], [309, 88], [338, 74], [370, 62]];
  for (let x = 150; x < 370; x++) {
    const y = profile(appia, x);
    put(x, y, C.road);
    if (x % 7 === 0) {
      lamp(x, y - 1, STREET, 1);
      glow(x, y - 1, STREET, 2, 0.22 * lights);
    }
  }
  // Strada da Fondi al mare.
  for (let y = plainTop + 1; y < 86; y++) {
    const x = 300 - (86 - y) * 0.55;
    put(x, y, C.road);
    if (y % 6 === 0) lamp(x + 1, y, STREET, 0.8);
  }

  // Case sparse nella piana.
  for (let i = 0; i < 170; i++) {
    const y = plainTop + 2 + rand() * (H - plainTop - 6);
    const x = 150 + rand() * 230;
    const near = (y - plainTop) / (H - plainTop);
    const c = rand() > 0.3 ? WARM : COOL;
    put(x, y, C.building, day * 0.8);
    lamp(x, y, c, 0.45 + rand() * 0.55);
    if (rand() < 0.25 + near * 0.3) glow(x, y, c, 1 + Math.round(near * 2), 0.18 * lights);
  }

  /* --- Fondi, a circa 6 km --- */
  const townX0 = 284;
  const townX1 = 336;
  const castleX = 309;
  // Alone di luce sopra il centro, di notte.
  for (let y = 72; y < 96; y++) {
    for (let x = townX0 - 16; x < townX1 + 16; x++) {
      const dx = (x - castleX) / ((townX1 - townX0) / 2 + 16);
      const dy = (y - 86) / 14;
      const d = Math.hypot(dx, dy);
      if (d < 1 && bayer(x, y) < (1 - d) * 0.6) put(x, y, hex('#c98a3c'), 0.08 * lights);
    }
  }

  // Edifici, dal fondo verso chi guarda.
  const buildings = Array.from({ length: 64 }, () => ({
    x: townX0 + rand() * (townX1 - townX0 - 5),
    base: 82 + rand() * 12,
    w: 3 + Math.floor(rand() * 5),
    h: 2 + Math.floor(rand() * 5),
  })).sort((a, b) => a.base - b.base);

  for (const b of buildings) {
    const x0 = Math.floor(b.x);
    const yb = Math.floor(b.base);
    const scale = 0.8 + ((yb - 82) / 12) * 0.5;
    const w = Math.round(b.w * scale);
    const h = Math.round(b.h * scale);
    for (let y = yb - h; y < yb; y++) {
      for (let x = x0; x < x0 + w; x++) {
        put(x, y, y === yb - h ? C.roof : x === x0 + w - 1 ? C.buildingSide : C.building);
      }
    }
    for (let y = yb - h + 2; y < yb - 1; y += 2) {
      for (let x = x0 + 1; x < x0 + w - 1; x += 2) {
        if (rand() < 0.3) lamp(x, y, rand() > 0.2 ? WARM : COOL, 0.9);
      }
    }
  }

  /* --- Nebbia: un mare bianco che riempie la piana; resta fuori solo la cima del castello --- */
  const fog = clamp01(opts.fog ?? 0);
  if (fog > 0) {
    const fogColor = mix(hex('#3a3f66'), hex('#e4e8ee'), day);
    const fogTop = smoothNoise(rand, W, 2.2);
    const surface = 84 - fog * 8;
    for (let x = 0; x < W; x++) {
      const top = surface + fogTop[x];
      for (let y = HORIZON - 2; y < H; y++) {
        // Densa sotto la superficie, sfumata sopra; velo leggero anche sul mare.
        const t = y >= top ? Math.min(1, 0.75 + (y - top) / 10) : Math.max(0, 0.35 - (top - y) / 60);
        if (bayer(x, y) < t * fog) put(x, y, fogColor, 0.9);
      }
    }
  }

  drawCastle(put, C, castleX, 90, lights);

  // Lampioni nel centro.
  for (let i = 0; i < 36; i++) {
    const x = townX0 + rand() * (townX1 - townX0);
    const y = 84 + rand() * 10;
    lamp(x, y, STREET, 1);
    glow(x, y, STREET, 2, 0.2 * lights);
  }

  /* --- Primo piano: i pendii delle Crocette con gli ulivi --- */
  const hillNoise = smoothNoise(rand, W, 1.5);
  const left: ReadonlyArray<readonly [number, number]> = [[0, 44], [30, 38], [70, 28], [110, 18], [150, 9], [190, 3], [215, 0]];
  const right: ReadonlyArray<readonly [number, number]> = [[352, 0], [380, 8], [415, 18], [450, 28], [480, 36]];
  const ridge: number[] = [];
  for (let x = 0; x < W; x++) {
    const h = profile(left, x) || profile(right, x);
    const top = h > 0 ? Math.round(H - h + hillNoise[x]) : H;
    ridge.push(top);
    for (let y = top; y < H; y++) put(x, y, y === top ? C.hillRim : y === top + 1 ? C.hillRim2 : C.hill);
  }

  // Ulivi lungo il crinale: chioma tonda e irregolare, tronco sottile.
  for (let x = 6; x < W; x += 9 + Math.floor(rand() * 10)) {
    const top = ridge[x];
    if (top >= H - 2) continue;
    const r = 2 + rand() * 2.5;
    const cy = top - r - 1;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -Math.ceil(r + 1); dx <= Math.ceil(r + 1); dx++) {
        const d = Math.hypot(dx / 1.25, dy) + (rand() - 0.5) * 0.8;
        if (d > r) continue;
        const rim = dy < -r * 0.4 && dx > 0;
        put(x + dx, cy + dy, rim ? C.treeRim : C.tree);
      }
    }
    for (let y = Math.round(cy + r); y <= top; y++) put(x, y, C.tree);
  }

  ctx.putImageData(img, 0, 0);
}

/**
 * Castello Caetani: cinta quadrata con torri cilindriche agli angoli, la torre
 * quadra al centro e sopra il mastio cilindrico con il coronamento merlato
 * su beccatelli. Accanto, più basso, il Palazzo del Principe.
 * Di notte è illuminato dai fari, di giorno è pietra chiara al sole.
 */
function drawCastle(
  put: (x: number, y: number, c: RGB, a?: number) => void,
  C: Record<ColorName, RGB>,
  cx: number,
  base: number,
  lights: number,
) {
  const flood = (c: RGB, t: number) => mix(c, hex('#d9a35c'), lights * 0.45 * t);

  /** Un blocco verticale: lato in ombra a sinistra, lato chiaro a destra. */
  const block = (x0: number, x1: number, top: number, round = false) => {
    for (let y = top; y < base; y++) {
      const t = (y - top) / Math.max(1, base - top);
      for (let x = x0; x < x1; x++) {
        let c = bayer(x, y) < t * 0.7 ? C.stoneLight : C.stone;
        if (x === x0 || (round && x === x0 + 1)) c = C.stoneShade;
        if (x === x1 - 1) c = C.stoneLight;
        put(x, y, flood(c, t));
      }
    }
  };
  const merlons = (x0: number, x1: number, y: number) => {
    for (let x = x0; x < x1; x += 2) put(x, y, flood(C.stoneShade, 1));
  };

  // Palazzo del Principe, a destra del castello.
  block(cx + 9, cx + 18, base - 5);
  for (let x = cx + 9; x < cx + 18; x++) put(x, base - 6, C.roof);
  for (let x = cx + 10; x < cx + 17; x += 2) put(x, base - 3, hex('#3a2a1c'), 0.6 + 0.3 * lights);

  // Cinta muraria con le torri angolari cilindriche.
  block(cx - 10, cx + 10, base - 5);
  merlons(cx - 10, cx + 10, base - 6);
  block(cx - 12, cx - 8, base - 7, true);
  merlons(cx - 12, cx - 8, base - 8);
  block(cx + 8, cx + 12, base - 7, true);
  merlons(cx + 8, cx + 12, base - 8);

  // Torre quadra.
  block(cx - 5, cx + 5, base - 13);
  // Mastio cilindrico sopra la torre, con i beccatelli (una fila più larga) e i merli.
  block(cx - 3, cx + 4, base - 19, true);
  for (let x = cx - 4; x < cx + 5; x++) put(x, base - 19, flood(C.stoneShade, 1));
  merlons(cx - 4, cx + 5, base - 20);
  put(cx, base - 16, hex('#2a1e14'), 0.8); // feritoia
  put(cx, base - 10, hex('#2a1e14'), 0.8);

  // Di notte i fari accendono un alone caldo.
  if (lights > 0) {
    for (let dy = -14; dy <= 2; dy++) {
      for (let dx = -14; dx <= 14; dx++) {
        const d = Math.hypot(dx, dy * 1.2) / 15;
        if (d < 1) put(cx + dx, base - 8 + dy, hex('#c98a3c'), (1 - d) * (1 - d) * 0.12 * lights);
      }
    }
  }

  // Campanile poco più in là, più basso del mastio.
  block(cx + 20, cx + 23, base - 11);
  put(cx + 21, base - 12, flood(C.stoneShade, 1));
  put(cx + 21, base - 9, hex('#2a1e14'), 0.8);
}
