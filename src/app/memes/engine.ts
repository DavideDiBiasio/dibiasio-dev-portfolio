/* =========================
   MEME ARENA — REGOLE
   Logica pura, senza DOM: lo stesso codice muove te e il computer.
   Turno: stappa → pesca → fase principale → attacco → blocchi →
   danni → seconda fase principale → fine turno.
   ========================= */

import { CARD_BY_ID, CardDef, Effect, Era, TargetKind, deckList } from './cards';

export type PlayerId = 0 | 1;

export const START_LIFE = 20;
export const START_HAND = 7;
export const MAX_HAND = 7;

export interface Card {
  uid: number;
  id: string;
  owner: PlayerId;
  tapped: boolean;
  /** Appena entrata: non può attaccare finché non inizia il tuo turno. */
  sick: boolean;
  damage: number;
  bonusAtk: number;
  bonusDef: number;
  /** Congelata: resta tappata al prossimo turno. */
  frozen: boolean;
  /** Colpita da una creatura Cringe. */
  doomed: boolean;
}

export interface Player {
  name: string;
  era: Era;
  life: number;
  library: Card[];
  hand: Card[];
  lands: Card[];
  creatures: Card[];
  graveyard: Card[];
  landPlayed: boolean;
}

export type Phase = 'main' | 'attack' | 'block' | 'main2';

export type Target = { kind: 'player'; player: PlayerId } | { kind: 'card'; uid: number };

export interface LogEntry {
  id: number;
  who: PlayerId | null;
  text: string;
}

export interface Game {
  players: [Player, Player];
  active: PlayerId;
  turn: number;
  phase: Phase;
  attackers: number[];
  /** Attaccante → bloccante. */
  blocks: Record<number, number>;
  winner: PlayerId | 'draw' | null;
  log: LogEntry[];
  nextUid: number;
  rand: () => number;
}

export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
export const def = (c: Card): CardDef => CARD_BY_ID[c.id];
export const atk = (c: Card) => Math.max(0, (def(c).atk ?? 0) + c.bonusAtk);
export const toughness = (c: Card) => (def(c).def ?? 0) + c.bonusDef;
export const has = (c: Card, k: NonNullable<CardDef['keywords']>[number]) =>
  def(c).keywords?.includes(k) ?? false;
export const value = (c: Card) => def(c).cost + atk(c) + toughness(c);

/** Generatore pseudo-casuale con seme (mulberry32), per partite ripetibili nei test. */
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

function shuffle<T>(list: T[], rand: () => number): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function makeCard(g: Game, id: string, owner: PlayerId): Card {
  return {
    uid: g.nextUid++,
    id,
    owner,
    tapped: false,
    sick: true,
    damage: 0,
    bonusAtk: 0,
    bonusDef: 0,
    frozen: false,
    doomed: false,
  };
}

function log(g: Game, who: PlayerId | null, text: string): void {
  g.log.push({ id: g.log.length + 1, who, text });
  if (g.log.length > 60) g.log.splice(0, g.log.length - 60);
}

export function newGame(
  eras: [Era, Era],
  rand: () => number = Math.random,
  first?: PlayerId,
): Game {
  const g: Game = {
    players: [
      {
        name: 'Tu',
        era: eras[0],
        life: START_LIFE,
        library: [],
        hand: [],
        lands: [],
        creatures: [],
        graveyard: [],
        landPlayed: false,
      },
      {
        name: 'CPU',
        era: eras[1],
        life: START_LIFE,
        library: [],
        hand: [],
        lands: [],
        creatures: [],
        graveyard: [],
        landPlayed: false,
      },
    ],
    active: first ?? (rand() < 0.5 ? 0 : 1),
    turn: 1,
    phase: 'main',
    attackers: [],
    blocks: {},
    winner: null,
    log: [],
    nextUid: 1,
    rand,
  };
  for (const pid of [0, 1] as PlayerId[]) {
    const p = g.players[pid];
    p.library = shuffle(
      deckList(p.era).map((id) => makeCard(g, id, pid)),
      rand,
    );
    draw(g, pid, START_HAND, true);
  }
  log(
    g,
    null,
    g.active === 0
      ? 'Inizi tu. Al primo turno non si pesca.'
      : 'Inizia la CPU. Al primo turno non si pesca.',
  );
  return g;
}

/* =========================
   ZONE E STATO
   ========================= */

export function findCard(g: Game, uid: number): Card | undefined {
  for (const p of g.players) {
    const c =
      p.creatures.find((x) => x.uid === uid) ??
      p.hand.find((x) => x.uid === uid) ??
      p.lands.find((x) => x.uid === uid);
    if (c) return c;
  }
  return undefined;
}

const onBattlefield = (g: Game, uid: number) =>
  g.players.some((p) => p.creatures.some((c) => c.uid === uid));

function draw(g: Game, pid: PlayerId, n: number, quiet = false): void {
  const p = g.players[pid];
  for (let i = 0; i < n; i++) {
    const c = p.library.shift();
    if (!c) {
      log(g, pid, `${p.name}: mazzo finito!`);
      p.life = 0;
      break;
    }
    p.hand.push(c);
  }
  if (!quiet && n > 0) log(g, pid, `${p.name} pesca ${n === 1 ? 'una carta' : `${n} carte`}.`);
}

/** Toglie una creatura dal campo: le pedine spariscono, le carte tornano pulite. */
function leaveBattlefield(g: Game, c: Card): void {
  const p = g.players[c.owner];
  p.creatures = p.creatures.filter((x) => x.uid !== c.uid);
  Object.assign(c, {
    tapped: false,
    sick: true,
    damage: 0,
    bonusAtk: 0,
    bonusDef: 0,
    frozen: false,
    doomed: false,
  });
}

function destroy(g: Game, c: Card): void {
  leaveBattlefield(g, c);
  if (!def(c).token) g.players[c.owner].graveyard.push(c);
}

/** Azioni di stato: creature morte, giocatori a zero vite. */
function checkState(g: Game): void {
  for (const p of g.players) {
    for (const c of [...p.creatures]) {
      if (c.damage >= toughness(c) || c.doomed || toughness(c) <= 0) {
        destroy(g, c);
        log(g, c.owner, `${def(c).name} è finito nel dimenticatoio.`);
      }
    }
  }
  if (g.winner !== null) return;
  const dead = g.players.map((p) => p.life <= 0);
  if (dead[0] && dead[1]) g.winner = 'draw';
  else if (dead[0]) g.winner = 1;
  else if (dead[1]) g.winner = 0;
  if (g.winner !== null) {
    g.attackers = [];
    g.blocks = {};
    log(
      g,
      null,
      g.winner === 'draw' ? 'Pareggio!' : g.winner === 0 ? 'Hai vinto!' : 'Ha vinto la CPU.',
    );
  }
}

/* =========================
   HYPE E BERSAGLI
   ========================= */

export const untappedLands = (g: Game, pid: PlayerId) =>
  g.players[pid].lands.filter((l) => !l.tapped).length;

/** Il primo effetto con bersaglio decide chi va scelto. */
export function targetKind(d: CardDef): Effect | undefined {
  return d.effects?.find((e) => 'target' in e);
}

export function validTargets(g: Game, pid: PlayerId, d: CardDef): Target[] {
  const eff = targetKind(d);
  if (!eff || !('target' in eff)) return [];
  const kind: TargetKind = eff.target;
  const mine = g.players[pid].creatures;
  const theirs = g.players[other(pid)].creatures;
  let cards =
    kind === 'own-creature' ? mine : kind === 'enemy-creature' ? theirs : [...theirs, ...mine];
  if (eff.type === 'destroy' && eff.maxAtk !== undefined)
    cards = cards.filter((c) => atk(c) <= eff.maxAtk!);
  const targets: Target[] = cards.map((c) => ({ kind: 'card', uid: c.uid }));
  if (kind === 'any')
    targets.unshift({ kind: 'player', player: other(pid) }, { kind: 'player', player: pid });
  return targets;
}

const sameTarget = (a: Target, b: Target) =>
  a.kind === b.kind &&
  (a.kind === 'player'
    ? a.player === (b as typeof a).player
    : a.uid === (b as Extract<Target, { kind: 'card' }>).uid);

export const isMainPhase = (g: Game) => g.phase === 'main' || g.phase === 'main2';

export function canPlay(g: Game, pid: PlayerId, uid: number): boolean {
  if (g.winner !== null || g.active !== pid || !isMainPhase(g)) return false;
  const c = g.players[pid].hand.find((x) => x.uid === uid);
  if (!c) return false;
  const d = def(c);
  if (d.type === 'piattaforma') return !g.players[pid].landPlayed;
  if (d.cost > untappedLands(g, pid)) return false;
  // Un trend senza bersagli validi non fa nulla: non si può giocare.
  if (d.type === 'trend' && targetKind(d) && validTargets(g, pid, d).length === 0) return false;
  return true;
}

/** Serve scegliere un bersaglio? (Per i meme solo se ce n'è almeno uno.) */
export function needsTarget(g: Game, pid: PlayerId, uid: number): boolean {
  const c = findCard(g, uid);
  return !!c && !!targetKind(def(c)) && validTargets(g, pid, def(c)).length > 0;
}

/* =========================
   EFFETTI
   ========================= */

function targetName(g: Game, t: Target): string {
  if (t.kind === 'player') return t.player === 0 ? 'te' : 'la CPU';
  const c = findCard(g, t.uid);
  return c ? def(c).name : '?';
}

function damageTarget(g: Game, t: Target, amount: number): void {
  if (t.kind === 'player') g.players[t.player].life -= amount;
  else {
    const c = findCard(g, t.uid);
    if (c && onBattlefield(g, c.uid)) c.damage += amount;
  }
}

function resolve(g: Game, pid: PlayerId, source: CardDef, target?: Target): void {
  const me = g.players[pid];
  const them = g.players[other(pid)];
  const found = target?.kind === 'card' ? findCard(g, target.uid) : undefined;
  // Se il bersaglio nel frattempo è sparito, l'effetto su di lui non fa nulla.
  const tc = found && onBattlefield(g, found.uid) ? found : undefined;

  for (const e of source.effects ?? []) {
    switch (e.type) {
      case 'damage':
        if (!target) break;
        damageTarget(g, target, e.amount);
        log(g, pid, `${source.name}: ${e.amount} danni a ${targetName(g, target)}.`);
        break;
      case 'damage-all': {
        const victims = e.who === 'all' ? [...me.creatures, ...them.creatures] : them.creatures;
        for (const c of victims) c.damage += e.amount;
        log(
          g,
          pid,
          `${source.name}: ${e.amount} danno a ${e.who === 'all' ? 'ogni creatura' : 'ogni creatura avversaria'}.`,
        );
        break;
      }
      case 'destroy':
        if (!tc) break;
        log(g, pid, `${source.name} distrugge ${def(tc).name}.`);
        tc.doomed = true;
        break;
      case 'bounce':
        if (!tc) break;
        leaveBattlefield(g, tc);
        if (!def(tc).token) g.players[tc.owner].hand.push(tc);
        log(g, pid, `${source.name} rimanda in mano ${def(tc).name}.`);
        break;
      case 'freeze':
      case 'tap':
        if (!tc) break;
        tc.tapped = true;
        if (e.type === 'freeze') tc.frozen = true;
        log(g, pid, `${source.name} ${e.type === 'freeze' ? 'congela' : 'tappa'} ${def(tc).name}.`);
        break;
      case 'pump':
        if (!tc) break;
        tc.bonusAtk += e.atk;
        tc.bonusDef += e.def;
        log(g, pid, `${def(tc).name} prende +${e.atk}/+${e.def}.`);
        break;
      case 'pump-all':
        for (const c of me.creatures) {
          c.bonusAtk += e.atk;
          c.bonusDef += e.def;
        }
        log(
          g,
          pid,
          `${source.name}: le creature di ${me.name === 'Tu' ? 'te' : 'CPU'} prendono +${e.atk}/+${e.def}.`,
        );
        break;
      case 'draw':
        draw(g, pid, e.amount);
        break;
      case 'gain':
        me.life += e.amount;
        log(g, pid, `${me.name === 'Tu' ? 'Guadagni' : 'La CPU guadagna'} ${e.amount} vite.`);
        break;
      case 'drain':
        them.life -= e.amount;
        me.life += e.amount;
        log(g, pid, `${source.name} ruba ${e.amount} ${e.amount === 1 ? 'vita' : 'vite'}.`);
        break;
      case 'tokens':
        for (let i = 0; i < e.amount; i++) me.creatures.push(makeCard(g, e.token, pid));
        log(g, pid, `${source.name}: arrivano ${e.amount} pedine ${CARD_BY_ID[e.token].name}.`);
        break;
      case 'ramp': {
        const i = me.library.findIndex((c) => def(c).type === 'piattaforma');
        if (i < 0) break;
        const [l] = me.library.splice(i, 1);
        l.tapped = true;
        me.lands.push(l);
        log(g, pid, `${source.name}: una piattaforma in più.`);
        break;
      }
    }
  }
}

/* =========================
   AZIONI
   ========================= */

export function play(g: Game, pid: PlayerId, uid: number, target?: Target): boolean {
  if (!canPlay(g, pid, uid)) return false;
  const p = g.players[pid];
  const c = p.hand.find((x) => x.uid === uid)!;
  const d = def(c);

  const targets = validTargets(g, pid, d);
  if (targets.length > 0 && (!target || !targets.some((t) => sameTarget(t, target)))) return false;

  p.hand = p.hand.filter((x) => x.uid !== uid);

  if (d.type === 'piattaforma') {
    p.lands.push(c);
    p.landPlayed = true;
    log(g, pid, `${p.name} gioca ${d.name}.`);
    return true;
  }

  let toPay = d.cost;
  for (const l of p.lands) {
    if (toPay === 0) break;
    if (!l.tapped) {
      l.tapped = true;
      toPay--;
    }
  }

  if (d.type === 'meme') {
    c.sick = !has(c, 'virale');
    p.creatures.push(c);
    log(g, pid, `${p.name} evoca ${d.name}.`);
  } else {
    log(g, pid, `${p.name} lancia ${d.name}.`);
  }

  resolve(g, pid, d, targets.length > 0 ? target : undefined);
  if (d.type === 'trend') p.graveyard.push(c);
  checkState(g);
  return true;
}

export const canAttack = (c: Card) =>
  !c.tapped && (!c.sick || has(c, 'virale')) && !has(c, 'muro') && atk(c) > 0;

export function canBlock(blocker: Card, attacker: Card): boolean {
  if (blocker.tapped) return false;
  return !has(attacker, 'tendenza') || has(blocker, 'tendenza');
}

/** Dalla fase principale si passa a scegliere gli attaccanti. */
export function beginAttack(g: Game, pid: PlayerId): boolean {
  if (g.winner !== null || g.active !== pid || g.phase !== 'main') return false;
  g.phase = 'attack';
  return true;
}

export function declareAttackers(g: Game, pid: PlayerId, uids: number[]): boolean {
  if (g.winner !== null || g.active !== pid || (g.phase !== 'attack' && g.phase !== 'main'))
    return false;
  const p = g.players[pid];
  const attackers = [...new Set(uids)].map((u) => p.creatures.find((c) => c.uid === u));
  if (attackers.some((c) => !c || !canAttack(c))) return false;

  if (attackers.length === 0) {
    g.phase = 'main2';
    return true;
  }

  for (const c of attackers as Card[]) c.tapped = true;
  g.attackers = (attackers as Card[]).map((c) => c.uid);
  g.blocks = {};
  log(g, pid, `${p.name} attacca con ${(attackers as Card[]).map((c) => def(c).name).join(', ')}.`);

  // Se il difensore non può bloccare niente, i danni arrivano subito.
  const defenders = g.players[other(pid)].creatures;
  const anyBlock = (attackers as Card[]).some((a) => defenders.some((b) => canBlock(b, a)));
  if (anyBlock) g.phase = 'block';
  else resolveCombat(g);
  return true;
}

export function declareBlocks(g: Game, pid: PlayerId, blocks: Record<number, number>): boolean {
  if (g.winner !== null || g.phase !== 'block' || pid === g.active) return false;
  const used = new Set<number>();
  for (const [a, b] of Object.entries(blocks)) {
    const attacker = findCard(g, Number(a));
    const blocker = g.players[pid].creatures.find((c) => c.uid === b);
    if (
      !attacker ||
      !g.attackers.includes(attacker.uid) ||
      !blocker ||
      used.has(b) ||
      !canBlock(blocker, attacker)
    )
      return false;
    used.add(b);
  }
  g.blocks = { ...blocks };
  resolveCombat(g);
  return true;
}

function resolveCombat(g: Game): void {
  const attacker = g.players[g.active];
  const defender = g.players[other(g.active)];
  const gains = [0, 0];
  let toFace = 0;
  const hits: Array<[Card, number, Card]> = [];

  for (const uid of g.attackers) {
    const a = attacker.creatures.find((c) => c.uid === uid);
    if (!a) continue;
    const b = defender.creatures.find((c) => c.uid === g.blocks[uid]);
    const power = atk(a);

    if (!b) {
      toFace += power;
      if (has(a, 'cuoricino')) gains[a.owner] += power;
      continue;
    }

    // Travolgente: al bloccante solo il danno letale, il resto passa.
    let onBlocker = power;
    if (has(a, 'travolgente')) {
      const lethal = has(a, 'cringe') ? 1 : Math.max(0, toughness(b) - b.damage);
      onBlocker = Math.min(power, lethal);
      toFace += power - onBlocker;
    }
    hits.push([a, onBlocker, b], [b, atk(b), a]);
    if (has(a, 'cuoricino')) gains[a.owner] += power;
    if (has(b, 'cuoricino')) gains[b.owner] += atk(b);
  }

  // I danni sono simultanei: prima si calcolano tutti, poi si applicano.
  for (const [src, amount, dst] of hits) {
    if (amount <= 0) continue;
    dst.damage += amount;
    if (has(src, 'cringe')) dst.doomed = true;
  }
  if (toFace > 0) {
    defender.life -= toFace;
    log(g, g.active, `${toFace} danni a ${defender.name === 'Tu' ? 'te' : 'la CPU'}.`);
  }
  for (const pid of [0, 1] as PlayerId[]) {
    if (gains[pid] > 0) {
      g.players[pid].life += gains[pid];
      log(g, pid, `Cuoricino: +${gains[pid]} vite a ${pid === 0 ? 'te' : 'la CPU'}.`);
    }
  }

  g.attackers = [];
  g.blocks = {};
  g.phase = 'main2';
  checkState(g);
}

export function endTurn(g: Game, pid: PlayerId): boolean {
  if (g.winner !== null || g.active !== pid || !isMainPhase(g)) return false;
  const p = g.players[pid];

  // Fine turno: i danni si curano, i potenziamenti finiscono, la mano torna a 7.
  for (const q of g.players) {
    for (const c of q.creatures) {
      c.damage = 0;
      c.bonusAtk = 0;
      c.bonusDef = 0;
    }
  }
  while (p.hand.length > MAX_HAND) {
    const worst = p.hand.reduce((a, b) => (def(b).cost > def(a).cost ? b : a));
    p.hand = p.hand.filter((c) => c !== worst);
    p.graveyard.push(worst);
    log(g, pid, `${p.name} scarta ${def(worst).name}.`);
  }

  g.active = other(pid);
  g.turn++;
  g.phase = 'main';
  startTurn(g);
  return true;
}

function startTurn(g: Game): void {
  const p = g.players[g.active];
  p.landPlayed = false;
  for (const c of [...p.lands, ...p.creatures]) {
    if (c.frozen) c.frozen = false;
    else c.tapped = false;
    c.sick = false;
  }
  log(
    g,
    g.active,
    g.active === 0
      ? `Turno ${Math.ceil(g.turn / 2)}: tocca a te.`
      : `Turno ${Math.ceil(g.turn / 2)}: tocca alla CPU.`,
  );
  draw(g, g.active, 1, true);
  checkState(g);
}
