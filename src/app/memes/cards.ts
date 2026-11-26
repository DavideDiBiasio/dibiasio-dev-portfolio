/* =========================
   MEME ARENA — CARTE
   Cinque ere dei meme, cinque mazzi. Ogni era è un "colore":
   le sue piattaforme producono l'hype che serve a giocare le carte.
   ========================= */

export type Era = 'golden' | 'brainrot' | 'boomer' | 'cursed' | 'wholesome';

export type Keyword =
  | 'virale' // può attaccare subito
  | 'tendenza' // può essere bloccata solo da creature in tendenza
  | 'cringe' // qualsiasi danno inflitto a una creatura la distrugge
  | 'cuoricino' // i danni che infligge ti fanno guadagnare altrettanta vita
  | 'travolgente' // il danno in eccesso sul bloccante passa all'avversario
  | 'muro'; // non può attaccare

export const KEYWORDS: Record<Keyword, { label: string; help: string }> = {
  virale: { label: 'Virale', help: 'Può attaccare nel turno in cui entra.' },
  tendenza: { label: 'In tendenza', help: 'Può essere bloccata solo da creature In tendenza.' },
  cringe: { label: 'Cringe', help: 'Qualsiasi danno che infligge a una creatura la distrugge.' },
  cuoricino: { label: 'Cuoricino', help: 'Quando infligge danno, guadagni altrettanta vita.' },
  travolgente: { label: 'Travolgente', help: 'Se bloccata, il danno in più passa all’avversario.' },
  muro: { label: 'Muro', help: 'Non può attaccare.' },
};

/** Chi si può scegliere come bersaglio. */
export type TargetKind = 'any' | 'creature' | 'enemy-creature' | 'own-creature';

export type Effect =
  | { type: 'damage'; amount: number; target: TargetKind }
  | { type: 'damage-all'; amount: number; who: 'enemy' | 'all' }
  | { type: 'destroy'; target: TargetKind; maxAtk?: number }
  | { type: 'bounce'; target: TargetKind }
  | { type: 'freeze'; target: TargetKind }
  | { type: 'tap'; target: TargetKind }
  | { type: 'pump'; atk: number; def: number; target: TargetKind }
  | { type: 'pump-all'; atk: number; def: number }
  | { type: 'draw'; amount: number }
  | { type: 'gain'; amount: number }
  | { type: 'drain'; amount: number }
  | { type: 'tokens'; amount: number; token: string }
  | { type: 'ramp' };

export type CardType = 'piattaforma' | 'meme' | 'trend';

export interface CardDef {
  id: string;
  name: string;
  era: Era;
  type: CardType;
  art: string;
  cost: number;
  atk?: number;
  def?: number;
  keywords?: Keyword[];
  /** Per i meme: effetto quando entrano. Per i trend: l'effetto della carta. */
  effects?: Effect[];
  text?: string;
  /** Una riga di colore, in corsivo sotto il testo. */
  flavor?: string;
  token?: boolean;
}

export interface EraInfo {
  id: Era;
  name: string;
  years: string;
  art: string;
  color: string;
  style: string;
}

export const ERAS: Record<Era, EraInfo> = {
  golden: {
    id: 'golden',
    name: 'Golden Era',
    years: '2008–2014',
    art: '🏆',
    color: '#f5b841',
    style: 'Creature grosse e travolgenti, pedine e piattaforme extra.',
  },
  brainrot: {
    id: 'brainrot',
    name: 'Brainrot',
    years: '2024–oggi',
    art: '🦈',
    color: '#ff6fa5',
    style: 'Aggressivo: creature virali e danni diretti.',
  },
  boomer: {
    id: 'boomer',
    name: 'Boomer',
    years: 'Buongiornissimo',
    art: '☕',
    color: '#8fcbff',
    style: 'Controllo: pesca carte, congela e rimanda in mano.',
  },
  cursed: {
    id: 'cursed',
    name: 'Cursed',
    years: 'Deep fried',
    art: '👁️',
    color: '#c4a8ff',
    style: 'Distrugge creature e ti ruba la vita.',
  },
  wholesome: {
    id: 'wholesome',
    name: 'Wholesome',
    years: 'Cuori ovunque',
    art: '🫶',
    color: '#9fe39a',
    style: 'Guadagna vita e resiste: vince alla distanza.',
  },
};

export const ERA_ORDER: Era[] = ['brainrot', 'golden', 'boomer', 'cursed', 'wholesome'];

const land = (era: Era, name: string, art: string): CardDef => ({
  id: `land-${era}`,
  name,
  era,
  type: 'piattaforma',
  art,
  cost: 0,
  text: `Tappala: +1 hype ${ERAS[era].name}.`,
});

export const CARDS: CardDef[] = [
  /* ---------- GOLDEN ERA ---------- */
  land('golden', 'Forum anni 10', '🏛️'),
  {
    id: 'forever-alone',
    name: 'Forever alone',
    era: 'golden',
    type: 'meme',
    art: '🧍',
    cost: 1,
    atk: 1,
    def: 1,
    effects: [{ type: 'ramp' }],
    text: 'Quando entra: metti in campo una piattaforma dal tuo mazzo.',
    flavor: 'Da solo, ma con tanta connessione.',
  },
  {
    id: 'cane-wow',
    name: 'Cane molto wow',
    era: 'golden',
    type: 'meme',
    art: '🐕',
    cost: 2,
    atk: 2,
    def: 3,
    flavor: 'Tanto blocco. Molto difesa. Wow.',
  },
  {
    id: 'gatto-arcobaleno',
    name: 'Gatto arcobaleno',
    era: 'golden',
    type: 'meme',
    art: '🌈',
    cost: 3,
    atk: 2,
    def: 3,
    keywords: ['tendenza'],
    flavor: 'Vola su un loop di otto secondi.',
  },
  {
    id: 'epic-fail',
    name: 'Epic fail',
    era: 'golden',
    type: 'trend',
    art: '🤦',
    cost: 2,
    effects: [{ type: 'damage', amount: 3, target: 'enemy-creature' }],
    text: '3 danni a una creatura avversaria.',
    flavor: 'Caricato in 240p, visto da milioni.',
  },
  {
    id: 'like-a-boss',
    name: 'Like a boss',
    era: 'golden',
    type: 'meme',
    art: '😎',
    cost: 4,
    atk: 4,
    def: 4,
    keywords: ['travolgente'],
  },
  {
    id: 'oltre-9000',
    name: 'Oltre 9000',
    era: 'golden',
    type: 'meme',
    art: '⚡',
    cost: 5,
    atk: 6,
    def: 5,
    keywords: ['travolgente'],
    flavor: 'Il livello di potenza non entra nella carta.',
  },
  {
    id: 'epic-win',
    name: 'Epic win',
    era: 'golden',
    type: 'trend',
    art: '🥇',
    cost: 1,
    effects: [{ type: 'pump', atk: 3, def: 3, target: 'own-creature' }],
    text: 'Una tua creatura prende +3/+3 fino a fine turno.',
  },
  {
    id: 'stonks',
    name: 'Stonks',
    era: 'golden',
    type: 'trend',
    art: '📈',
    cost: 2,
    effects: [{ type: 'ramp' }, { type: 'draw', amount: 1 }],
    text: 'Metti in campo una piattaforma dal mazzo. Pesca una carta.',
  },
  {
    id: 'flash-mob',
    name: 'Flash mob',
    era: 'golden',
    type: 'trend',
    art: '🕺',
    cost: 3,
    effects: [{ type: 'tokens', amount: 3, token: 'ballerino' }],
    text: 'Crea tre pedine Ballerino 1/1.',
  },
  {
    id: 'ballerino',
    name: 'Ballerino',
    era: 'golden',
    type: 'meme',
    art: '🕺',
    cost: 0,
    atk: 1,
    def: 1,
    token: true,
  },

  /* ---------- BRAINROT ---------- */
  land('brainrot', 'Feed infinito', '📱'),
  {
    id: 'squalo-scarpe',
    name: 'Squalo con le scarpe',
    era: 'brainrot',
    type: 'meme',
    art: '🦈',
    cost: 1,
    atk: 2,
    def: 1,
    keywords: ['virale'],
    flavor: 'Corre sulla spiaggia. Nessuno sa perché.',
  },
  {
    id: 'ballerina-tazzina',
    name: 'Ballerina tazzina',
    era: 'brainrot',
    type: 'meme',
    art: '🩰',
    cost: 2,
    atk: 2,
    def: 2,
    effects: [{ type: 'damage', amount: 1, target: 'any' }],
    text: 'Quando entra: 1 danno a un bersaglio a scelta.',
  },
  {
    id: 'gatto-gambero',
    name: 'Gatto-gambero',
    era: 'brainrot',
    type: 'meme',
    art: '🦐',
    cost: 2,
    atk: 3,
    def: 1,
    flavor: 'Metà gatto, metà gambero, zero spiegazioni.',
  },
  {
    id: 'tung-tung',
    name: 'Tung tung tung',
    era: 'brainrot',
    type: 'meme',
    art: '🪵',
    cost: 3,
    atk: 3,
    def: 2,
    keywords: ['virale'],
    flavor: 'Bussa tre volte. Poi entra lo stesso.',
  },
  {
    id: 'coccodrillo-bombardiere',
    name: 'Coccodrillo bombardiere',
    era: 'brainrot',
    type: 'meme',
    art: '🐊',
    cost: 4,
    atk: 3,
    def: 3,
    keywords: ['tendenza'],
    effects: [{ type: 'damage', amount: 2, target: 'enemy-creature' }],
    text: 'Quando entra: 2 danni a una creatura avversaria.',
  },
  {
    id: 'elefante-cactus',
    name: 'Elefante cactus',
    era: 'brainrot',
    type: 'meme',
    art: '🐘',
    cost: 5,
    atk: 5,
    def: 4,
    keywords: ['travolgente'],
    flavor: 'Pungente fuori, pesante dentro.',
  },
  {
    id: 'ragebait',
    name: 'Commento ragebait',
    era: 'brainrot',
    type: 'trend',
    art: '😡',
    cost: 1,
    effects: [{ type: 'damage', amount: 2, target: 'any' }],
    text: '2 danni a un bersaglio a scelta.',
  },
  {
    id: 'esplosione-virale',
    name: 'Esplosione virale',
    era: 'brainrot',
    type: 'trend',
    art: '💥',
    cost: 4,
    effects: [{ type: 'damage', amount: 4, target: 'any' }],
    text: '4 danni a un bersaglio a scelta.',
  },
  {
    id: 'scroll-notturno',
    name: 'Scroll alle 3 di notte',
    era: 'brainrot',
    type: 'trend',
    art: '🌀',
    cost: 3,
    effects: [{ type: 'pump-all', atk: 2, def: 0 }],
    text: 'Le tue creature prendono +2/+0 fino a fine turno.',
  },

  /* ---------- BOOMER ---------- */
  land('boomer', 'Chat di famiglia', '💬'),
  {
    id: 'buongiornissimo',
    name: 'Buongiornissimo',
    era: 'boomer',
    type: 'trend',
    art: '☕',
    cost: 1,
    effects: [
      { type: 'draw', amount: 1 },
      { type: 'gain', amount: 1 },
    ],
    text: 'Pesca una carta. Guadagni 1 vita.',
    flavor: 'Kaffè?',
  },
  {
    id: 'zio-catene',
    name: 'Zio delle catene',
    era: 'boomer',
    type: 'meme',
    art: '📩',
    cost: 2,
    atk: 1,
    def: 3,
    effects: [{ type: 'draw', amount: 1 }],
    text: 'Quando entra: pesca una carta.',
    flavor: 'Inoltralo a dieci persone o niente fortuna.',
  },
  {
    id: 'gif-glitter',
    name: 'Gif glitterata',
    era: 'boomer',
    type: 'meme',
    art: '✨',
    cost: 2,
    atk: 2,
    def: 1,
    keywords: ['tendenza'],
  },
  {
    id: 'rosa-buongiorno',
    name: 'Rosa del buongiorno',
    era: 'boomer',
    type: 'meme',
    art: '🌹',
    cost: 3,
    atk: 2,
    def: 3,
    keywords: ['tendenza'],
    effects: [{ type: 'tap', target: 'enemy-creature' }],
    text: 'Quando entra: tappa una creatura avversaria.',
  },
  {
    id: 'alba-5',
    name: 'Account delle 5 del mattino',
    era: 'boomer',
    type: 'meme',
    art: '🌅',
    cost: 4,
    atk: 3,
    def: 3,
    keywords: ['tendenza'],
    flavor: 'Posta prima che sorga il sole. Ogni giorno.',
  },
  {
    id: 're-forward',
    name: 'Il re dell’inoltro',
    era: 'boomer',
    type: 'meme',
    art: '👴',
    cost: 6,
    atk: 5,
    def: 5,
    keywords: ['tendenza'],
    effects: [{ type: 'draw', amount: 2 }],
    text: 'Quando entra: pesca due carte.',
  },
  {
    id: 'notizia-falsa',
    name: 'Notizia falsa',
    era: 'boomer',
    type: 'trend',
    art: '📰',
    cost: 2,
    effects: [{ type: 'bounce', target: 'creature' }],
    text: 'Rimanda una creatura in mano al suo proprietario.',
    flavor: 'Condiviso 40.000 volte prima della smentita.',
  },
  {
    id: 'vocale-lungo',
    name: 'Vocale da 10 minuti',
    era: 'boomer',
    type: 'trend',
    art: '🎙️',
    cost: 3,
    effects: [
      { type: 'freeze', target: 'enemy-creature' },
      { type: 'draw', amount: 1 },
    ],
    text: 'Tappa una creatura avversaria: non si stappa al prossimo turno. Pesca una carta.',
  },
  {
    id: 'condividi',
    name: 'Condividi se sei d’accordo',
    era: 'boomer',
    type: 'trend',
    art: '🔁',
    cost: 3,
    effects: [{ type: 'draw', amount: 2 }],
    text: 'Pesca due carte.',
  },

  /* ---------- CURSED ---------- */
  land('cursed', 'Cartella maledetta', '🗂️'),
  {
    id: 'occhio-fritto',
    name: 'Occhio fritto',
    era: 'cursed',
    type: 'meme',
    art: '👁️',
    cost: 1,
    atk: 1,
    def: 1,
    keywords: ['cringe'],
    flavor: 'Saturazione al 2000%.',
  },
  {
    id: 'faccia-sciolta',
    name: 'Faccia che si scioglie',
    era: 'cursed',
    type: 'meme',
    art: '🫠',
    cost: 2,
    atk: 2,
    def: 2,
    effects: [{ type: 'drain', amount: 1 }],
    text: 'Quando entra: l’avversario perde 1 vita e tu ne guadagni 1.',
  },
  {
    id: 'ancora-aspetto',
    name: 'Ancora in attesa di risposta',
    era: 'cursed',
    type: 'meme',
    art: '🪦',
    cost: 3,
    atk: 2,
    def: 3,
    keywords: ['cringe'],
    flavor: '“Visualizzato” dal 2019.',
  },
  {
    id: 'meme-fritto',
    name: 'Meme fritto 9000',
    era: 'cursed',
    type: 'meme',
    art: '🍳',
    cost: 4,
    atk: 3,
    def: 2,
    keywords: ['tendenza', 'cringe'],
  },
  {
    id: 'entita',
    name: 'L’entità',
    era: 'cursed',
    type: 'meme',
    art: '🕳️',
    cost: 6,
    atk: 5,
    def: 5,
    keywords: ['cringe'],
    effects: [{ type: 'drain', amount: 3 }],
    text: 'Quando entra: l’avversario perde 3 vite e tu ne guadagni 3.',
  },
  {
    id: 'immagine-maledetta',
    name: 'Immagine maledetta',
    era: 'cursed',
    type: 'trend',
    art: '🖼️',
    cost: 2,
    effects: [{ type: 'destroy', target: 'enemy-creature', maxAtk: 3 }],
    text: 'Distruggi una creatura avversaria con attacco 3 o meno.',
  },
  {
    id: 'audio-distorto',
    name: 'Audio distorto',
    era: 'cursed',
    type: 'trend',
    art: '🔊',
    cost: 3,
    effects: [
      { type: 'damage-all', amount: 1, who: 'all' },
      { type: 'drain', amount: 1 },
    ],
    text: '1 danno a ogni creatura. L’avversario perde 1 vita e tu ne guadagni 1.',
  },
  {
    id: 'maledizione',
    name: 'Sei stato maledetto',
    era: 'cursed',
    type: 'trend',
    art: '💀',
    cost: 4,
    effects: [{ type: 'destroy', target: 'enemy-creature' }],
    text: 'Distruggi una creatura avversaria.',
  },
  {
    id: 'jumpscare',
    name: 'Jumpscare',
    era: 'cursed',
    type: 'trend',
    art: '😱',
    cost: 1,
    effects: [
      { type: 'tap', target: 'enemy-creature' },
      { type: 'drain', amount: 1 },
    ],
    text: 'Tappa una creatura avversaria. L’avversario perde 1 vita e tu ne guadagni 1.',
  },

  /* ---------- WHOLESOME ---------- */
  land('wholesome', 'Bacheca wholesome', '🧸'),
  {
    id: 'cagnolino',
    name: 'Cagnolino che sorride',
    era: 'wholesome',
    type: 'meme',
    art: '🐶',
    cost: 1,
    atk: 1,
    def: 2,
    keywords: ['cuoricino'],
  },
  {
    id: 'gatto-scatola',
    name: 'Gatto nella scatola',
    era: 'wholesome',
    type: 'meme',
    art: '📦',
    cost: 2,
    atk: 2,
    def: 2,
    effects: [{ type: 'gain', amount: 2 }],
    text: 'Quando entra: guadagni 2 vite.',
    flavor: 'Se ci sta, ci si siede.',
  },
  {
    id: 'nonna',
    name: 'Nonna che cucina troppo',
    era: 'wholesome',
    type: 'meme',
    art: '👵',
    cost: 3,
    atk: 1,
    def: 5,
    keywords: ['muro'],
    effects: [{ type: 'gain', amount: 3 }],
    text: 'Quando entra: guadagni 3 vite.',
    flavor: '“Mangia, che sei sciupato.”',
  },
  {
    id: 'golden-retriever',
    name: 'Golden retriever',
    era: 'wholesome',
    type: 'meme',
    art: '🦮',
    cost: 4,
    atk: 3,
    def: 4,
    keywords: ['cuoricino'],
  },
  {
    id: 'angelo-thread',
    name: 'Angelo del thread',
    era: 'wholesome',
    type: 'meme',
    art: '😇',
    cost: 5,
    atk: 4,
    def: 4,
    keywords: ['tendenza', 'cuoricino'],
    flavor: 'Risponde a tutti. Con gentilezza.',
  },
  {
    id: 'raccolta-fondi',
    name: 'Raccolta fondi virale',
    era: 'wholesome',
    type: 'trend',
    art: '🙌',
    cost: 1,
    effects: [{ type: 'gain', amount: 4 }],
    text: 'Guadagni 4 vite.',
  },
  {
    id: 'abbraccio',
    name: 'Abbraccio di gruppo',
    era: 'wholesome',
    type: 'trend',
    art: '🫂',
    cost: 2,
    effects: [
      { type: 'pump-all', atk: 1, def: 1 },
      { type: 'gain', amount: 2 },
    ],
    text: 'Le tue creature prendono +1/+1 fino a fine turno. Guadagni 2 vite.',
  },
  {
    id: 'segnalazione',
    name: 'Segnalazione',
    era: 'wholesome',
    type: 'trend',
    art: '🚩',
    cost: 2,
    effects: [{ type: 'freeze', target: 'enemy-creature' }],
    text: 'Tappa una creatura avversaria: non si stappa al prossimo turno.',
  },
  {
    id: 'gesto-gentile',
    name: 'Gesto gentile',
    era: 'wholesome',
    type: 'trend',
    art: '💌',
    cost: 3,
    effects: [
      { type: 'bounce', target: 'enemy-creature' },
      { type: 'gain', amount: 2 },
    ],
    text: 'Rimanda in mano una creatura avversaria. Guadagni 2 vite.',
  },
];

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

/** Un mazzo da 30: 12 piattaforme e due copie di ogni altra carta dell'era. */
export function deckList(era: Era): string[] {
  const list: string[] = Array.from({ length: 12 }, () => `land-${era}`);
  for (const c of CARDS) {
    if (c.era === era && c.type !== 'piattaforma' && !c.token) list.push(c.id, c.id);
  }
  return list;
}
