import { chooseAction, chooseAttackers, chooseBlocks } from './ai';
import { CARDS, ERA_ORDER, Era, deckList } from './cards';
import {
  Card,
  Game,
  PlayerId,
  START_HAND,
  START_LIFE,
  beginAttack,
  canPlay,
  declareAttackers,
  declareBlocks,
  def,
  endTurn,
  newGame,
  play,
  seeded,
} from './engine';

/** Mette in mano una carta precisa (e le piattaforme necessarie in campo). */
function give(g: Game, pid: PlayerId, id: string, lands = 0): Card {
  const p = g.players[pid];
  for (let i = 0; i < lands; i++) {
    p.lands.push({
      uid: g.nextUid++,
      id: `land-${p.era}`,
      owner: pid,
      tapped: false,
      sick: false,
      damage: 0,
      bonusAtk: 0,
      bonusDef: 0,
      frozen: false,
      doomed: false,
    });
  }
  const c: Card = {
    uid: g.nextUid++,
    id,
    owner: pid,
    tapped: false,
    sick: true,
    damage: 0,
    bonusAtk: 0,
    bonusDef: 0,
    frozen: false,
    doomed: false,
  };
  p.hand.push(c);
  return c;
}

/** Una creatura già in campo, pronta ad attaccare. */
function summon(g: Game, pid: PlayerId, id: string): Card {
  const c: Card = {
    uid: g.nextUid++,
    id,
    owner: pid,
    tapped: false,
    sick: false,
    damage: 0,
    bonusAtk: 0,
    bonusDef: 0,
    frozen: false,
    doomed: false,
  };
  g.players[pid].creatures.push(c);
  return c;
}

function fresh(eras: [Era, Era] = ['brainrot', 'golden']): Game {
  const g = newGame(eras, seeded(7), 0);
  for (const p of g.players) p.hand = [];
  return g;
}

/** Ogni carta deve stare in una zona sola. */
function assertZones(g: Game): void {
  const seen = new Set<number>();
  for (const p of g.players) {
    for (const c of [...p.library, ...p.hand, ...p.lands, ...p.creatures, ...p.graveyard]) {
      expect(seen.has(c.uid)).toBe(false);
      seen.add(c.uid);
    }
  }
}

describe('Meme Arena: carte', () => {
  it('ogni era ha un mazzo da 30 con 12 piattaforme', () => {
    for (const era of ERA_ORDER) {
      const list = deckList(era);
      expect(list.length).toBe(30);
      expect(list.filter((id) => id.startsWith('land-')).length).toBe(12);
    }
  });

  it('ogni era ha almeno una risposta contro le creature avversarie', () => {
    for (const era of ERA_ORDER) {
      const answers = CARDS.filter(
        (c) =>
          c.era === era &&
          c.effects?.some((e) => ['damage', 'destroy', 'bounce', 'freeze', 'tap'].includes(e.type)),
      );
      expect(answers.length).toBeGreaterThan(0);
    }
  });
});

describe('Meme Arena: regole', () => {
  it('si parte con 20 vite e 7 carte', () => {
    const g = newGame(['boomer', 'cursed'], seeded(1), 0);
    expect(g.players.map((p) => p.life)).toEqual([START_LIFE, START_LIFE]);
    expect(g.players.map((p) => p.hand.length)).toEqual([START_HAND, START_HAND]);
    assertZones(g);
  });

  it('una sola piattaforma per turno', () => {
    const g = fresh();
    const a = give(g, 0, 'land-brainrot');
    const b = give(g, 0, 'land-brainrot');
    expect(play(g, 0, a.uid)).toBe(true);
    expect(canPlay(g, 0, b.uid)).toBe(false);
  });

  it('serve abbastanza hype, e giocare tappa le piattaforme', () => {
    const g = fresh();
    const tung = give(g, 0, 'tung-tung', 2);
    expect(canPlay(g, 0, tung.uid)).toBe(false);
    give(g, 0, 'land-brainrot');
    const land = g.players[0].hand.find((c) => c.id === 'land-brainrot')!;
    play(g, 0, land.uid);
    expect(play(g, 0, tung.uid)).toBe(true);
    expect(g.players[0].lands.every((l) => l.tapped)).toBe(true);
  });

  it('un trend con bersaglio va giocato su un bersaglio valido, altrimenti non succede niente', () => {
    const g = fresh();
    const rage = give(g, 0, 'ragebait', 1);
    expect(play(g, 0, rage.uid)).toBe(false);
    expect(g.players[0].hand).toContain(rage);
    expect(g.players[0].lands[0].tapped).toBe(false);
    expect(play(g, 0, rage.uid, { kind: 'player', player: 1 })).toBe(true);
    expect(g.players[1].life).toBe(START_LIFE - 2);
    expect(g.players[0].graveyard).toContain(rage);
  });

  it('le creature appena entrate non attaccano, quelle virali sì', () => {
    const g = fresh();
    const gamb = give(g, 0, 'gatto-gambero', 2);
    const squalo = give(g, 0, 'squalo-scarpe', 1);
    play(g, 0, gamb.uid);
    play(g, 0, squalo.uid);
    beginAttack(g, 0);
    expect(declareAttackers(g, 0, [gamb.uid])).toBe(false);
    expect(declareAttackers(g, 0, [squalo.uid])).toBe(true);
    expect(g.players[1].life).toBe(START_LIFE - 2);
  });

  it('blocco: danni simultanei, muore chi ne prende abbastanza', () => {
    const g = fresh();
    const a = summon(g, 0, 'squalo-scarpe'); // 2/1
    const b = summon(g, 1, 'cane-wow'); // 2/3
    declareAttackers(g, 0, [a.uid]);
    expect(g.phase).toBe('block');
    declareBlocks(g, 1, { [a.uid]: b.uid });
    expect(g.players[0].creatures).not.toContain(a);
    expect(g.players[1].creatures).toContain(b);
    expect(g.players[1].life).toBe(START_LIFE);
  });

  it('In tendenza può essere bloccata solo da creature In tendenza', () => {
    const g = fresh(['boomer', 'golden']);
    const gif = summon(g, 0, 'gif-glitter');
    const cane = summon(g, 1, 'cane-wow');
    declareAttackers(g, 0, [gif.uid]);
    // Nessun blocco possibile: i danni arrivano subito.
    expect(g.phase).toBe('main2');
    expect(g.players[1].life).toBe(START_LIFE - 2);
    expect(cane.damage).toBe(0);
  });

  it('Cringe distrugge con un solo danno, Travolgente fa passare il resto', () => {
    const g = fresh(['cursed', 'golden']);
    const occhio = summon(g, 0, 'occhio-fritto'); // 1/1 cringe
    const boss = summon(g, 1, 'like-a-boss'); // 4/4
    declareAttackers(g, 0, [occhio.uid]);
    declareBlocks(g, 1, { [occhio.uid]: boss.uid });
    expect(g.players[1].creatures).not.toContain(boss);

    const h = fresh(['golden', 'wholesome']);
    const big = summon(h, 0, 'oltre-9000'); // 6/5 travolgente
    const pup = summon(h, 1, 'cagnolino'); // 1/2
    declareAttackers(h, 0, [big.uid]);
    declareBlocks(h, 1, { [big.uid]: pup.uid });
    // 4 danni passano; il Cagnolino (Cuoricino) ne infligge 1 e recupera 1 vita.
    expect(h.players[1].life).toBe(START_LIFE - 4 + 1);
  });

  it('Cuoricino fa guadagnare vita pari ai danni', () => {
    const g = fresh(['wholesome', 'brainrot']);
    const dog = summon(g, 0, 'golden-retriever'); // 3/4
    declareAttackers(g, 0, [dog.uid]);
    expect(g.players[0].life).toBe(START_LIFE + 3);
    expect(g.players[1].life).toBe(START_LIFE - 3);
  });

  it('Congelata resta tappata al prossimo turno del proprietario', () => {
    const g = fresh(['wholesome', 'brainrot']);
    const target = summon(g, 1, 'tung-tung');
    const flag = give(g, 0, 'segnalazione', 2);
    play(g, 0, flag.uid, { kind: 'card', uid: target.uid });
    endTurn(g, 0);
    expect(g.active).toBe(1);
    expect(target.tapped).toBe(true);
    endTurn(g, 1);
    endTurn(g, 0);
    expect(target.tapped).toBe(false);
  });

  it('Notizia falsa rimanda in mano, le pedine invece spariscono', () => {
    const g = fresh(['boomer', 'golden']);
    const cane = summon(g, 1, 'cane-wow');
    const fake = give(g, 0, 'notizia-falsa', 2);
    play(g, 0, fake.uid, { kind: 'card', uid: cane.uid });
    expect(g.players[1].hand).toContain(cane);

    const token = summon(g, 1, 'ballerino');
    const fake2 = give(g, 0, 'notizia-falsa', 2);
    play(g, 0, fake2.uid, { kind: 'card', uid: token.uid });
    expect(g.players[1].hand).not.toContain(token);
    assertZones(g);
  });

  it('a fine turno i danni si curano e i bonus finiscono', () => {
    const g = fresh(['golden', 'brainrot']);
    const cane = summon(g, 0, 'cane-wow');
    const win = give(g, 0, 'epic-win', 1);
    play(g, 0, win.uid, { kind: 'card', uid: cane.uid });
    cane.damage = 2;
    expect(cane.bonusAtk).toBe(3);
    endTurn(g, 0);
    expect(cane.damage).toBe(0);
    expect(cane.bonusAtk).toBe(0);
  });

  it('chi finisce il mazzo perde', () => {
    const g = fresh();
    g.players[1].library = [];
    endTurn(g, 0);
    expect(g.winner).toBe(0);
  });
});

describe('Meme Arena: CPU', () => {
  it('blocca bene: uccide l’attaccante se può sopravvivere', () => {
    const g = fresh(['brainrot', 'golden']);
    const a = summon(g, 0, 'squalo-scarpe'); // 2/1
    summon(g, 1, 'forever-alone'); // 1/1: muore e uccide, scambio
    const wall = summon(g, 1, 'cane-wow'); // 2/3: uccide e sopravvive
    declareAttackers(g, 0, [a.uid]);
    expect(chooseBlocks(g, 1)).toEqual({ [a.uid]: wall.uid });
  });

  it('non attacca contro un muro che la ucciderebbe gratis', () => {
    const g = fresh(['brainrot', 'golden']);
    summon(g, 0, 'squalo-scarpe'); // 2/1
    summon(g, 1, 'cane-wow'); // 2/3
    expect(chooseAttackers(g, 0)).toEqual([]);
  });

  it('usa la rimozione sulla minaccia più grossa', () => {
    const g = fresh(['cursed', 'golden']);
    summon(g, 0, 'occhio-fritto');
    summon(g, 1, 'forever-alone');
    const big = summon(g, 1, 'oltre-9000');
    give(g, 0, 'maledizione', 4);
    const action = chooseAction(g, 0);
    expect(action).toEqual(
      expect.objectContaining({ type: 'play', target: { kind: 'card', uid: big.uid } }),
    );
  });

  it('partite intere CPU contro CPU finiscono sempre, senza carte duplicate', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const eras: [Era, Era] = [ERA_ORDER[seed % 5], ERA_ORDER[(seed * 3 + 1) % 5]];
      const g = newGame(eras, seeded(seed));
      let steps = 0;
      while (g.winner === null && steps++ < 5000) {
        if (g.phase === 'block') {
          const defender: PlayerId = g.active === 0 ? 1 : 0;
          expect(declareBlocks(g, defender, chooseBlocks(g, defender))).toBe(true);
          continue;
        }
        const action = chooseAction(g, g.active);
        const ok =
          action.type === 'play'
            ? play(g, g.active, action.uid, action.target)
            : action.type === 'attack'
              ? declareAttackers(g, g.active, action.uids)
              : endTurn(g, g.active);
        expect(ok).toBe(true);
      }
      expect(g.winner).not.toBeNull();
      assertZones(g);
      for (const p of g.players) for (const c of p.creatures) expect(def(c).type).toBe('meme');
    }
  });
});
