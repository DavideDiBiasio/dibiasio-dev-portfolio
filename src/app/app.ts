import { Component, DestroyRef, ElementRef, afterNextRender, afterRenderEffect, computed, inject, signal, viewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BOLT_PX, CLOUD_H, CLOUD_W, drawBolt, drawClouds, rainLayers, skyPaint, starVisibility } from './atmosphere';
import { ALT0_ROW, PANO_H, PANO_W, PX_PER_DEG, azToX, daylight, drawPanorama } from './panorama';
import { AU_KM, FONDI, Horizontal, MoonData, MoonPhase, PlanetName, SkyBody, SunData, compass, localSiderealTime, skyAt, toHorizontal } from './sky';
import { CLEAR, Weather, fetchWeather, weatherOverride } from './weather';

/** Un pixel di una figura SVG, con il suo tono (classe CSS). */
interface Pixel {
  x: number;
  y: number;
  tone: string;
}

/** Una figura in pixel art: dimensioni della griglia e pixel colorati. */
interface Sprite {
  w: number;
  h: number;
  pixels: Pixel[];
}


type ToneFn = (dx: number, dy: number, dist: number, r: number, checker: boolean) => string;

/** Disegna una sfera: per ogni pixel dentro il cerchio, `tone` sceglie il colore. */
function sphere(size: number, tone: ToneFn): Pixel[] {
  const pixels: Pixel[] = [];
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - r;
      const dy = y + 0.5 - r;
      const dist = Math.hypot(dx, dy);
      if (dist > r) continue;
      pixels.push({ x, y, tone: tone(dx, dy, dist, r, (x + y) % 2 === 0) });
    }
  }
  return pixels;
}

/* =========================
   LUNA
   ========================= */

// Mari lunari (posizioni relative al raggio), come sulla faccia visibile.
const MARIA: Array<[x: number, y: number, r: number]> = [
  [-0.32, -0.38, 0.26], // Mare Imbrium
  [0.1, -0.42, 0.18], // Mare Serenitatis
  [0.36, -0.12, 0.17], // Mare Tranquillitatis
  [0.6, -0.34, 0.1], // Mare Crisium
  [-0.52, 0.02, 0.24], // Oceanus Procellarum
  [0.18, 0.24, 0.14], // Mare Nubium
  [0.46, 0.18, 0.11], // Mare Fecunditatis
];

const CRATERS: Array<[x: number, y: number]> = [
  [-0.08, 0.62], // Tycho
  [-0.3, -0.02], // Copernicus
  [-0.64, -0.2], // Aristarchus
];

/**
 * Luna con la fase reale. Dall'emisfero nord la parte illuminata
 * è a destra quando la luna cresce e a sinistra quando cala.
 * La parte in ombra resta appena visibile (luce cinerea).
 */
function buildMoon(size: number, phase: MoonPhase): Sprite {
  const cosE = Math.cos((phase.elongation * Math.PI) / 180);

  const pixels = sphere(size, (dx, dy, dist, r, checker) => {
    const nx = dx / r;
    const ny = dy / r;

    // Distanza dal terminatore: positiva = lato illuminato.
    const halfWidth = Math.sqrt(Math.max(0, 1 - ny * ny));
    const edge = halfWidth * cosE;
    const lit = phase.waxing ? nx - edge : -nx - edge;

    if (lit < -0.05) return 'moon-dark';
    if (lit < 0.05) return checker ? 'moon-dark' : 'moon-limb';

    for (const [cx, cy] of CRATERS) {
      const d = Math.hypot(nx - cx, ny - cy);
      if (d < 0.06) return 'moon-bright';
      if (d < 0.11) return 'moon-mare';
    }

    let inMare = false;
    let mareEdge = false;
    for (const [mx, my, mr] of MARIA) {
      const d = Math.hypot(nx - mx, ny - my) / mr;
      if (d < 0.85) inMare = true;
      else if (d < 1.05) mareEdge = true;
    }

    if (dist > r - 1) return 'moon-limb';
    if (inMare) return 'moon-mare';
    if (mareEdge) return checker ? 'moon-mare' : 'moon';
    return 'moon';
  });

  return { w: size, h: size, pixels };
}

/* =========================
   PIANETI
   ========================= */

/** Marte: piccolo, rosso ruggine, con la calotta polare. */
function buildMars(size: number): Sprite {
  const pixels = sphere(size, (dx, dy, dist, r, checker) => {
    if (dy < -r * 0.62) return 'mars-cap';
    const light = -(dx + dy) / (r * Math.SQRT2);
    if (light < -0.35 || dist > r - 0.8) return 'mars-shade';
    if (light > 0.4 && checker) return 'mars-light';
    return 'mars';
  });
  return { w: size, h: size, pixels };
}

/** Giove: bande orizzontali e la Grande Macchia Rossa. */
function buildJupiter(size: number): Sprite {
  const bands = ['jup-light', 'jup-band', 'jup-light', 'jup-pale', 'jup-band', 'jup-light', 'jup-band', 'jup-pale'];
  const pixels = sphere(size, (dx, dy, dist, r) => {
    const nx = dx / r;
    const ny = dy / r;
    if (Math.hypot((nx - 0.3) / 1.6, ny - 0.28) < 0.1) return 'jup-spot';
    if (dist > r - 0.9 && dx + dy > 0) return 'jup-shade';
    const band = Math.min(bands.length - 1, Math.floor(((ny + 1) / 2) * bands.length));
    return bands[band];
  });
  return { w: size, h: size, pixels };
}

/** Saturno: pianeta con anelli inclinati che passano davanti e dietro. */
function buildSaturn(): Sprite {
  const w = 28;
  const h = 16;
  const cx = w / 2;
  const cy = h / 2;
  const r = 5;
  const tilt = (-18 * Math.PI) / 180;
  const pixels: Pixel[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      // Coordinate ruotate per inclinare gli anelli.
      const rx = dx * Math.cos(tilt) - dy * Math.sin(tilt);
      const ry = dx * Math.sin(tilt) + dy * Math.cos(tilt);
      const ring = Math.hypot(rx / 13, ry / 3.2);
      const inRing = ring > 0.58 && ring < 1;
      const inPlanet = Math.hypot(dx, dy) <= r;
      const ringTone = ring > 0.8 ? 'sat-ring-dark' : 'sat-ring';

      if (inPlanet) {
        // L'anello passa davanti al pianeta solo nella metà inferiore.
        if (inRing && ry > 0) {
          pixels.push({ x, y, tone: ringTone });
          continue;
        }
        const light = -(dx + dy) / (r * Math.SQRT2);
        const band = Math.abs(ry) < 1 ? 'sat-band' : 'sat';
        pixels.push({ x, y, tone: light < -0.4 ? 'sat-shade' : band });
      } else if (inRing) {
        pixels.push({ x, y, tone: ringTone });
      }
    }
  }
  return { w, h, pixels };
}

/** Pianeta senza dettagli in superficie: tre toni, luce da in alto a sinistra. */
function buildGlobe(size: number, tone: string): Sprite {
  const pixels = sphere(size, (dx, dy, dist, r) => {
    const light = -(dx + dy) / (r * Math.SQRT2);
    if (light < -0.3 || dist > r - 0.7) return `${tone}-shade`;
    if (light > 0.45) return `${tone}-light`;
    return tone;
  });
  return { w: size, h: size, pixels };
}

const PLANET_SPRITES: Record<PlanetName, () => Sprite> = {
  mercury: () => buildGlobe(6, 'mer'),
  venus: () => buildGlobe(8, 'ven'),
  mars: () => buildMars(8),
  jupiter: () => buildJupiter(16),
  saturn: () => buildSaturn(),
  uranus: () => buildGlobe(6, 'ura'),
  neptune: () => buildGlobe(6, 'nep'),
  pluto: () => buildGlobe(4, 'plu'),
};

/* =========================
   SCHEDE INFORMATIVE
   ========================= */

interface Detail {
  label: string;
  value: string;
}

const fmt = (value: number, digits = 0): string =>
  new Intl.NumberFormat('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(value)
    .replace('-', '−');

function formatKm(km: number): string {
  if (km >= 1e9) return `${fmt(km / 1e9, 2)} miliardi di km`;
  if (km >= 1e6) return `${fmt(km / 1e6, 1)} milioni di km`;
  return `${fmt(km)} km`;
}

/** Dove si trova adesso, visto da Fondi. */
function position(body: Horizontal): string {
  if (body.alt < 0) return 'Sotto l’orizzonte';
  return `${fmt(body.alt)}° di altezza, a ${compass(body.az)}`;
}

function moonDetails(moon: MoonData): Detail[] {
  return [
    { label: 'Adesso', value: position(moon) },
    { label: 'Illuminata', value: `${fmt(moon.illumination * 100)}%` },
    { label: 'Età', value: `${fmt(moon.ageDays, 1)} giorni` },
    { label: 'Distanza', value: formatKm(moon.distanceKm) },
    { label: 'Diametro apparente', value: `${fmt(moon.angularDiameter, 1)}′` },
    { label: 'Diametro reale', value: formatKm(moon.diameterKm) },
  ];
}

/** Quando e come si vede il pianeta, dalla distanza dal Sole e dalla luminosità. */
function visibility(body: SkyBody): string {
  const elong = Math.abs(body.elongation);
  if (elong < 15) return 'Troppo vicino al Sole';
  if (body.magnitude > 12) return 'Solo con un grande telescopio';
  if (body.magnitude > 6.5) return 'Solo al telescopio';
  const when = elong > 150 ? 'Tutta la notte' : body.elongation > 0 ? 'La sera' : 'Al mattino';
  return body.magnitude > 5.5 ? `${when}, col binocolo` : `${when}, a occhio nudo`;
}

function planetDetails(body: SkyBody): Detail[] {
  return [
    { label: 'Adesso', value: position(body) },
    { label: 'Distanza', value: `${fmt(body.distanceAU, 2)} UA · ${formatKm(body.distanceAU * AU_KM)}` },
    { label: 'Dal Sole', value: `${fmt(body.sunDistanceAU, 2)} UA` },
    { label: 'Magnitudine', value: fmt(body.magnitude, 1) },
    { label: 'Diametro apparente', value: `${fmt(body.angularDiameter, 1)}″` },
    { label: 'Diametro reale', value: formatKm(body.diameterKm) },
    { label: 'Visibilità', value: visibility(body) },
  ];
}

/* =========================
   SOLE
   ========================= */

/** Il Sole in pixel art: disco con un bordo più caldo, arancio quando è basso. */
function buildSun(size: number): Sprite {
  const pixels = sphere(size, (dx, dy, dist, r) => (dist > r - 1.2 ? 'sun-rim' : dist > r * 0.55 ? 'sun' : 'sun-core'));
  return { w: size, h: size, pixels };
}

const timeFmt = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });

function sunDetails(sun: SunData, weather: Weather): Detail[] {
  const rows: Detail[] = [
    { label: 'Adesso', value: position(sun) },
    { label: 'Alba', value: sun.rise ? timeFmt.format(sun.rise) : '—' },
    { label: 'Tramonto', value: sun.set ? timeFmt.format(sun.set) : '—' },
    { label: 'Meteo', value: weather.label },
  ];
  if (weather.temperature !== null) rows.push({ label: 'Temperatura', value: `${fmt(weather.temperature)} °C` });
  return rows;
}

/* =========================
   POSIZIONE NEL CIELO
   ========================= */

/** Gradi dal bordo sinistro della vista e altezza: diventano left/top in CSS. */
const place = (body: Horizontal) => ({ daz: azToX(body.az) / PX_PER_DEG, alt: body.alt });

/** La scheda si apre verso destra se il corpo sta nella metà sinistra della vista. */
const opensRight = (body: Horizontal) => azToX(body.az) < PANO_W / 2;

/** Ora forzata dall'indirizzo, per provare: ?ora=06:45 (oggi) oppure ?ora=2026-12-21T16:30 */
function timeOverride(param: string | null): Date | null {
  if (!param) return null;
  const hm = /^(\d{1,2}):(\d{2})$/.exec(param);
  if (hm) {
    const d = new Date();
    d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
    return d;
  }
  const t = Date.parse(param);
  return Number.isNaN(t) ? null : new Date(t);
}

const query = () => (typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search));

/* =========================
   COMPONENTE
   ========================= */

/** Sotto questa magnitudine le stelle restano elementi a sé (più grandi, scintillano); le altre vanno sul canvas. */
const CANVAS_MAG_MIN = 1;

/** Colore di una stella dal suo indice B-V: azzurre le calde, arancioni le fredde. */
const starColor = (bv: number) =>
  bv < 0 ? '207 224 255' : bv < 0.5 ? '238 242 255' : bv < 1 ? '255 244 224' : '255 216 176';

/** Quanto la luna e il sole sono ingranditi rispetto al vero, come con un teleobiettivo. */
const TELE = 4;

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
  host: {
    '(document:click)': 'openBody.set(null)',
    '(document:keydown.escape)': 'openBody.set(null)',
  },
})
export class App {
  private readonly fixedTime = timeOverride(query().get('ora'));
  private readonly fixedWeather = weatherOverride(query().get('meteo'));

  /** L'ora attuale (aggiornata ogni minuto) e il meteo su Fondi. */
  private readonly now = signal(this.fixedTime ?? new Date());
  protected readonly weather = signal<Weather>(this.fixedWeather ?? CLEAR);

  /** Il cielo di questo momento visto dalle Crocette. */
  private readonly sky = computed(() => skyAt(this.now()));

  protected readonly sun = computed(() => this.sky().sun);
  protected readonly phase = computed(() => this.sky().moon);
  protected readonly moon = computed(() => buildMoon(16, this.phase()));
  protected readonly sunSprite = buildSun(16);

  protected readonly sunView = computed(() => {
    const sun = this.sun();
    return {
      ...place(sun),
      visible: sun.alt > -1,
      size: (0.533 * TELE),
      tipStart: opensRight(sun),
      // Più rosso e meno abbagliante vicino all'orizzonte.
      low: sun.alt < 8,
      dimmed: Math.min(0.85, this.weather().clouds * 0.9),
      details: sunDetails(sun, this.weather()),
    };
  });

  protected readonly moonView = computed(() => {
    const moon = this.phase();
    const sunAlt = this.sun().alt;
    return {
      ...place(moon),
      visible: moon.alt > -1,
      size: (moon.angularDiameter / 60) * TELE,
      tipStart: opensRight(moon),
      // Di giorno la luna è pallida e senza alone.
      daytime: sunAlt > -2,
      dimmed: Math.max(0, this.weather().clouds - 0.4) * 1.4,
      details: moonDetails(moon),
    };
  });

  /** Stelle e pianeti si vedono solo col buio e il cielo abbastanza sereno. */
  protected readonly starsVisible = computed(() => starVisibility(this.sun().alt, this.weather()));

  /**
   * Le stelle sopra l'orizzonte. Sugli schermi stretti la parte alta dell'hero va oltre
   * lo zenit: lì il cielo continua dall'altra parte, verso nord (altezza 180° − alt,
   * azimut opposto), così anche in alto ci sono le stelle vere.
   */
  protected readonly stars = computed(() =>
    this.sky()
      .stars.filter((s) => s.alt > 0.5 && (!this.catalog() || s.mag < CANVAS_MAG_MIN))
      .flatMap((s) => {
        const look = {
          size: s.mag < 1 ? 3 : 2,
          opacity: Math.min(1, Math.max(0.35, 0.95 - s.mag * 0.15)),
          twinkle: s.mag < 0.6,
        };
        return [
          { id: s.name, ...place(s), ...look },
          { id: s.name + '·nord', ...place({ alt: 180 - s.alt, az: s.az + 180 }), ...look },
        ];
      }),
  );

  protected readonly planets = computed(() =>
    this.starsVisible() < 0.1
      ? []
      : this.sky()
          .planets.filter((p) => p.alt > 0)
          .map((body) => ({
            ...body,
            ...place(body),
            sprite: PLANET_SPRITES[body.name](),
            details: planetDetails(body),
            tipStart: opensRight(body),
          })),
  );

  protected readonly paint = computed(() => skyPaint(this.sun().alt, this.weather()));
  protected readonly sunGlowX = computed(() => azToX(this.sun().az) / PANO_W);
  protected readonly day = computed(() => daylight(this.sun().alt));

  /** Scheda aperta con un tocco o un clic (su desktop basta passarci sopra). */
  protected readonly openBody = signal<string | null>(null);

  protected toggleBody(name: string, event: Event): void {
    event.stopPropagation();
    this.openBody.update((open) => (open === name ? null : name));
  }

  /**
   * Corpo celeste sotto il puntatore, anche se sopra ci sono le scritte o le colline:
   * il più vicino entro qualche pixel, purché non sia del tutto nascosto dietro i monti.
   */
  protected readonly hovered = signal<string | null>(null);
  private leaveTimer = 0;

  protected pointerNear(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return;
    // Sopra una scheda aperta la si lascia com'è, per poterla leggere.
    if ((event.target as Element | null)?.closest?.('.sky-tip')) return;
    const name = this.bodyAt(event.clientX, event.clientY);
    clearTimeout(this.leaveTimer);
    if (name) this.hovered.set(name);
    else this.leaveTimer = window.setTimeout(() => this.hovered.set(null), 180);
  }

  protected leaveSky(): void {
    clearTimeout(this.leaveTimer);
    this.hovered.set(null);
  }

  /** Con un tocco su un corpo coperto dalle scritte si apre comunque la sua scheda. */
  protected tapSky(event: MouseEvent): void {
    const target = event.target as Element | null;
    if (target?.closest?.('a, button, .sky-tip')) return;
    const name = this.bodyAt(event.clientX, event.clientY);
    if (name) this.toggleBody(name, event);
  }

  private bodyAt(x: number, y: number): string | null {
    const hero = this.heroEl()?.nativeElement;
    if (!hero) return null;
    let best: string | null = null;
    let bestDist = Infinity;
    for (const el of Array.from(hero.querySelectorAll<HTMLElement>('.sky-body[data-body]:not(.is-hidden)'))) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > Math.max(16, r.width / 2 + 10) || dist >= bestDist) continue;
      // Se anche la cima è dietro le colline, il corpo non si vede: niente scheda.
      if (this.isBehindHills(cx, r.top + 1)) continue;
      best = el.dataset['body'] ?? null;
      bestDist = dist;
    }
    return best;
  }

  /** Vero se in quel punto dello schermo il panorama non è trasparente (monti, colline). */
  private isBehindHills(x: number, y: number): boolean {
    const canvas = this.panoEl()?.nativeElement;
    const ctx = canvas?.getContext?.('2d');
    if (!canvas || !ctx) return false;
    const box = canvas.getBoundingClientRect();
    const scale = Math.max(box.width / PANO_W, box.height / PANO_H);
    const px = Math.floor((x - box.left - (box.width - PANO_W * scale) / 2) / scale);
    const py = Math.floor((y - box.top - (box.height - PANO_H * scale)) / scale);
    if (px < 0 || py < 0 || px >= PANO_W || py >= PANO_H) return false;
    return ctx.getImageData(px, py, 1, 1).data[3] > 200;
  }

  protected readonly panoW = PANO_W;
  protected readonly panoH = PANO_H;
  protected readonly cloudW = CLOUD_W;
  protected readonly cloudH = CLOUD_H;
  private readonly heroEl = viewChild<ElementRef<HTMLElement>>('heroEl');
  private readonly panoEl = viewChild<ElementRef<HTMLCanvasElement>>('panoEl');
  private readonly cloudEl = viewChild<ElementRef<HTMLElement>>('cloudEl');
  private readonly rainEl = viewChild<ElementRef<HTMLElement>>('rainEl');
  private readonly boltEl = viewChild<ElementRef<HTMLCanvasElement>>('boltEl');
  private readonly starFieldEl = viewChild<ElementRef<HTMLCanvasElement>>('starFieldEl');

  /** Catalogo d3-celestial (stelle fino alla magnitudine 5,2), caricato dopo la pagina. */
  private readonly catalog = signal<Array<[ra: number, dec: number, mag: number, bv: number]> | null>(null);
  private skyGeometry = { ox: 0, hy: 0, k: 0 };

  /** Il cielo si illumina per un attimo quando cade un fulmine. */
  protected readonly flash = signal(false);

  /** La stella cadente in corso: punto di partenza (in %), direzione e lunghezza della scia. */
  protected readonly meteor = signal<{ id: number; x: number; y: number; dx: number; dy: number; angle: number } | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Ridisegna panorama e nuvole quando cambiano l'ora o il meteo.
    afterRenderEffect(() => {
      const sky = this.sky();
      const weather = this.weather();
      this.catalog();
      this.drawPanorama(sky.sun.alt, sky.sun.az, sky.moon, weather);
      this.drawClouds(sky.sun.alt, weather);
      this.drawRain(weather);
    });

    afterNextRender(() => {
      let frame = 0;
      const relayout = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => this.layoutSky());
      };
      relayout();
      window.addEventListener('resize', relayout);

      const timers: number[] = [];
      if (!this.fixedTime) timers.push(window.setInterval(() => this.now.set(new Date()), 60_000));

      const abort = new AbortController();
      fetch('stars.json', { signal: abort.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => json?.stars && this.catalog.set(json.stars))
        .catch(() => undefined); // senza catalogo restano le stelle più luminose
      if (!this.fixedWeather) {
        const load = () =>
          fetchWeather(FONDI.lat, FONDI.lon, abort.signal)
            .then((w) => this.weather.set(w))
            .catch(() => undefined); // senza meteo il cielo resta sereno
        load();
        timers.push(window.setInterval(load, 15 * 60_000));
      }

      // Ogni 4-11 secondi: un fulmine se c'è temporale, una stella cadente se le stelle si vedono.
      // Niente di tutto questo se si preferisce meno movimento.
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      let strikeTimer = 0;
      const scheduleStrike = () => {
        strikeTimer = window.setTimeout(() => {
          if (!reduceMotion && this.weather().storm) this.strike(timers);
          else if (!reduceMotion && this.starsVisible() > 0.3) this.shootingStar(timers);
          scheduleStrike();
        }, 4000 + Math.random() * 7000);
      };
      scheduleStrike();

      destroyRef.onDestroy(() => {
        clearTimeout(strikeTimer);
        window.removeEventListener('resize', relayout);
        cancelAnimationFrame(frame);
        timers.forEach((t) => clearInterval(t));
        abort.abort();
      });
    });
  }

  /**
   * Il canvas è scalato con object-fit: cover e ancorato in basso al centro.
   * Da lì si ricavano dove cade l'orizzonte e quanti pixel vale un grado,
   * così cielo e panorama restano allineati a ogni larghezza.
   */
  private layoutSky(): void {
    const hero = this.heroEl()?.nativeElement;
    const canvas = this.panoEl()?.nativeElement;
    if (!hero || !canvas) return;
    const heroBox = hero.getBoundingClientRect();
    const box = canvas.getBoundingClientRect();
    const scale = Math.max(box.width / PANO_W, box.height / PANO_H);
    if (!scale) return;
    const offsetX = box.left - heroBox.left + (box.width - PANO_W * scale) / 2;
    const offsetY = box.top - heroBox.top + box.height - PANO_H * scale;
    hero.style.setProperty('--sky-ox', `${offsetX}px`);
    hero.style.setProperty('--sky-hy', `${offsetY + ALT0_ROW * scale}px`);
    hero.style.setProperty('--sky-k', `${scale * PX_PER_DEG}px`);
    // Le nuvole riempiono il cielo fino all'orizzonte, con pixel grandi quanto quelli del panorama.
    const cloudH = Math.max(1, offsetY + ALT0_ROW * scale);
    hero.style.setProperty('--cloud-h', `${cloudH}px`);
    hero.style.setProperty('--cloud-w', `${(cloudH * CLOUD_W) / CLOUD_H}px`);
    this.skyGeometry = { ox: offsetX, hy: offsetY + ALT0_ROW * scale, k: scale * PX_PER_DEG };
    this.drawStarField(heroBox.width, heroBox.height);
  }

  /**
   * Le stelle deboli del catalogo, disegnate su un canvas con il loro colore.
   * La luna alta e piena schiarisce il cielo e nasconde le più deboli.
   */
  private drawStarField(width: number, height: number): void {
    const canvas = this.starFieldEl()?.nativeElement;
    const ctx = canvas?.getContext?.('2d');
    const stars = this.catalog();
    if (!canvas || !ctx) return;
    canvas.width = Math.ceil(width);
    canvas.height = Math.ceil(height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!stars) return;

    const moon = this.phase();
    const limit = 5.2 - (moon.alt > 0 ? 1.3 * moon.illumination * Math.min(1, moon.alt / 20) : 0);
    const lst = localSiderealTime(this.now());
    const { ox, hy, k } = this.skyGeometry;
    const dot = (alt: number, az: number, size: number, color: string, alpha: number) => {
      const x = Math.round(ox + (azToX(az) / PX_PER_DEG) * k - size / 2);
      const y = Math.round(hy - alt * k - size / 2);
      if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) return;
      ctx.fillStyle = `rgb(${color} / ${alpha.toFixed(2)})`;
      ctx.fillRect(x, y, size, size);
    };

    for (const [ra, dec, mag, bv] of stars) {
      if (mag < CANVAS_MAG_MIN || mag > limit) continue;
      const { alt, az } = toHorizontal(ra, dec, lst);
      if (alt < 0.5) continue;
      const size = mag < 3 ? 2 : mag < 4.2 ? 1.5 : 1;
      const alpha = Math.min(0.9, Math.max(0.2, 0.95 - (mag - 1) * 0.17)) * Math.min(1, (limit - mag) / 0.6 + 0.3);
      const color = starColor(bv);
      dot(alt, az, size, color, alpha);
      // Oltre lo zenit il cielo continua verso nord, come per le stelle luminose.
      dot(180 - alt, az + 180, size, color, alpha);
    }
  }

  private drawPanorama(sunAlt: number, sunAz: number, moon: MoonData, weather: Weather): void {
    const canvas = this.panoEl()?.nativeElement;
    const ctx = canvas?.getContext?.('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, PANO_W, PANO_H);
    drawPanorama(ctx, {
      sunAlt,
      sunX: azToX(sunAz),
      moonAlt: moon.alt,
      moonX: azToX(moon.az),
      illumination: moon.illumination,
      overcast: weather.clouds,
      fog: weather.fog ? 1 : 0,
    });
    this.layoutSky();
  }

  /** Le nuvole sono un'immagine ripetuta in orizzontale che scorre piano. */
  private drawClouds(sunAlt: number, weather: Weather): void {
    const el = this.cloudEl()?.nativeElement;
    if (!el || typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = CLOUD_W;
    canvas.height = CLOUD_H;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return;
    drawClouds(ctx, sunAlt, weather);
    el.style.backgroundImage = weather.clouds < 0.05 ? 'none' : `url(${canvas.toDataURL()})`;
  }

  /** Le gocce di pioggia: tre strati di immagini che scendono a velocità diverse. */
  private drawRain(weather: Weather): void {
    const el = this.rainEl()?.nativeElement;
    if (!el || weather.snow) return;
    const layers = rainLayers(weather.rain, weather.storm).filter(Boolean);
    el.style.backgroundImage = layers.map((url) => `url(${url})`).join(', ');
  }

  /** Un fulmine in un punto a caso del cielo, con il doppio lampo tipico. */
  private strike(timers: number[]): void {
    const hero = this.heroEl()?.nativeElement;
    const canvas = this.boltEl()?.nativeElement;
    const ctx = canvas?.getContext?.('2d');
    if (!hero || !canvas || !ctx) return;
    const box = hero.getBoundingClientRect();
    canvas.width = Math.ceil(box.width / BOLT_PX);
    canvas.height = Math.ceil(box.height / BOLT_PX);
    const horizon = parseFloat(hero.style.getPropertyValue('--sky-hy')) || box.height * 0.7;
    const x = canvas.width * (0.3 + Math.random() * 0.65);
    drawBolt(ctx, x, canvas.height * (0.08 + Math.random() * 0.1), horizon / BOLT_PX + 3);

    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    this.flash.set(true);
    at(90, () => this.flash.set(false));
    at(170, () => this.flash.set(true));
    at(260, () => this.flash.set(false));
    at(340, () => ctx.clearRect(0, 0, canvas.width, canvas.height));
  }

  /** Una stella cadente: parte nella parte alta del cielo e scende in diagonale. */
  private shootingStar(timers: number[]): void {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const angle = 18 + Math.random() * 24;
    const distance = 140 + Math.random() * 160;
    const rad = (angle * Math.PI) / 180;
    this.meteor.set({
      id: Date.now(),
      x: 15 + Math.random() * 75,
      y: 4 + Math.random() * 30,
      dx: Math.cos(rad) * distance * dir,
      dy: Math.sin(rad) * distance,
      angle: dir > 0 ? angle : 180 - angle,
    });
    timers.push(window.setTimeout(() => this.meteor.set(null), 1000));
  }
}
