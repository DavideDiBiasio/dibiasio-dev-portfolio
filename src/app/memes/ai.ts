/* =========================
   MEME ARENA — AVVERSARIO
   IA a punteggio (utility): per ogni mossa possibile calcola quanto conviene
   e sceglie la migliore. Niente trucchi: vede solo quello che vedresti tu,
   più la propria mano.
   ========================= */

import { CardDef, Effect } from './cards';
import {
  Card,
  Game,
  PlayerId,
  Target,
  atk,
  canAttack,
  canBlock,
  canPlay,
  def,
  findCard,
  has,
  isMainPhase,
  other,
  toughness,
  validTargets,
  value,
} from './engine';

export type AiAction =
  | { type: 'play'; uid: number; target?: Target }
  | { type: 'attack'; uids: number[] }
  | { type: 'end' };

/** Quanto danno serve ancora per far fuori questa creatura. */
const remaining = (c: Card) => Math.max(0, toughness(c) - c.damage);
const kills = (source: Card, victim: Card) =>
  has(source, 'cringe') || atk(source) >= remaining(victim);

function effectScore(
  g: Game,
  pid: PlayerId,
  e: Effect,
  t: Target | undefined,
  isTrend: boolean,
): number {
  const me = g.players[pid];
  const them = g.players[other(pid)];
  const card = t?.kind === 'card' ? findCard(g, t.uid) : undefined;
  const mine = card?.owner === pid;
  const sign = mine ? -1 : 1;

  switch (e.type) {
    case 'damage': {
      if (t?.kind === 'player') {
        if (t.player === pid) return -1000;
        return e.amount >= them.life ? 10_000 : e.amount * 3;
      }
      if (!card) return 0;
      if (e.amount >= remaining(card)) return sign * value(card) * 8;
      return isTrend ? -20 : sign * 2;
    }
    case 'damage-all': {
      const victims = e.who === 'all' ? [...me.creatures, ...them.creatures] : them.creatures;
      return (
        victims
          .filter((c) => e.amount >= remaining(c))
          .reduce((s, c) => s + (c.owner === pid ? -1 : 1) * value(c) * 8, 0) || -5
      );
    }
    case 'destroy':
      return card ? sign * value(card) * 8 : 0;
    case 'bounce':
      return card ? sign * value(card) * (def(card).token ? 8 : 5) : 0;
    case 'freeze':
    case 'tap':
      if (!card) return 0;
      return card.tapped ? -10 : sign * atk(card) * (e.type === 'freeze' ? 5 : 3);
    case 'pump':
      // Senza istantanei, un potenziamento serve solo prima di attaccare.
      if (!card || mine === false) return -100;
      return g.phase === 'main' && canAttack(card) ? 10 + e.atk * 3 : -30;
    case 'pump-all': {
      const ready = me.creatures.filter(canAttack).length;
      return g.phase === 'main' && ready >= 2 ? ready * (e.atk + e.def) * 4 : -30;
    }
    case 'draw':
      return e.amount * 12;
    case 'gain':
      return e.amount * (me.life < 10 ? 6 : 2);
    case 'drain':
      return e.amount >= them.life ? 10_000 : e.amount * 5;
    case 'tokens':
      return e.amount * 10;
    case 'ramp':
      return me.library.some((c) => def(c).type === 'piattaforma') ? 15 : 0;
  }
}

function playScore(g: Game, pid: PlayerId, d: CardDef, t: Target | undefined): number {
  if (d.type === 'piattaforma') return 1000;
  const isTrend = d.type === 'trend';
  let score = d.cost * 10;
  if (d.type === 'meme')
    score += 10 + ((d.atk ?? 0) + (d.def ?? 0)) * 3 + (d.keywords?.length ?? 0) * 4;
  const effects = (d.effects ?? []).reduce((s, e) => s + effectScore(g, pid, e, t, isTrend), 0);
  // Un trend vale solo per quello che fa: se non fa niente di buono, meglio tenerlo.
  return isTrend ? (effects > 0 ? score + effects : -1) : score + effects;
}

export function bestPlay(g: Game, pid: PlayerId): AiAction | null {
  let best: { action: AiAction; score: number } | null = null;
  for (const c of g.players[pid].hand) {
    if (!canPlay(g, pid, c.uid)) continue;
    const d = def(c);
    const targets: Array<Target | undefined> = validTargets(g, pid, d);
    if (targets.length === 0) targets.push(undefined);
    for (const t of targets) {
      const score = playScore(g, pid, d, t);
      if (score > 0 && (!best || score > best.score))
        best = { action: { type: 'play', uid: c.uid, target: t }, score };
    }
  }
  return best?.action ?? null;
}

/** Chi mandare all'attacco: chi non può essere bloccato, chi sopravvive ai blocchi, o tutti se è letale. */
export function chooseAttackers(g: Game, pid: PlayerId): number[] {
  const ready = g.players[pid].creatures.filter(canAttack);
  const foe = g.players[other(pid)];
  const blockers = foe.creatures.filter((b) => !b.tapped);

  // Letale? L'avversario può fermare al massimo un attaccante per bloccante: i più grossi.
  const powers = ready.map(atk).sort((a, b) => b - a);
  const unblockable = ready.filter((a) => !blockers.some((b) => canBlock(b, a)));
  const blockable = ready
    .filter((a) => !unblockable.includes(a))
    .map(atk)
    .sort((a, b) => b - a);
  const surely =
    unblockable.reduce((s, a) => s + atk(a), 0) +
    blockable.slice(blockers.length).reduce((s, n) => s + n, 0);
  if (powers.length && surely >= foe.life) return ready.map((c) => c.uid);

  return ready
    .filter((a) => {
      const able = blockers.filter((b) => canBlock(b, a));
      if (able.length === 0) return true;
      // Sopravvive a qualsiasi blocco?
      if (able.every((b) => !kills(b, a))) return true;
      // Ogni blocco che lo uccide costa all'avversario almeno quanto vale lui.
      return able.every((b) => !kills(b, a) || (kills(a, b) && value(b) >= value(a)));
    })
    .map((c) => c.uid);
}

/** Blocchi della CPU: prima i blocchi vantaggiosi, poi quelli che salvano la pelle. */
export function chooseBlocks(g: Game, pid: PlayerId): Record<number, number> {
  const me = g.players[pid];
  const attackers = g.attackers
    .map((u) => findCard(g, u))
    .filter((c): c is Card => !!c)
    .sort((a, b) => atk(b) - atk(a));
  const free = new Set(me.creatures.filter((c) => !c.tapped).map((c) => c.uid));
  const blocks: Record<number, number> = {};

  for (const a of attackers) {
    let best: { uid: number; score: number } | null = null;
    for (const b of me.creatures) {
      if (!free.has(b.uid) || !canBlock(b, a)) continue;
      const k = kills(b, a);
      const dies = kills(a, b);
      const score =
        k && !dies
          ? 100 + value(a) - value(b)
          : !k && !dies
            ? 30 + atk(a)
            : k && dies && value(a) >= value(b)
              ? 20 + value(a) - value(b)
              : -1;
      if (score > 0 && (!best || score > best.score)) best = { uid: b.uid, score };
    }
    if (best) {
      blocks[a.uid] = best.uid;
      free.delete(best.uid);
    }
  }

  // Se i danni che passano sono letali, si blocca anche a costo di perdere creature.
  const incoming = () =>
    attackers.filter((a) => blocks[a.uid] === undefined).reduce((s, a) => s + atk(a), 0);
  for (const a of attackers) {
    if (incoming() < me.life) break;
    if (blocks[a.uid] !== undefined) continue;
    const chump = me.creatures
      .filter((b) => free.has(b.uid) && canBlock(b, a))
      .sort((x, y) => value(x) - value(y))[0];
    if (chump) {
      blocks[a.uid] = chump.uid;
      free.delete(chump.uid);
    }
  }
  return blocks;
}

/** La prossima mossa della CPU nel suo turno. */
export function chooseAction(g: Game, pid: PlayerId): AiAction {
  if (isMainPhase(g)) {
    const play = bestPlay(g, pid);
    if (play) return play;
    if (g.phase === 'main') return { type: 'attack', uids: chooseAttackers(g, pid) };
  }
  return { type: 'end' };
}
