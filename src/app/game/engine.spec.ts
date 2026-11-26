import { Input, Item, MAX_LIVES, SKILLS, State, WORLD_W, createState, levelFor, multiplier, seeded, start, step, togglePause } from './engine';

const idle: Input = { dir: 0, targetX: null };

/** Mette un oggetto proprio sopra il portatile, pronto a essere preso. */
function dropOnPlayer(s: State, kind: Item['kind'], skill = 0): void {
  const p = s.player;
  s.items.push({ id: s.nextId++, kind, skill, x: p.x + 4, y: p.y - 6, w: 9, h: 9, vy: 60, phase: 0 });
}

function playing(seed = 1): State {
  const s = createState(seeded(seed));
  start(s);
  s.spawnIn = 999; // niente comparse casuali durante i test mirati
  return s;
}

describe('Caccia al bug: motore', () => {
  it('parte fermo e non avanza finché non si preme Gioca', () => {
    const s = createState(seeded(1));
    step(s, idle);
    expect(s.phase).toBe('ready');
    expect(s.time).toBe(0);
  });

  it('raccogliere una tecnologia dà punti, allunga la serie e la segna nello stack', () => {
    const s = playing();
    dropOnPlayer(s, 'skill', 3);
    const events = step(s, idle);
    expect(events).toContain('catch');
    expect(s.score).toBe(10);
    expect(s.combo).toBe(1);
    expect(s.stack[3]).toBe(true);
    expect(s.items.length).toBe(0);
  });

  it('un bug toglie una vita e azzera la serie, poi dà un attimo di invulnerabilità', () => {
    const s = playing();
    s.combo = 7;
    dropOnPlayer(s, 'bug');
    expect(step(s, idle)).toContain('bug');
    expect(s.lives).toBe(MAX_LIVES - 1);
    expect(s.combo).toBe(0);

    dropOnPlayer(s, 'bug');
    step(s, idle);
    expect(s.lives).toBe(MAX_LIVES - 1);
  });

  it('finisce quando le vite arrivano a zero', () => {
    const s = playing();
    s.lives = 1;
    dropOnPlayer(s, 'bug');
    expect(step(s, idle)).toContain('over');
    expect(s.phase).toBe('over');
  });

  it('completare lo stack vale un bonus di 500 punti, una volta sola', () => {
    const s = playing();
    SKILLS.forEach((_, i) => {
      dropOnPlayer(s, 'skill', i);
      step(s, idle);
    });
    expect(s.stackDone).toBe(true);
    const after = s.score;
    expect(after).toBeGreaterThan(500);

    dropOnPlayer(s, 'skill', 0);
    step(s, idle);
    expect(s.score - after).toBeLessThan(100);
  });

  it('il caffè rallenta la caduta degli oggetti', () => {
    const normal = playing();
    const slow = playing();
    dropOnPlayer(slow, 'coffee');
    step(slow, idle);
    expect(slow.slowmo).toBeGreaterThan(0);

    for (const s of [normal, slow]) s.items.push({ id: 99, kind: 'skill', skill: 0, x: 0, y: 0, w: 9, h: 9, vy: 60, phase: 0 });
    step(normal, idle);
    step(slow, idle);
    expect(slow.items[0].y).toBeCloseTo(normal.items[0].y / 2, 5);
  });

  it('una tecnologia persa interrompe la serie senza togliere vite', () => {
    const s = playing();
    s.combo = 4;
    s.items.push({ id: 1, kind: 'skill', skill: 0, x: 0, y: 200, w: 9, h: 9, vy: 60, phase: 0 });
    s.player.x = WORLD_W - s.player.w;
    expect(step(s, idle)).toContain('miss');
    expect(s.combo).toBe(0);
    expect(s.lives).toBe(MAX_LIVES);
  });

  it('il portatile resta dentro lo schermo', () => {
    const s = playing();
    for (let i = 0; i < 300; i++) step(s, { dir: -1, targetX: null });
    expect(s.player.x).toBe(0);
    for (let i = 0; i < 300; i++) step(s, { dir: 0, targetX: 10_000 });
    expect(s.player.x).toBe(WORLD_W - s.player.w);
  });

  it('in pausa il tempo si ferma', () => {
    const s = playing();
    step(s, idle);
    togglePause(s);
    const t = s.time;
    step(s, idle);
    expect(s.time).toBe(t);
  });

  it('moltiplicatore e livello crescono con il gioco', () => {
    expect(multiplier(0)).toBe(1);
    expect(multiplier(5)).toBe(2);
    expect(multiplier(100)).toBe(5);
    expect(levelFor(0)).toBe(1);
    expect(levelFor(12)).toBe(2);
  });

  it('con lo stesso seme la partita è identica', () => {
    const run = () => {
      const s = createState(seeded(42));
      start(s);
      for (let i = 0; i < 60 * 30; i++) step(s, { dir: 0, targetX: 96 + Math.sin(i / 30) * 60 });
      return [s.score, s.lives, s.caught, s.items.length];
    };
    expect(run()).toEqual(run());
  });
});
