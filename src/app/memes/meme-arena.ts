import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { chooseAction, chooseBlocks } from './ai';
import { CARD_BY_ID, ERAS, ERA_ORDER, Era, KEYWORDS } from './cards';
import {
  Card,
  Game,
  PlayerId,
  Target,
  beginAttack,
  canAttack,
  canBlock,
  canPlay,
  declareAttackers,
  declareBlocks,
  def,
  endTurn,
  findCard,
  needsTarget,
  newGame,
  play,
  untappedLands,
  validTargets,
} from './engine';
import { MemeCard } from './meme-card';

const YOU: PlayerId = 0;
const CPU: PlayerId = 1;

/** Quanto aspetta la CPU tra una mossa e l'altra, per farti vedere cosa succede. */
const CPU_DELAY = 900;

const STATS_KEY = 'meme-arena:risultati';

function readStats(): { wins: number; losses: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY) ?? '');
    return { wins: Number(raw.wins) || 0, losses: Number(raw.losses) || 0 };
  } catch {
    return { wins: 0, losses: 0 };
  }
}

@Component({
  selector: 'app-meme-arena',
  imports: [MemeCard],
  templateUrl: './meme-arena.html',
  styleUrl: './meme-arena.scss',
})
export class MemeArena {
  protected readonly eras = ERA_ORDER.map((e) => ERAS[e]);
  protected readonly ERAS = ERAS;
  protected readonly keywords = Object.values(KEYWORDS);
  protected readonly cardInfo = CARD_BY_ID;

  /** Il motore muta lo stato sul posto: `rev` avvisa Angular che qualcosa è cambiato. */
  private g: Game | null = null;
  private readonly rev = signal(0);
  protected readonly revision = this.rev.asReadonly();
  protected readonly game = computed(() => (this.rev(), this.g), { equal: () => false });

  protected readonly selected = signal<number | null>(null);
  protected readonly targeting = signal<number | null>(null);
  protected readonly attackers = signal<number[]>([]);
  protected readonly blocks = signal<Record<number, number>>({});
  protected readonly pendingBlocker = signal<number | null>(null);
  protected readonly spotlight = signal<{ id: string; key: number } | null>(null);
  protected readonly stats = signal(readStats());

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  private readonly pickFirst = viewChild<ElementRef<HTMLElement>>('pickFirst');
  private timer: ReturnType<typeof setTimeout> | undefined;
  private spotlightTimer: ReturnType<typeof setTimeout> | undefined;
  private lastFocus: HTMLElement | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      clearTimeout(this.spotlightTimer);
      clearTimeout(this.hitTimer);
    });
  }

  /** Chi ha appena perso vita: il suo riquadro trema per un attimo. */
  protected readonly hit = signal<[boolean, boolean]>([false, false]);
  private lastLife: [number, number] = [0, 0];
  private hitTimer: ReturnType<typeof setTimeout> | undefined;

  private bump(): void {
    this.rev.update((n) => n + 1);
    const g = this.g;
    if (g) {
      const lives: [number, number] = [g.players[0].life, g.players[1].life];
      const hurt: [boolean, boolean] = [lives[0] < this.lastLife[0], lives[1] < this.lastLife[1]];
      this.lastLife = lives;
      if (hurt[0] || hurt[1]) {
        clearTimeout(this.hitTimer);
        this.hit.set(hurt);
        this.hitTimer = setTimeout(() => this.hit.set([false, false]), 220);
      }
    }
    if (g?.winner !== null && g?.winner !== undefined) this.recordResult(g);
  }

  private recorded = false;
  private recordResult(g: Game): void {
    if (this.recorded) return;
    this.recorded = true;
    const s = { ...this.stats() };
    if (g.winner === YOU) s.wins++;
    else if (g.winner === CPU) s.losses++;
    this.stats.set(s);
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(s));
    } catch {
      /* archivio non disponibile */
    }
  }

  /* =========================
     INIZIO PARTITA
     ========================= */

  protected start(era: Era): void {
    const others = ERA_ORDER.filter((e) => e !== era);
    const foe = others[Math.floor(Math.random() * others.length)];
    this.g = newGame([era, foe]);
    this.lastLife = [this.g.players[0].life, this.g.players[1].life];
    this.recorded = false;
    this.resetUi();
    this.bump();
    this.scheduleCpu();
  }

  protected randomDeck(): void {
    this.start(ERA_ORDER[Math.floor(Math.random() * ERA_ORDER.length)]);
  }

  protected backToPick(): void {
    clearTimeout(this.timer);
    this.g = null;
    this.resetUi();
    this.bump();
    queueMicrotask(() => this.pickFirst()?.nativeElement.focus());
  }

  private resetUi(): void {
    this.selected.set(null);
    this.targeting.set(null);
    this.attackers.set([]);
    this.blocks.set({});
    this.pendingBlocker.set(null);
    this.spotlight.set(null);
  }

  /* =========================
     LETTURE PER IL TEMPLATE
     ========================= */

  protected readonly you = computed(() => this.game()?.players[YOU]);
  protected readonly cpu = computed(() => this.game()?.players[CPU]);
  protected readonly yourTurn = computed(
    () => this.game()?.active === YOU && this.game()?.winner === null,
  );
  protected readonly mustBlock = computed(() => {
    const g = this.game();
    return !!g && g.winner === null && g.phase === 'block' && g.active === CPU;
  });

  protected readonly validTargetSet = computed(() => {
    const g = this.game();
    const uid = this.targeting();
    if (!g || uid === null) return null;
    const c = findCard(g, uid);
    return c ? validTargets(g, YOU, def(c)) : [];
  });

  protected hype(pid: PlayerId): { free: number; total: number } {
    const g = this.game()!;
    return { free: untappedLands(g, pid), total: g.players[pid].lands.length };
  }

  protected playable(uid: number): boolean {
    const g = this.game();
    return !!g && this.yourTurn() && this.targeting() === null && canPlay(g, YOU, uid);
  }

  protected isTarget(t: Target): boolean {
    const set = this.validTargetSet();
    if (!set) return false;
    return set.some((x) =>
      x.kind === 'player' && t.kind === 'player'
        ? x.player === t.player
        : x.kind === 'card' && t.kind === 'card' && x.uid === t.uid,
    );
  }

  protected canBeAttacker(c: Card): boolean {
    const g = this.game();
    return !!g && g.phase === 'attack' && this.yourTurn() && canAttack(c);
  }

  protected isAttacking(uid: number): boolean {
    const g = this.game();
    return (g?.attackers.includes(uid) ?? false) || this.attackers().includes(uid);
  }

  /** Chi blocca chi, per disegnare le coppie. */
  protected blockerOf(attacker: number): number | undefined {
    return this.blocks()[attacker];
  }

  protected isBlocking(uid: number): boolean {
    return Object.values(this.blocks()).includes(uid);
  }

  protected selectedCard = computed(() => {
    const g = this.game();
    const uid = this.selected();
    return g && uid !== null ? (findCard(g, uid) ?? null) : null;
  });

  protected readonly phaseLabel = computed(() => {
    const g = this.game();
    if (!g) return '';
    if (g.winner !== null) return 'Partita finita';
    if (g.active === CPU)
      return g.phase === 'block' ? 'La CPU attacca: scegli i bloccanti' : 'Turno della CPU…';
    switch (g.phase) {
      case 'main':
        return 'Tuo turno: gioca carte, poi attacca';
      case 'attack':
        return 'Tocca le creature che attaccano';
      case 'block':
        return 'La CPU sceglie i bloccanti…';
      case 'main2':
        return 'Dopo il combattimento: gioca carte o passa';
    }
  });

  protected readonly blockCount = computed(() => Object.keys(this.blocks()).length);
  protected readonly round = computed(() => Math.ceil((this.game()?.turn ?? 1) / 2));
  protected readonly targetingName = computed(() => {
    const g = this.game();
    const uid = this.targeting();
    const c = g && uid !== null ? findCard(g, uid) : undefined;
    return c ? def(c).name : '';
  });

  protected readonly recentLog = computed(() => this.game()?.log.slice(-4).reverse() ?? []);

  /* =========================
     INTERAZIONI
     ========================= */

  /** Tocco su una carta della mano o del campo. */
  protected tapCard(c: Card, event?: Event): void {
    const g = this.game();
    if (!g || g.winner !== null) {
      this.openDetail(c.uid, event);
      return;
    }

    // Scelta del bersaglio.
    if (this.targeting() !== null) {
      if (this.isTarget({ kind: 'card', uid: c.uid }))
        this.resolveTarget({ kind: 'card', uid: c.uid });
      return;
    }

    // Dichiarazione attaccanti.
    if (
      g.phase === 'attack' &&
      this.yourTurn() &&
      c.owner === YOU &&
      g.players[YOU].creatures.includes(c)
    ) {
      if (!canAttack(c)) return this.openDetail(c.uid, event);
      this.attackers.update((list) =>
        list.includes(c.uid) ? list.filter((u) => u !== c.uid) : [...list, c.uid],
      );
      return;
    }

    // Blocchi: prima il tuo bloccante, poi l'attaccante.
    if (this.mustBlock()) {
      if (c.owner === YOU && g.players[YOU].creatures.includes(c)) {
        if (this.isBlocking(c.uid)) {
          this.blocks.update((b) =>
            Object.fromEntries(Object.entries(b).filter(([, v]) => v !== c.uid)),
          );
          return;
        }
        if (c.tapped) return this.openDetail(c.uid, event);
        this.pendingBlocker.set(this.pendingBlocker() === c.uid ? null : c.uid);
        return;
      }
      const blocker = this.pendingBlocker();
      if (c.owner === CPU && g.attackers.includes(c.uid) && blocker !== null) {
        const b = findCard(g, blocker)!;
        if (canBlock(b, c)) {
          this.blocks.update((m) => ({
            ...Object.fromEntries(Object.entries(m).filter(([, v]) => v !== blocker)),
            [c.uid]: blocker,
          }));
          this.pendingBlocker.set(null);
        }
        return;
      }
    }

    this.openDetail(c.uid, event);
  }

  protected tapPlayer(pid: PlayerId): void {
    if (this.targeting() !== null && this.isTarget({ kind: 'player', player: pid }))
      this.resolveTarget({ kind: 'player', player: pid });
  }

  protected canBlockPending(attacker: Card): boolean {
    const g = this.game();
    const b = this.pendingBlocker();
    if (!g || b === null) return false;
    const blocker = findCard(g, b);
    return !!blocker && canBlock(blocker, attacker);
  }

  protected openDetail(uid: number, event?: Event): void {
    this.lastFocus = (event?.currentTarget as HTMLElement) ?? null;
    this.selected.set(uid);
    queueMicrotask(() => this.dialog()?.nativeElement.focus());
  }

  protected closeDetail(): void {
    this.selected.set(null);
    this.lastFocus?.focus();
  }

  protected playSelected(): void {
    const g = this.g;
    const uid = this.selected();
    if (!g || uid === null) return;
    this.selected.set(null);
    if (needsTarget(g, YOU, uid)) {
      this.targeting.set(uid);
      return;
    }
    play(g, YOU, uid);
    this.bump();
  }

  private resolveTarget(t: Target): void {
    const g = this.g;
    const uid = this.targeting();
    this.targeting.set(null);
    if (!g || uid === null) return;
    play(g, YOU, uid, t);
    this.bump();
  }

  protected cancelTargeting(): void {
    this.targeting.set(null);
  }

  protected goAttack(): void {
    const g = this.g;
    if (!g) return;
    beginAttack(g, YOU);
    this.attackers.set([]);
    this.bump();
  }

  protected confirmAttack(): void {
    const g = this.g;
    if (!g) return;
    declareAttackers(g, YOU, this.attackers());
    this.bump();
    if (g.phase === 'block') {
      // La CPU ci pensa un attimo, poi blocca.
      this.timer = setTimeout(() => {
        declareBlocks(g, CPU, chooseBlocks(g, CPU));
        this.attackers.set([]);
        this.bump();
      }, CPU_DELAY);
    } else {
      this.attackers.set([]);
    }
  }

  protected skipAttack(): void {
    this.attackers.set([]);
    this.confirmAttack();
  }

  protected confirmBlocks(): void {
    const g = this.g;
    if (!g) return;
    declareBlocks(g, YOU, this.blocks());
    this.blocks.set({});
    this.pendingBlocker.set(null);
    this.bump();
    this.scheduleCpu();
  }

  protected endYourTurn(): void {
    const g = this.g;
    if (!g) return;
    endTurn(g, YOU);
    this.bump();
    this.scheduleCpu();
  }

  /* =========================
     TURNO DELLA CPU
     ========================= */

  private scheduleCpu(): void {
    clearTimeout(this.timer);
    const g = this.g;
    if (!g || g.winner !== null || g.active !== CPU || g.phase === 'block') return;
    this.timer = setTimeout(() => this.cpuStep(), CPU_DELAY);
  }

  private cpuStep(): void {
    const g = this.g;
    if (!g || g.winner !== null || g.active !== CPU) return;
    const action = chooseAction(g, CPU);
    if (action.type === 'play') {
      const id = findCard(g, action.uid)?.id;
      play(g, CPU, action.uid, action.target);
      if (id && CARD_BY_ID[id].type !== 'piattaforma') this.showSpotlight(id);
    } else if (action.type === 'attack') {
      declareAttackers(g, CPU, action.uids);
    } else {
      endTurn(g, CPU);
    }
    this.bump();
    this.scheduleCpu();
  }

  private showSpotlight(id: string): void {
    clearTimeout(this.spotlightTimer);
    this.spotlight.set({ id, key: Date.now() });
    this.spotlightTimer = setTimeout(() => this.spotlight.set(null), CPU_DELAY * 1.6);
  }

  protected keydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    if (this.selected() !== null) this.closeDetail();
    else if (this.targeting() !== null) this.cancelTargeting();
    else if (this.pendingBlocker() !== null) this.pendingBlocker.set(null);
  }
}
