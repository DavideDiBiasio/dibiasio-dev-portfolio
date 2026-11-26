/* =========================
   CACCIA AL BUG — MOTORE
   Logica pura, senza DOM: avanza a passo fisso ed è testabile
   con un generatore casuale con seme.
   ========================= */

/** Larghezza e altezza del mondo di gioco, in pixel "logici". */
export const WORLD_W = 192;
export const WORLD_H = 144;

/** Passo fisso della simulazione (60 aggiornamenti al secondo). */
export const STEP = 1 / 60;

export const MAX_LIVES = 3;

/** Le tecnologie da raccogliere: sigla sulla tessera e nome completo. */
export const SKILLS = [
  { code: 'HTML', name: 'HTML', color: '#f08a5d' },
  { code: 'CSS', name: 'CSS / SCSS', color: '#8eaaf2' },
  { code: 'JS', name: 'JavaScript', color: '#f5d76e' },
  { code: 'TS', name: 'TypeScript', color: '#5b9fe0' },
  { code: 'NG', name: 'Angular', color: '#e8566b' },
  { code: 'JAVA', name: 'Java', color: '#e2a46a' },
  { code: 'SPRING', name: 'Spring Boot', color: '#8fd47a' },
  { code: 'SQL', name: 'SQL', color: '#9fd8de' },
  { code: 'GIT', name: 'Git', color: '#f2875a' },
  { code: 'AI', name: 'AI', color: '#c4a8ff' },
] as const;

export type SkillIndex = number;

export type ItemKind = 'skill' | 'bug' | 'coffee' | 'heart';

export interface Item {
  id: number;
  kind: ItemKind;
  /** Solo per le tessere: quale tecnologia. */
  skill: SkillIndex;
  x: number;
  y: number;
  w: number;
  h: number;
  vy: number;
  /** Oscillazione laterale dei bug. */
  phase: number;
}

export interface Popup {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  ttl: number;
}

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
  color: string;
}

export type GameEvent = 'catch' | 'bug' | 'miss' | 'coffee' | 'heart' | 'level' | 'stack' | 'over';

export type Phase = 'ready' | 'playing' | 'paused' | 'over';

export interface Input {
  /** -1 sinistra, 0 fermo, 1 destra (tastiera). */
  dir: number;
  /** Posizione desiderata del centro (puntatore o tocco), oppure null. */
  targetX: number | null;
}

export interface State {
  phase: Phase;
  time: number;
  score: number;
  lives: number;
  level: number;
  caught: number;
  combo: number;
  bestCombo: number;
  /** Tecnologie raccolte almeno una volta. */
  stack: boolean[];
  stackDone: boolean;
  /** Secondi di rallentamento rimasti (caffè). */
  slowmo: number;
  /** Secondi di invulnerabilità dopo un bug. */
  hurt: number;
  shake: number;
  player: { x: number; y: number; w: number; h: number; vx: number };
  items: Item[];
  popups: Popup[];
  sparks: Spark[];
  spawnIn: number;
  nextId: number;
  rand: () => number;
}

/** Generatore pseudo-casuale con seme (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLAYER_W = 28;
const PLAYER_H = 12;
const PLAYER_SPEED = 130;
const POINTER_SPEED = 320;

export function createState(rand: () => number = Math.random): State {
  return {
    phase: 'ready',
    time: 0,
    score: 0,
    lives: MAX_LIVES,
    level: 1,
    caught: 0,
    combo: 0,
    bestCombo: 0,
    stack: SKILLS.map(() => false),
    stackDone: false,
    slowmo: 0,
    hurt: 0,
    shake: 0,
    player: { x: (WORLD_W - PLAYER_W) / 2, y: WORLD_H - PLAYER_H - 6, w: PLAYER_W, h: PLAYER_H, vx: 0 },
    items: [],
    popups: [],
    sparks: [],
    spawnIn: 0.6,
    nextId: 1,
    rand,
  };
}

/** Moltiplicatore della serie: sale di uno ogni 5 prese di fila, fino a ×5. */
export const multiplier = (combo: number) => Math.min(5, 1 + Math.floor(combo / 5));

/** Ogni livello: più oggetti, più veloci, più bug. */
export const levelFor = (caught: number) => 1 + Math.floor(caught / 12);

const spawnInterval = (level: number) => Math.max(0.32, 0.95 - (level - 1) * 0.08);
const fallSpeed = (level: number) => 38 + (level - 1) * 7;
const bugChance = (level: number) => Math.min(0.42, 0.22 + (level - 1) * 0.03);

function spawn(s: State): void {
  const r = s.rand();
  let kind: ItemKind = 'skill';
  if (r < bugChance(s.level)) kind = 'bug';
  else if (r < bugChance(s.level) + 0.035) kind = 'coffee';
  else if (r < bugChance(s.level) + 0.05 && s.lives < MAX_LIVES) kind = 'heart';

  // Le tecnologie mancanti escono un po' più spesso, così lo stack si può completare.
  let skill = Math.floor(s.rand() * SKILLS.length);
  if (kind === 'skill' && !s.stackDone && s.rand() < 0.35) {
    const missing = s.stack.flatMap((got, i) => (got ? [] : [i]));
    if (missing.length) skill = missing[Math.floor(s.rand() * missing.length)];
  }

  const size = kind === 'skill' ? { w: SKILLS[skill].code.length * 4 + 5, h: 9 } : kind === 'bug' ? { w: 11, h: 9 } : { w: 9, h: 9 };
  const x = 2 + s.rand() * (WORLD_W - size.w - 4);
  const vy = fallSpeed(s.level) * (0.8 + s.rand() * 0.45) * (kind === 'bug' ? 1.15 : 1);

  s.items.push({ id: s.nextId++, kind, skill, x, y: -size.h, ...size, vy, phase: s.rand() * Math.PI * 2 });
}

function popup(s: State, x: number, y: number, text: string, color: string): void {
  s.popups.push({ id: s.nextId++, x, y, text, color, ttl: 0.9 });
}

function burst(s: State, x: number, y: number, color: string, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = s.rand() * Math.PI * 2;
    const v = 25 + s.rand() * 55;
    s.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, ttl: 0.35 + s.rand() * 0.3, color });
  }
}

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function start(s: State): void {
  if (s.phase === 'ready' || s.phase === 'paused') s.phase = 'playing';
}

export function togglePause(s: State): void {
  if (s.phase === 'playing') s.phase = 'paused';
  else if (s.phase === 'paused') s.phase = 'playing';
}

/** Avanza di un passo fisso. Restituisce gli eventi accaduti (per suoni ed effetti). */
export function step(s: State, input: Input, dt = STEP): GameEvent[] {
  const events: GameEvent[] = [];

  // Effetti visivi: continuano anche in pausa di gioco finita, ma non in pausa.
  if (s.phase === 'paused' || s.phase === 'ready') return events;

  for (const p of s.popups) {
    p.y -= 18 * dt;
    p.ttl -= dt;
  }
  s.popups = s.popups.filter((p) => p.ttl > 0);
  for (const k of s.sparks) {
    k.x += k.vx * dt;
    k.y += k.vy * dt;
    k.vy += 160 * dt;
    k.ttl -= dt;
  }
  s.sparks = s.sparks.filter((k) => k.ttl > 0);
  s.shake = Math.max(0, s.shake - dt * 3);

  if (s.phase !== 'playing') return events;

  s.time += dt;
  s.hurt = Math.max(0, s.hurt - dt);
  s.slowmo = Math.max(0, s.slowmo - dt);
  const world = s.slowmo > 0 ? dt * 0.5 : dt;

  // Giocatore: tastiera oppure inseguimento del puntatore.
  const p = s.player;
  if (input.dir !== 0) {
    p.vx = input.dir * PLAYER_SPEED;
    p.x += p.vx * dt;
  } else if (input.targetX !== null) {
    const delta = input.targetX - (p.x + p.w / 2);
    const move = Math.sign(delta) * Math.min(Math.abs(delta), POINTER_SPEED * dt);
    p.vx = move / dt;
    p.x += move;
  } else {
    p.vx = 0;
  }
  p.x = Math.max(0, Math.min(WORLD_W - p.w, p.x));

  // Comparsa degli oggetti.
  s.spawnIn -= world;
  if (s.spawnIn <= 0) {
    spawn(s);
    s.spawnIn = spawnInterval(s.level) * (0.7 + s.rand() * 0.6);
  }

  // Solo la parte alta del portatile raccoglie: così si vede cosa si prende.
  const catchZone = { x: p.x, y: p.y - 2, w: p.w, h: 6 };

  const kept: Item[] = [];
  for (const it of s.items) {
    it.y += it.vy * world;
    if (it.kind === 'bug') {
      it.phase += world * 4;
      it.x = Math.max(0, Math.min(WORLD_W - it.w, it.x + Math.sin(it.phase) * 18 * world));
    }

    const cx = it.x + it.w / 2;
    if (overlaps(it, catchZone)) {
      if (it.kind === 'skill') {
        s.combo++;
        s.bestCombo = Math.max(s.bestCombo, s.combo);
        const gain = 10 * multiplier(s.combo);
        s.score += gain;
        s.caught++;
        const skill = SKILLS[it.skill];
        popup(s, cx, it.y, `+${gain}`, skill.color);
        burst(s, cx, it.y, skill.color, 6);
        events.push('catch');

        if (!s.stack[it.skill]) {
          s.stack[it.skill] = true;
          if (!s.stackDone && s.stack.every(Boolean)) {
            s.stackDone = true;
            s.score += 500;
            popup(s, WORLD_W / 2, WORLD_H / 2, 'STACK COMPLETO +500', '#f5b841');
            burst(s, WORLD_W / 2, WORLD_H / 2, '#f5b841', 24);
            events.push('stack');
          }
        }

        const lvl = levelFor(s.caught);
        if (lvl > s.level) {
          s.level = lvl;
          popup(s, WORLD_W / 2, 40, `LIVELLO ${lvl}`, '#8fcbff');
          events.push('level');
        }
      } else if (it.kind === 'bug') {
        if (s.hurt <= 0) {
          s.lives--;
          s.combo = 0;
          s.hurt = 1.2;
          s.shake = 1;
          popup(s, cx, it.y, 'BUG!', '#ff5a5a');
          burst(s, cx, it.y, '#ff5a5a', 10);
          events.push('bug');
        }
      } else if (it.kind === 'coffee') {
        s.slowmo = 5;
        s.score += 25;
        popup(s, cx, it.y, 'CAFFE', '#e2c49b');
        burst(s, cx, it.y, '#e2c49b', 8);
        events.push('coffee');
      } else {
        s.lives = Math.min(MAX_LIVES, s.lives + 1);
        popup(s, cx, it.y, '+1 VITA', '#ff8fa3');
        burst(s, cx, it.y, '#ff8fa3', 8);
        events.push('heart');
      }
      continue;
    }

    if (it.y > WORLD_H) {
      // Una tecnologia persa interrompe la serie, ma non toglie vite.
      if (it.kind === 'skill' && s.combo > 0) {
        s.combo = 0;
        events.push('miss');
      }
      continue;
    }
    kept.push(it);
  }
  s.items = kept;

  if (s.lives <= 0) {
    s.phase = 'over';
    s.items = [];
    events.push('over');
  }

  return events;
}
