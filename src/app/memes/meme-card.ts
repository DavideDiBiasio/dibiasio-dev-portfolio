import { Component, computed, input } from '@angular/core';
import { CARD_BY_ID, ERAS, KEYWORDS } from './cards';
import { Card, atk, toughness } from './engine';

/** Una carta, in piccolo (mano e campo) o in grande (dettaglio). */
@Component({
  selector: 'app-meme-card',
  template: `
    @let d = info();
    <div
      class="mc"
      [class.mc--big]="big()"
      [class.mc--tapped]="stats().tapped"
      [class.mc--trend]="d.type === 'trend'"
      [class.mc--land]="d.type === 'piattaforma'"
      [style.--era]="era().color"
    >
      <div class="mc__top">
        <span class="mc__name">{{ d.name }}</span>
        @if (d.type !== 'piattaforma' && !d.token) {
          <span class="mc__cost" [attr.aria-label]="'Costo ' + d.cost">{{ d.cost }}</span>
        }
      </div>

      <div class="mc__art" aria-hidden="true">
        {{ d.art }}
        @if (stats().sick && d.type === 'meme' && !d.keywords?.includes('virale')) {
          <span class="mc__sick" title="Appena entrata">💤</span>
        }
      </div>

      <p class="mc__type">
        {{
          d.type === 'meme'
            ? d.token
              ? 'Pedina'
              : 'Meme'
            : d.type === 'trend'
              ? 'Trend'
              : 'Piattaforma'
        }}
        · {{ era().name }}
      </p>

      @if (d.keywords?.length) {
        <p class="mc__keywords">
          @for (k of d.keywords; track k) {
            <span>{{ keywords[k].label }}</span>
          }
        </p>
      }

      @if (big()) {
        @if (d.text) {
          <p class="mc__text">{{ d.text }}</p>
        }
        @for (k of d.keywords ?? []; track k) {
          <p class="mc__text">
            <strong>{{ keywords[k].label }}:</strong> {{ keywords[k].help }}
          </p>
        }
        @if (d.flavor) {
          <p class="mc__flavor">{{ d.flavor }}</p>
        }
      }

      @if (d.type === 'meme') {
        <p
          class="mc__stats"
          [class.mc__stats--up]="stats().up"
          [class.mc__stats--hurt]="stats().hurt"
        >
          {{ stats().atk }}/{{ stats().def }}
        </p>
      }
    </div>
  `,
  styleUrl: './meme-card.scss',
})
export class MemeCard {
  readonly id = input.required<string>();
  readonly card = input<Card | null>(null);
  readonly big = input(false);
  /**
   * Il motore modifica le carte sul posto: lo stesso oggetto non farebbe
   * ridisegnare nulla. Il contatore di versione della partita sì.
   */
  readonly rev = input(0);

  protected readonly keywords = KEYWORDS;
  protected readonly info = computed(() => CARD_BY_ID[this.id()]);
  protected readonly era = computed(() => ERAS[this.info().era]);

  /** Valori attuali: con bonus e danni, se la carta è in gioco. */
  protected readonly stats = computed(() => {
    this.rev();
    const d = this.info();
    const c = this.card();
    if (!c)
      return {
        atk: d.atk ?? 0,
        def: d.def ?? 0,
        up: false,
        hurt: false,
        tapped: false,
        sick: false,
      };
    const left = toughness(c) - c.damage;
    return {
      atk: atk(c),
      def: left,
      up: c.bonusAtk > 0 || c.bonusDef > 0,
      hurt: c.damage > 0,
      tapped: c.tapped,
      sick: c.sick,
    };
  });
}
