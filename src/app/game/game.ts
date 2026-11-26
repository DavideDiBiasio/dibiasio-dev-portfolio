import { Component, DestroyRef, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { GameEvent, Input, Phase, SKILLS, STEP, State, WORLD_H, WORLD_W, createState, start, step, togglePause } from './engine';
import { render } from './render';
import { Sound } from './sound';

const BEST_KEY = 'caccia-al-bug:record';
const MUTE_KEY = 'caccia-al-bug:muto';

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Navigazione privata o archivio bloccato: pazienza. */
  }
}

const KEY_DIR: Record<string, 'left' | 'right'> = {
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
};

interface Summary {
  score: number;
  best: number;
  record: boolean;
  level: number;
  bestCombo: number;
  stack: string[];
  stackDone: boolean;
}

@Component({
  selector: 'app-game',
  templateUrl: './game.html',
  styleUrl: './game.scss',
})
export class Game {
  protected readonly width = WORLD_W;
  protected readonly height = WORLD_H;
  protected readonly skills = SKILLS;

  protected readonly phase = signal<Phase>('ready');
  protected readonly summary = signal<Summary | null>(null);
  protected readonly muted = signal(readStore(MUTE_KEY) === '1');
  protected readonly best = signal(Number(readStore(BEST_KEY)) || 0);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('screen');
  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');

  private state: State = createState();
  private readonly input: Input = { dir: 0, targetX: null };
  private readonly keys = new Set<string>();
  private readonly sound = new Sound();
  private reducedMotion = false;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const ctx = this.canvas().nativeElement.getContext('2d');
      this.reducedMotion = matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      this.sound.enabled = !this.muted();

      let raf = 0;
      let last = performance.now();
      let acc = 0;
      const loop = (now: number) => {
        acc += Math.min(0.25, (now - last) / 1000);
        last = now;
        while (acc >= STEP) {
          this.tick();
          acc -= STEP;
        }
        if (ctx) render(ctx, this.state, this.best());
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      // Se la pagina perde il fuoco o il gioco esce dallo schermo, si mette in pausa da solo.
      const autoPause = () => this.pause();
      const onVisibility = () => document.hidden && autoPause();
      window.addEventListener('blur', autoPause);
      document.addEventListener('visibilitychange', onVisibility);
      const observer = new IntersectionObserver(([entry]) => !entry.isIntersecting && autoPause(), { threshold: 0.4 });
      observer.observe(this.frame().nativeElement);

      destroyRef.onDestroy(() => {
        cancelAnimationFrame(raf);
        window.removeEventListener('blur', autoPause);
        document.removeEventListener('visibilitychange', onVisibility);
        observer.disconnect();
        this.sound.close();
      });
    });
  }

  private tick(): void {
    this.input.dir = (this.keys.has('right') ? 1 : 0) - (this.keys.has('left') ? 1 : 0);
    const events = step(this.state, this.input);
    if (this.reducedMotion) this.state.shake = 0;
    for (const e of events) this.onEvent(e);
  }

  private onEvent(e: GameEvent): void {
    this.sound.play(e);
    if (e === 'over') this.finish();
  }

  private finish(): void {
    const s = this.state;
    const record = s.score > this.best();
    if (record) {
      this.best.set(s.score);
      writeStore(BEST_KEY, String(s.score));
    }
    this.summary.set({
      score: s.score,
      best: this.best(),
      record,
      level: s.level,
      bestCombo: s.bestCombo,
      stack: SKILLS.filter((_, i) => s.stack[i]).map((k) => k.name),
      stackDone: s.stackDone,
    });
    this.phase.set('over');
  }

  /* -------- Azioni dell'interfaccia -------- */

  protected play(): void {
    this.sound.unlock();
    if (this.state.phase === 'over' || this.state.phase === 'ready') {
      this.state = createState();
      this.summary.set(null);
    }
    start(this.state);
    this.keys.clear();
    this.phase.set(this.state.phase);
    this.frame().nativeElement.focus({ preventScroll: true });
  }

  protected pause(): void {
    if (this.state.phase !== 'playing') return;
    togglePause(this.state);
    this.keys.clear();
    this.input.targetX = null;
    this.phase.set(this.state.phase);
  }

  protected toggleMute(): void {
    this.muted.update((m) => !m);
    this.sound.enabled = !this.muted();
    writeStore(MUTE_KEY, this.muted() ? '1' : '0');
  }

  /* -------- Tastiera -------- */

  protected keydown(event: KeyboardEvent): void {
    const playing = this.state.phase === 'playing';
    const dir = KEY_DIR[event.key];

    if (dir) {
      if (!playing) return;
      this.keys.add(dir);
      this.input.targetX = null;
      event.preventDefault();
    } else if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') {
      if (!playing) return;
      this.pause();
      event.preventDefault();
    } else if ((event.key === ' ' || event.key === 'Enter') && event.target === this.frame().nativeElement) {
      event.preventDefault();
      if (playing) this.pause();
      else this.play();
    }
  }

  protected keyup(event: KeyboardEvent): void {
    const dir = KEY_DIR[event.key];
    if (dir) this.keys.delete(dir);
  }

  /* -------- Mouse e tocco -------- */

  protected pointer(event: PointerEvent): void {
    if (this.state.phase !== 'playing') return;
    if (event.pointerType === 'mouse' && event.type === 'pointerdown') return;
    const rect = this.canvas().nativeElement.getBoundingClientRect();
    this.input.targetX = ((event.clientX - rect.left) / rect.width) * WORLD_W;
  }

  protected pointerEnd(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') this.input.targetX = null;
  }
}
