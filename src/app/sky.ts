/**
 * Calcoli astronomici a bassa precisione (errore di circa 1°),
 * sufficienti per disegnare il cielo di oggi:
 * - fase lunare dalla differenza tra longitudine della Luna e del Sole;
 * - distanza della Luna e posizione, distanza e luminosità dei pianeti
 *   dagli elementi orbitali approssimati JPL (validi 1800–2050);
 * - altezza e azimut di Sole, Luna, pianeti e stelle visti dalle Crocette,
 *   con alba e tramonto.
 */

import { BRIGHT_STARS } from './stars';

const DEG = Math.PI / 180;

const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

/** Porta un angolo nell'intervallo (-180, 180]. */
export const norm180 = (deg: number): number => {
  const n = norm360(deg);
  return n > 180 ? n - 360 : n;
};

/** Giorni dall'epoca J2000.0 (1 gennaio 2000, 12:00 TT). */
export function daysSinceJ2000(date: Date): number {
  return date.getTime() / 86_400_000 + 2440587.5 - 2451545.0;
}

/** Longitudine eclittica apparente del Sole, in gradi. */
export function sunLongitude(d: number): number {
  const g = (357.529 + 0.98560028 * d) * DEG;
  const q = 280.459 + 0.98564736 * d;
  return norm360(q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
}

/** Longitudine eclittica della Luna con i termini periodici principali, in gradi. */
export function moonLongitude(d: number): number {
  const L = 218.316 + 13.176396 * d; // longitudine media
  const M = (134.963 + 13.064993 * d) * DEG; // anomalia media della Luna
  const Ms = (357.529 + 0.98560028 * d) * DEG; // anomalia media del Sole
  const D = (297.85 + 12.190749 * d) * DEG; // elongazione media
  const F = (93.272 + 13.22935 * d) * DEG; // argomento di latitudine

  return norm360(
    L +
      6.289 * Math.sin(M) +
      1.274 * Math.sin(2 * D - M) +
      0.658 * Math.sin(2 * D) +
      0.214 * Math.sin(2 * M) -
      0.186 * Math.sin(Ms) -
      0.114 * Math.sin(2 * F),
  );
}

/** Latitudine eclittica della Luna (quanto sta sopra o sotto l'eclittica), in gradi. */
export function moonLatitude(d: number): number {
  const M = (134.963 + 13.064993 * d) * DEG;
  const D = (297.85 + 12.190749 * d) * DEG;
  const F = (93.272 + 13.22935 * d) * DEG;
  return 5.128 * Math.sin(F) + 0.2806 * Math.sin(M + F) + 0.2777 * Math.sin(M - F) + 0.1732 * Math.sin(2 * D - F);
}

export interface MoonPhase {
  /** Elongazione Luna–Sole: 0 = nuova, 90 = primo quarto, 180 = piena, 270 = ultimo quarto. */
  elongation: number;
  /** Frazione illuminata del disco, da 0 a 1. */
  illumination: number;
  waxing: boolean;
  name: string;
}

export function moonPhase(date: Date): MoonPhase {
  const d = daysSinceJ2000(date);
  const elongation = norm360(moonLongitude(d) - sunLongitude(d));
  const illumination = (1 - Math.cos(elongation * DEG)) / 2;
  return {
    elongation,
    illumination,
    waxing: elongation < 180,
    name: phaseName(elongation),
  };
}

function phaseName(e: number): string {
  if (e < 8 || e >= 352) return 'Luna nuova';
  if (e < 84) return 'Falce di luna crescente';
  if (e < 96) return 'Primo quarto';
  if (e < 172) return 'Luna gibbosa crescente';
  if (e < 188) return 'Luna piena';
  if (e < 264) return 'Luna gibbosa calante';
  if (e < 276) return 'Ultimo quarto';
  return 'Falce di luna calante';
}

/**
 * Distanza Terra–Luna (centro–centro) in km, con i termini principali
 * della teoria ELP semplificata di Meeus (errore di qualche centinaio di km).
 */
export function moonDistance(d: number): number {
  const Mm = (134.963 + 13.064993 * d) * DEG; // anomalia media della Luna
  const Ms = (357.529 + 0.98560028 * d) * DEG; // anomalia media del Sole
  const D = (297.85 + 12.190749 * d) * DEG; // elongazione media
  const F = (93.272 + 13.22935 * d) * DEG; // argomento di latitudine

  return (
    385000.56 -
    20905.355 * Math.cos(Mm) -
    3699.111 * Math.cos(2 * D - Mm) -
    2955.968 * Math.cos(2 * D) -
    569.925 * Math.cos(2 * Mm) +
    48.888 * Math.cos(Ms) -
    3.149 * Math.cos(2 * F) +
    246.158 * Math.cos(2 * D - 2 * Mm) -
    152.138 * Math.cos(2 * D - Ms - Mm) -
    170.733 * Math.cos(2 * D + Mm) -
    204.586 * Math.cos(2 * D - Ms) -
    129.62 * Math.cos(Ms - Mm) +
    108.743 * Math.cos(D) +
    104.755 * Math.cos(Ms + Mm)
  );
}

/** Elementi orbitali kepleriani (J2000) e variazione per secolo. */
interface Elements {
  a: [number, number];
  e: [number, number];
  I: [number, number];
  L: [number, number];
  peri: [number, number];
  node: [number, number];
}

// Standish, "Keplerian Elements for Approximate Positions of the Major Planets" (JPL).
const ELEMENTS = {
  mercury: {
    a: [0.38709927, 0.00000037],
    e: [0.20563593, 0.00001906],
    I: [7.00497902, -0.00594749],
    L: [252.2503235, 149472.67411175],
    peri: [77.45779628, 0.16047689],
    node: [48.33076593, -0.12534081],
  },
  venus: {
    a: [0.72333566, 0.0000039],
    e: [0.00677672, -0.00004107],
    I: [3.39467605, -0.0007889],
    L: [181.9790995, 58517.81538729],
    peri: [131.60246718, 0.00268329],
    node: [76.67984255, -0.27769418],
  },
  earth: {
    a: [1.00000261, 0.00000562],
    e: [0.01671123, -0.00004392],
    I: [-0.00001531, -0.01294668],
    L: [100.46457166, 35999.37244981],
    peri: [102.93768193, 0.32327364],
    node: [0, 0],
  },
  mars: {
    a: [1.52371034, 0.00001847],
    e: [0.0933941, 0.00007882],
    I: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499],
    peri: [-23.94362959, 0.44441088],
    node: [49.55953891, -0.29257343],
  },
  jupiter: {
    a: [5.202887, -0.00011607],
    e: [0.04838624, -0.00013253],
    I: [1.30439695, -0.00183714],
    L: [34.39644051, 3034.74612775],
    peri: [14.72847983, 0.21252668],
    node: [100.47390909, 0.20469106],
  },
  saturn: {
    a: [9.53667594, -0.0012506],
    e: [0.05386179, -0.00050991],
    I: [2.48599187, 0.00193609],
    L: [49.95424423, 1222.49362201],
    peri: [92.59887831, -0.41897216],
    node: [113.66242448, -0.28867794],
  },
  uranus: {
    a: [19.18916464, -0.00196176],
    e: [0.04725744, -0.00004397],
    I: [0.77263783, -0.00242939],
    L: [313.23810451, 428.48202785],
    peri: [170.9542763, 0.40805281],
    node: [74.01692503, 0.04240589],
  },
  neptune: {
    a: [30.06992276, 0.00026291],
    e: [0.00859048, 0.00005105],
    I: [1.77004347, 0.00035372],
    L: [-55.12002969, 218.45945325],
    peri: [44.96476227, -0.32241464],
    node: [131.78422574, -0.00508664],
  },
  pluto: {
    a: [39.48211675, -0.00031596],
    e: [0.2488273, 0.0000517],
    I: [17.14001206, 0.00004818],
    L: [238.92903833, 145.20780515],
    peri: [224.06891629, -0.04062942],
    node: [110.30393684, -0.01183482],
  },
} satisfies Record<string, Elements>;

export type PlanetName = 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto';

type Vec3 = [number, number, number];

/** Posizione eliocentrica eclittica (UA). */
function heliocentric(el: Elements, T: number): Vec3 {
  const at = (p: [number, number]) => p[0] + p[1] * T;
  const a = at(el.a);
  const e = at(el.e);
  const I = at(el.I) * DEG;
  const node = at(el.node) * DEG;
  const peri = at(el.peri);
  const omega = peri * DEG - node; // argomento del perielio
  const M = norm180(at(el.L) - peri) * DEG; // anomalia media

  // Equazione di Keplero con Newton.
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 8; i++) {
    E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }

  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const cw = Math.cos(omega);
  const sw = Math.sin(omega);
  const cn = Math.cos(node);
  const sn = Math.sin(node);
  const ci = Math.cos(I);
  const si = Math.sin(I);

  return [
    (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
    (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
    sw * si * xp + cw * si * yp,
  ];
}

export const AU_KM = 149_597_870.7;

/** Diametro equatoriale reale, in km. */
const DIAMETER_KM: Record<PlanetName, number> = {
  mercury: 4879,
  venus: 12104,
  mars: 6792,
  jupiter: 142984,
  saturn: 120536,
  uranus: 51118,
  neptune: 49528,
  pluto: 2377,
};

/**
 * Magnitudine apparente da distanze (UA) e angolo di fase i (gradi),
 * con le formule di Mallama e Hilton (2018) semplificate.
 * Per Saturno non si considera l'inclinazione degli anelli.
 */
function magnitude(planet: PlanetName, r: number, delta: number, i: number): number {
  const dist = 5 * Math.log10(r * delta);
  switch (planet) {
    case 'mercury':
      return (
        -0.613 + dist + 6.328e-2 * i - 1.6336e-3 * i ** 2 + 3.3644e-5 * i ** 3 -
        3.4565e-7 * i ** 4 + 1.6893e-9 * i ** 5 - 3.0334e-12 * i ** 6
      );
    case 'venus':
      return i < 163.7
        ? -4.384 + dist - 1.044e-3 * i + 3.687e-4 * i ** 2 - 2.814e-6 * i ** 3 + 8.938e-9 * i ** 4
        : 236.05828 + dist - 2.81914 * i + 8.39034e-3 * i ** 2;
    case 'mars':
      return -1.601 + dist + 2.267e-2 * i - 1.302e-4 * i ** 2;
    case 'jupiter':
      return -9.395 + dist + 3.7e-4 * i + 6.16e-4 * i ** 2;
    case 'saturn':
      return -8.88 + dist + 0.044 * i;
    case 'uranus':
      return -7.11 + dist + 6.587e-3 * i;
    case 'neptune':
      return -7.0 + dist;
    case 'pluto':
      return -1.0 + dist;
  }
}

export interface PlanetData {
  /** Longitudine eclittica geocentrica, in gradi. */
  longitude: number;
  /** Latitudine eclittica geocentrica, in gradi. */
  latitude: number;
  /** Distanza dalla Terra, in UA. */
  distanceAU: number;
  /** Distanza dal Sole, in UA. */
  sunDistanceAU: number;
  /** Elongazione dal Sole in (-180, 180]: positiva = a est, visibile la sera. */
  elongation: number;
  /** Diametro apparente, in secondi d'arco. */
  angularDiameter: number;
  magnitude: number;
  diameterKm: number;
}

export function planetData(planet: PlanetName, date: Date): PlanetData {
  const T = daysSinceJ2000(date) / 36525;
  const earth = heliocentric(ELEMENTS.earth, T);
  const body = heliocentric(ELEMENTS[planet], T);
  const geo: Vec3 = [body[0] - earth[0], body[1] - earth[1], body[2] - earth[2]];

  const r = Math.hypot(...body);
  const R = Math.hypot(...earth);
  const delta = Math.hypot(...geo);
  const cosPhase = (r * r + delta * delta - R * R) / (2 * r * delta);
  const phaseAngle = Math.acos(Math.min(1, Math.max(-1, cosPhase))) / DEG;

  const longitude = norm360(Math.atan2(geo[1], geo[0]) / DEG);
  const sun = norm360(Math.atan2(-earth[1], -earth[0]) / DEG);
  const diameterKm = DIAMETER_KM[planet];

  return {
    longitude,
    latitude: Math.asin(geo[2] / delta) / DEG,
    distanceAU: delta,
    sunDistanceAU: r,
    elongation: norm180(longitude - sun),
    angularDiameter: ((2 * Math.atan(diameterKm / 2 / (delta * AU_KM))) / DEG) * 3600,
    magnitude: magnitude(planet, r, delta, phaseAngle),
    diameterKm,
  };
}

/** Longitudine eclittica geocentrica di un pianeta, in gradi. */
export function planetLongitude(planet: PlanetName, date: Date): number {
  return planetData(planet, date).longitude;
}

/* =========================
   IL CIELO VISTO DA FONDI
   ========================= */

/** Le Crocette, sui monti Aurunci a nord-est di Fondi (circa 500 m). */
export const FONDI = { lat: 41.395, lon: 13.475 };

const OBLIQUITY = 23.4393 * DEG;

/** Coordinate eclittiche → equatoriali (ascensione retta e declinazione, in gradi). */
export function eclipticToEquatorial(lon: number, lat: number): [ra: number, dec: number] {
  const l = lon * DEG;
  const b = lat * DEG;
  const ra = Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
  const dec = Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
  return [norm360(ra / DEG), dec / DEG];
}

/** Tempo siderale locale, in gradi. */
export function localSiderealTime(date: Date, lon = FONDI.lon): number {
  return norm360(280.46061837 + 360.98564736629 * daysSinceJ2000(date) + lon);
}

export interface Horizontal {
  /** Altezza sull'orizzonte, in gradi. */
  alt: number;
  /** Azimut da nord verso est, in gradi. */
  az: number;
}

/** Coordinate equatoriali → altezza e azimut per chi guarda da Fondi. */
export function toHorizontal(ra: number, dec: number, lst: number, lat = FONDI.lat): Horizontal {
  const H = (lst - ra) * DEG;
  const d = dec * DEG;
  const p = lat * DEG;
  const alt = Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H));
  const az = Math.atan2(-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(H));
  return { alt: alt / DEG, az: norm360(az / DEG) };
}


/** Posizione del Sole vista da Fondi. */
export function sunHorizontal(date: Date): Horizontal {
  const d = daysSinceJ2000(date);
  return toHorizontal(...eclipticToEquatorial(sunLongitude(d), 0), localSiderealTime(date));
}

/**
 * Alba e tramonto del giorno (ora locale del browser), cercando quando il bordo
 * del Sole attraversa l'orizzonte (altezza −0,83° per rifrazione e raggio).
 */
export function sunTimes(date: Date): { rise: Date | null; set: Date | null } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const step = 2 * 60_000;
  let rise: Date | null = null;
  let set: Date | null = null;
  let prev = sunHorizontal(start).alt + 0.83;
  for (let t = start.getTime() + step; t <= start.getTime() + 86_400_000; t += step) {
    const alt = sunHorizontal(new Date(t)).alt + 0.83;
    const at = new Date(t - (step * alt) / (alt - prev));
    if (prev < 0 && alt >= 0) rise = at;
    if (prev >= 0 && alt < 0) set = at;
    prev = alt;
  }
  return { rise, set };
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

/** Direzione cardinale dall'azimut. */
export const compass = (az: number): string => COMPASS[Math.round(norm360(az) / 45) % 8];

export interface SkyBody extends PlanetData, Horizontal {
  name: PlanetName;
  label: string;
}

export interface SkyStar extends Horizontal {
  name: string;
  mag: number;
}

export interface MoonData extends MoonPhase, Horizontal {
  distanceKm: number;
  /** Giorni dall'ultima luna nuova. */
  ageDays: number;
  /** Diametro apparente, in primi d'arco. */
  angularDiameter: number;
  diameterKm: number;
}

export interface SunData extends Horizontal {
  rise: Date | null;
  set: Date | null;
}

export interface Sky {
  sun: SunData;
  moon: MoonData;
  planets: SkyBody[];
  stars: SkyStar[];
}

const LABELS: Record<PlanetName, string> = {
  mercury: 'Mercurio',
  venus: 'Venere',
  mars: 'Marte',
  jupiter: 'Giove',
  saturn: 'Saturno',
  uranus: 'Urano',
  neptune: 'Nettuno',
  pluto: 'Plutone',
};

const SYNODIC_MONTH = 29.530589;
const MOON_DIAMETER_KM = 3474.8;

export function skyAt(date: Date): Sky {
  const d = daysSinceJ2000(date);
  const lst = localSiderealTime(date);
  const phase = moonPhase(date);
  const distanceKm = moonDistance(d);
  const moonHz = toHorizontal(...eclipticToEquatorial(moonLongitude(d), moonLatitude(d)), lst);

  const planets = (Object.keys(LABELS) as PlanetName[]).map((name) => {
    const data = planetData(name, date);
    return { name, label: LABELS[name], ...data, ...toHorizontal(...eclipticToEquatorial(data.longitude, data.latitude), lst) };
  });

  const stars = BRIGHT_STARS.map(([name, ra, dec, mag]) => ({ name, mag, ...toHorizontal(ra * 15, dec, lst) }));

  return {
    sun: { ...sunHorizontal(date), ...sunTimes(date) },
    moon: {
      ...phase,
      ...moonHz,
      distanceKm,
      ageDays: (phase.elongation / 360) * SYNODIC_MONTH,
      angularDiameter: ((2 * Math.atan(MOON_DIAMETER_KM / 2 / distanceKm)) / DEG) * 60,
      diameterKm: MOON_DIAMETER_KM,
    },
    planets,
    stars,
  };
}
