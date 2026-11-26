/* =========================
   CACCIA AL BUG — SUONI
   Effetti chiptune generati al volo con Web Audio: nessun file da scaricare.
   ========================= */

import { GameEvent } from './engine';

type Note = [freq: number, dur: number];

const SOUNDS: Partial<Record<GameEvent, { wave: OscillatorType; notes: Note[]; gain: number }>> = {
  catch: { wave: 'square', notes: [[880, 0.05], [1320, 0.06]], gain: 0.05 },
  bug: { wave: 'sawtooth', notes: [[220, 0.08], [140, 0.14]], gain: 0.07 },
  miss: { wave: 'triangle', notes: [[330, 0.06], [262, 0.08]], gain: 0.05 },
  coffee: { wave: 'triangle', notes: [[523, 0.07], [659, 0.07], [784, 0.1]], gain: 0.07 },
  heart: { wave: 'triangle', notes: [[659, 0.07], [988, 0.12]], gain: 0.07 },
  level: { wave: 'square', notes: [[523, 0.06], [784, 0.06], [1047, 0.12]], gain: 0.04 },
  stack: { wave: 'square', notes: [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.2]], gain: 0.05 },
  over: { wave: 'triangle', notes: [[392, 0.15], [330, 0.15], [262, 0.3]], gain: 0.08 },
};

export class Sound {
  private ctx: AudioContext | null = null;
  enabled = true;

  /** I browser sbloccano l'audio solo dopo un gesto dell'utente. */
  unlock(): void {
    if (this.ctx || typeof AudioContext === 'undefined') return;
    try {
      this.ctx = new AudioContext();
    } catch {
      this.ctx = null;
    }
  }

  play(event: GameEvent): void {
    const sfx = SOUNDS[event];
    const ctx = this.ctx;
    if (!sfx || !ctx || !this.enabled) return;
    if (ctx.state === 'suspended') void ctx.resume();

    let t = ctx.currentTime;
    for (const [freq, dur] of sfx.notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = sfx.wave;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(sfx.gain, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
      t += dur * 0.9;
    }
  }

  close(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
