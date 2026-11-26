import { TestBed } from '@angular/core/testing';
import { Card, Game, PlayerId, declareAttackers, newGame, seeded } from './engine';
import { MemeArena } from './meme-arena';

type Internals = {
  g: Game;
  bump(): void;
  tapCard(c: Card): void;
  tapPlayer(p: PlayerId): void;
  confirmBlocks(): void;
  openDetail(uid: number): void;
  playSelected(): void;
  mustBlock(): boolean;
  targeting(): number | null;
};

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

function setup(active: PlayerId): Internals {
  const fixture = TestBed.createComponent(MemeArena);
  const arena = fixture.componentInstance as unknown as Internals;
  const g = newGame(['golden', 'brainrot'], seeded(3), active);
  for (const p of g.players) p.hand = [];
  arena.g = g;
  arena.bump();
  return arena;
}

describe('Meme Arena: interfaccia', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [MemeArena] }));

  it('blocchi: tocchi la tua creatura, poi l’attaccante, poi confermi', () => {
    const arena = setup(1);
    const g = arena.g;
    const wall = summon(g, 0, 'cane-wow'); // 2/3
    const shark = summon(g, 1, 'squalo-scarpe'); // 2/1
    declareAttackers(g, 1, [shark.uid]);
    arena.bump();
    expect(arena.mustBlock()).toBe(true);

    arena.tapCard(wall);
    arena.tapCard(shark);
    arena.confirmBlocks();

    expect(g.players[1].creatures).not.toContain(shark);
    expect(g.players[0].creatures).toContain(wall);
    expect(g.players[0].life).toBe(20);
  });

  it('trend con bersaglio: Gioca, poi tocchi il bersaglio', () => {
    const arena = setup(0);
    const g = arena.g;
    const foe = summon(g, 1, 'gatto-gambero'); // 3/1
    for (let i = 0; i < 2; i++) {
      g.players[0].lands.push({
        uid: g.nextUid++,
        id: 'land-golden',
        owner: 0,
        tapped: false,
        sick: false,
        damage: 0,
        bonusAtk: 0,
        bonusDef: 0,
        frozen: false,
        doomed: false,
      });
    }
    const fail: Card = {
      uid: g.nextUid++,
      id: 'epic-fail',
      owner: 0,
      tapped: false,
      sick: true,
      damage: 0,
      bonusAtk: 0,
      bonusDef: 0,
      frozen: false,
      doomed: false,
    };
    g.players[0].hand.push(fail);
    arena.bump();

    arena.openDetail(fail.uid);
    arena.playSelected();
    expect(arena.targeting()).toBe(fail.uid);
    // La faccia dell'avversario non è un bersaglio valido per Epic fail.
    arena.tapPlayer(1);
    expect(arena.targeting()).toBe(fail.uid);
    arena.tapCard(foe);
    expect(arena.targeting()).toBeNull();
    expect(g.players[1].creatures).not.toContain(foe);
  });
});
