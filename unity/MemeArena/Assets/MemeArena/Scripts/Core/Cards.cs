// =========================
// MEME ARENA — CARTE
// Cinque ere dei meme, cinque mazzi. Ogni era è un "colore":
// le sue piattaforme producono l'hype che serve a giocare le carte.
// Le carte sono dati: un solo interprete (Engine.Resolve) le fa funzionare tutte.
// =========================

using System.Collections.Generic;
using System.Linq;

namespace MemeArena.Core
{
    public enum Era { Golden, Brainrot, Boomer, Cursed, Wholesome }

    public enum Keyword
    {
        Virale,      // può attaccare subito
        Tendenza,    // può essere bloccata solo da creature in tendenza
        Cringe,      // qualsiasi danno inflitto a una creatura la distrugge
        Cuoricino,   // i danni che infligge ti fanno guadagnare altrettanta vita
        Travolgente, // il danno in eccesso sul bloccante passa all'avversario
        Muro,        // non può attaccare
    }

    public enum CardType { Piattaforma, Meme, Trend }

    /// <summary>Chi si può scegliere come bersaglio.</summary>
    public enum TargetKind { None, Any, Creature, EnemyCreature, OwnCreature }

    public enum EffectType { Damage, DamageAll, Destroy, Bounce, Freeze, Tap, Pump, PumpAll, Draw, Gain, Drain, Tokens, Ramp }

    public enum Who { Enemy, All }

    public sealed class Effect
    {
        public EffectType Type;
        public int Amount;
        public TargetKind Target = TargetKind.None;
        public Who Who = Who.Enemy;
        /// <summary>Per "distruggi": solo creature con attacco al massimo così. -1 = nessun limite.</summary>
        public int MaxAtk = -1;
        public int Atk;
        public int Def;
        public string Token;

        public bool HasTarget => Target != TargetKind.None;

        public static Effect Damage(int n, TargetKind t) => new Effect { Type = EffectType.Damage, Amount = n, Target = t };
        public static Effect DamageAll(int n, Who who) => new Effect { Type = EffectType.DamageAll, Amount = n, Who = who };
        public static Effect Destroy(TargetKind t, int maxAtk = -1) => new Effect { Type = EffectType.Destroy, Target = t, MaxAtk = maxAtk };
        public static Effect Bounce(TargetKind t) => new Effect { Type = EffectType.Bounce, Target = t };
        public static Effect Freeze(TargetKind t) => new Effect { Type = EffectType.Freeze, Target = t };
        public static Effect Tap(TargetKind t) => new Effect { Type = EffectType.Tap, Target = t };
        public static Effect Pump(int atk, int def, TargetKind t) => new Effect { Type = EffectType.Pump, Atk = atk, Def = def, Target = t };
        public static Effect PumpAll(int atk, int def) => new Effect { Type = EffectType.PumpAll, Atk = atk, Def = def };
        public static Effect Draw(int n) => new Effect { Type = EffectType.Draw, Amount = n };
        public static Effect Gain(int n) => new Effect { Type = EffectType.Gain, Amount = n };
        public static Effect Drain(int n) => new Effect { Type = EffectType.Drain, Amount = n };
        public static Effect Tokens(int n, string token) => new Effect { Type = EffectType.Tokens, Amount = n, Token = token };
        public static Effect Ramp() => new Effect { Type = EffectType.Ramp };
    }

    public sealed class CardDef
    {
        public string Id;
        public string Name;
        public Era Era;
        public CardType Type;
        public int Cost;
        public int Atk;
        public int Def;
        public Keyword[] Keywords = new Keyword[0];
        /// <summary>Per i meme: effetto quando entrano. Per i trend: l'effetto della carta.</summary>
        public Effect[] Effects = new Effect[0];
        public string Text = "";
        public string Flavor = "";
        public bool Token;

        public bool Has(Keyword k) => Keywords.Contains(k);
    }

    public sealed class EraInfo
    {
        public Era Id;
        public string Name;
        public string Years;
        public string Color;
        public string Style;
    }

    public static class KeywordInfo
    {
        public static string Label(Keyword k) => k switch
        {
            Keyword.Virale => "Virale",
            Keyword.Tendenza => "In tendenza",
            Keyword.Cringe => "Cringe",
            Keyword.Cuoricino => "Cuoricino",
            Keyword.Travolgente => "Travolgente",
            _ => "Muro",
        };

        public static string Help(Keyword k) => k switch
        {
            Keyword.Virale => "Può attaccare nel turno in cui entra.",
            Keyword.Tendenza => "Può essere bloccata solo da creature In tendenza.",
            Keyword.Cringe => "Qualsiasi danno che infligge a una creatura la distrugge.",
            Keyword.Cuoricino => "Quando infligge danno, guadagni altrettanta vita.",
            Keyword.Travolgente => "Se bloccata, il danno in più passa all'avversario.",
            _ => "Non può attaccare.",
        };
    }

    public static class Cards
    {
        public static readonly Dictionary<Era, EraInfo> Eras = new Dictionary<Era, EraInfo>
        {
            [Era.Golden] = new EraInfo { Id = Era.Golden, Name = "Golden Era", Years = "2008–2014", Color = "#f5b841", Style = "Creature grosse e travolgenti, pedine e piattaforme extra." },
            [Era.Brainrot] = new EraInfo { Id = Era.Brainrot, Name = "Brainrot", Years = "2024–oggi", Color = "#ff6fa5", Style = "Aggressivo: creature virali e danni diretti." },
            [Era.Boomer] = new EraInfo { Id = Era.Boomer, Name = "Boomer", Years = "Buongiornissimo", Color = "#8fcbff", Style = "Controllo: pesca carte, congela e rimanda in mano." },
            [Era.Cursed] = new EraInfo { Id = Era.Cursed, Name = "Cursed", Years = "Deep fried", Color = "#c4a8ff", Style = "Distrugge creature e ti ruba la vita." },
            [Era.Wholesome] = new EraInfo { Id = Era.Wholesome, Name = "Wholesome", Years = "Cuori ovunque", Color = "#9fe39a", Style = "Guadagna vita e resiste: vince alla distanza." },
        };

        public static readonly Era[] EraOrder = { Era.Brainrot, Era.Golden, Era.Boomer, Era.Cursed, Era.Wholesome };

        public static string LandId(Era era) => "land-" + era.ToString().ToLowerInvariant();

        static CardDef Land(Era era, string name) => new CardDef
        {
            Id = LandId(era), Name = name, Era = era, Type = CardType.Piattaforma,
            Text = "Tappala: +1 hype " + Eras[era].Name + ".",
        };

        static CardDef Meme(string id, string name, Era era, int cost, int atk, int def, Keyword[] kw = null, Effect[] fx = null, string text = "", string flavor = "", bool token = false) => new CardDef
        {
            Id = id, Name = name, Era = era, Type = CardType.Meme, Cost = cost, Atk = atk, Def = def,
            Keywords = kw ?? new Keyword[0], Effects = fx ?? new Effect[0], Text = text, Flavor = flavor, Token = token,
        };

        static CardDef Trend(string id, string name, Era era, int cost, Effect[] fx, string text, string flavor = "") => new CardDef
        {
            Id = id, Name = name, Era = era, Type = CardType.Trend, Cost = cost, Effects = fx, Text = text, Flavor = flavor,
        };

        static Keyword[] K(params Keyword[] k) => k;
        static Effect[] F(params Effect[] f) => f;

        public static readonly List<CardDef> All = new List<CardDef>
        {
            // ---------- GOLDEN ERA ----------
            Land(Era.Golden, "Forum anni 10"),
            Meme("forever-alone", "Forever alone", Era.Golden, 1, 1, 1, fx: F(Effect.Ramp()), text: "Quando entra: metti in campo una piattaforma dal tuo mazzo.", flavor: "Da solo, ma con tanta connessione."),
            Meme("cane-wow", "Cane molto wow", Era.Golden, 2, 2, 3, flavor: "Tanto blocco. Molto difesa. Wow."),
            Meme("gatto-arcobaleno", "Gatto arcobaleno", Era.Golden, 3, 2, 3, K(Keyword.Tendenza), flavor: "Vola su un loop di otto secondi."),
            Trend("epic-fail", "Epic fail", Era.Golden, 2, F(Effect.Damage(3, TargetKind.EnemyCreature)), "3 danni a una creatura avversaria.", "Caricato in 240p, visto da milioni."),
            Meme("like-a-boss", "Like a boss", Era.Golden, 4, 4, 4, K(Keyword.Travolgente)),
            Meme("oltre-9000", "Oltre 9000", Era.Golden, 5, 6, 5, K(Keyword.Travolgente), flavor: "Il livello di potenza non entra nella carta."),
            Trend("epic-win", "Epic win", Era.Golden, 1, F(Effect.Pump(3, 3, TargetKind.OwnCreature)), "Una tua creatura prende +3/+3 fino a fine turno."),
            Trend("stonks", "Stonks", Era.Golden, 2, F(Effect.Ramp(), Effect.Draw(1)), "Metti in campo una piattaforma dal mazzo. Pesca una carta."),
            Trend("flash-mob", "Flash mob", Era.Golden, 3, F(Effect.Tokens(3, "ballerino")), "Crea tre pedine Ballerino 1/1."),
            Meme("ballerino", "Ballerino", Era.Golden, 0, 1, 1, token: true),

            // ---------- BRAINROT ----------
            Land(Era.Brainrot, "Feed infinito"),
            Meme("squalo-scarpe", "Squalo con le scarpe", Era.Brainrot, 1, 2, 1, K(Keyword.Virale), flavor: "Corre sulla spiaggia. Nessuno sa perché."),
            Meme("ballerina-tazzina", "Ballerina tazzina", Era.Brainrot, 2, 2, 2, fx: F(Effect.Damage(1, TargetKind.Any)), text: "Quando entra: 1 danno a un bersaglio a scelta."),
            Meme("gatto-gambero", "Gatto-gambero", Era.Brainrot, 2, 3, 1, flavor: "Metà gatto, metà gambero, zero spiegazioni."),
            Meme("tung-tung", "Tung tung tung", Era.Brainrot, 3, 3, 2, K(Keyword.Virale), flavor: "Bussa tre volte. Poi entra lo stesso."),
            Meme("coccodrillo-bombardiere", "Coccodrillo bombardiere", Era.Brainrot, 4, 3, 3, K(Keyword.Tendenza), F(Effect.Damage(2, TargetKind.EnemyCreature)), "Quando entra: 2 danni a una creatura avversaria."),
            Meme("elefante-cactus", "Elefante cactus", Era.Brainrot, 5, 5, 4, K(Keyword.Travolgente), flavor: "Pungente fuori, pesante dentro."),
            Trend("ragebait", "Commento ragebait", Era.Brainrot, 1, F(Effect.Damage(2, TargetKind.Any)), "2 danni a un bersaglio a scelta."),
            Trend("esplosione-virale", "Esplosione virale", Era.Brainrot, 4, F(Effect.Damage(4, TargetKind.Any)), "4 danni a un bersaglio a scelta."),
            Trend("scroll-notturno", "Scroll alle 3 di notte", Era.Brainrot, 3, F(Effect.PumpAll(2, 0)), "Le tue creature prendono +2/+0 fino a fine turno."),

            // ---------- BOOMER ----------
            Land(Era.Boomer, "Chat di famiglia"),
            Trend("buongiornissimo", "Buongiornissimo", Era.Boomer, 1, F(Effect.Draw(1), Effect.Gain(1)), "Pesca una carta. Guadagni 1 vita.", "Kaffè?"),
            Meme("zio-catene", "Zio delle catene", Era.Boomer, 2, 1, 3, fx: F(Effect.Draw(1)), text: "Quando entra: pesca una carta.", flavor: "Inoltralo a dieci persone o niente fortuna."),
            Meme("gif-glitter", "Gif glitterata", Era.Boomer, 2, 2, 1, K(Keyword.Tendenza)),
            Meme("rosa-buongiorno", "Rosa del buongiorno", Era.Boomer, 3, 2, 3, K(Keyword.Tendenza), F(Effect.Tap(TargetKind.EnemyCreature)), "Quando entra: tappa una creatura avversaria."),
            Meme("alba-5", "Account delle 5 del mattino", Era.Boomer, 4, 3, 3, K(Keyword.Tendenza), flavor: "Posta prima che sorga il sole. Ogni giorno."),
            Meme("re-forward", "Il re dell'inoltro", Era.Boomer, 6, 5, 5, K(Keyword.Tendenza), F(Effect.Draw(2)), "Quando entra: pesca due carte."),
            Trend("notizia-falsa", "Notizia falsa", Era.Boomer, 2, F(Effect.Bounce(TargetKind.Creature)), "Rimanda una creatura in mano al suo proprietario.", "Condiviso 40.000 volte prima della smentita."),
            Trend("vocale-lungo", "Vocale da 10 minuti", Era.Boomer, 3, F(Effect.Freeze(TargetKind.EnemyCreature), Effect.Draw(1)), "Tappa una creatura avversaria: non si stappa al prossimo turno. Pesca una carta."),
            Trend("condividi", "Condividi se sei d'accordo", Era.Boomer, 3, F(Effect.Draw(2)), "Pesca due carte."),

            // ---------- CURSED ----------
            Land(Era.Cursed, "Cartella maledetta"),
            Meme("occhio-fritto", "Occhio fritto", Era.Cursed, 1, 1, 1, K(Keyword.Cringe), flavor: "Saturazione al 2000%."),
            Meme("faccia-sciolta", "Faccia che si scioglie", Era.Cursed, 2, 2, 2, fx: F(Effect.Drain(1)), text: "Quando entra: l'avversario perde 1 vita e tu ne guadagni 1."),
            Meme("ancora-aspetto", "Ancora in attesa di risposta", Era.Cursed, 3, 2, 3, K(Keyword.Cringe), flavor: "“Visualizzato” dal 2019."),
            Meme("meme-fritto", "Meme fritto 9000", Era.Cursed, 4, 3, 2, K(Keyword.Tendenza, Keyword.Cringe)),
            Meme("entita", "L'entità", Era.Cursed, 6, 5, 5, K(Keyword.Cringe), F(Effect.Drain(3)), "Quando entra: l'avversario perde 3 vite e tu ne guadagni 3."),
            Trend("immagine-maledetta", "Immagine maledetta", Era.Cursed, 2, F(Effect.Destroy(TargetKind.EnemyCreature, 3)), "Distruggi una creatura avversaria con attacco 3 o meno."),
            Trend("audio-distorto", "Audio distorto", Era.Cursed, 3, F(Effect.DamageAll(1, Who.All), Effect.Drain(1)), "1 danno a ogni creatura. L'avversario perde 1 vita e tu ne guadagni 1."),
            Trend("maledizione", "Sei stato maledetto", Era.Cursed, 4, F(Effect.Destroy(TargetKind.EnemyCreature)), "Distruggi una creatura avversaria."),
            Trend("jumpscare", "Jumpscare", Era.Cursed, 1, F(Effect.Tap(TargetKind.EnemyCreature), Effect.Drain(1)), "Tappa una creatura avversaria. L'avversario perde 1 vita e tu ne guadagni 1."),

            // ---------- WHOLESOME ----------
            Land(Era.Wholesome, "Bacheca wholesome"),
            Meme("cagnolino", "Cagnolino che sorride", Era.Wholesome, 1, 1, 2, K(Keyword.Cuoricino)),
            Meme("gatto-scatola", "Gatto nella scatola", Era.Wholesome, 2, 2, 2, fx: F(Effect.Gain(2)), text: "Quando entra: guadagni 2 vite.", flavor: "Se ci sta, ci si siede."),
            Meme("nonna", "Nonna che cucina troppo", Era.Wholesome, 3, 1, 5, K(Keyword.Muro), F(Effect.Gain(3)), "Quando entra: guadagni 3 vite.", "“Mangia, che sei sciupato.”"),
            Meme("golden-retriever", "Golden retriever", Era.Wholesome, 4, 3, 4, K(Keyword.Cuoricino)),
            Meme("angelo-thread", "Angelo del thread", Era.Wholesome, 5, 4, 4, K(Keyword.Tendenza, Keyword.Cuoricino), flavor: "Risponde a tutti. Con gentilezza."),
            Trend("raccolta-fondi", "Raccolta fondi virale", Era.Wholesome, 1, F(Effect.Gain(4)), "Guadagni 4 vite."),
            Trend("abbraccio", "Abbraccio di gruppo", Era.Wholesome, 2, F(Effect.PumpAll(1, 1), Effect.Gain(2)), "Le tue creature prendono +1/+1 fino a fine turno. Guadagni 2 vite."),
            Trend("segnalazione", "Segnalazione", Era.Wholesome, 2, F(Effect.Freeze(TargetKind.EnemyCreature)), "Tappa una creatura avversaria: non si stappa al prossimo turno."),
            Trend("gesto-gentile", "Gesto gentile", Era.Wholesome, 3, F(Effect.Bounce(TargetKind.EnemyCreature), Effect.Gain(2)), "Rimanda in mano una creatura avversaria. Guadagni 2 vite."),
        };

        public static readonly Dictionary<string, CardDef> ById = All.ToDictionary(c => c.Id);

        /// <summary>Un mazzo da 30: 12 piattaforme e due copie di ogni altra carta dell'era.</summary>
        public static List<string> DeckList(Era era)
        {
            var list = Enumerable.Repeat(LandId(era), 12).ToList();
            foreach (var c in All)
            {
                if (c.Era == era && c.Type != CardType.Piattaforma && !c.Token)
                {
                    list.Add(c.Id);
                    list.Add(c.Id);
                }
            }
            return list;
        }
    }
}
