// =========================
// MEME ARENA — REGOLE
// Logica pura, senza UnityEngine: lo stesso codice muove te e la CPU,
// e si testa anche fuori da Unity.
// Turno: stappa → pesca → fase principale → attacco → blocchi →
// danni → seconda fase principale → fine turno.
// =========================

using System;
using System.Collections.Generic;
using System.Linq;

namespace MemeArena.Core
{
    public enum Phase { Main, Attack, Block, Main2 }

    public sealed class Card
    {
        public int Uid;
        public string Id;
        public int Owner;
        public bool Tapped;
        /// <summary>Appena entrata: non può attaccare finché non inizia il tuo turno.</summary>
        public bool Sick = true;
        public int Damage;
        public int BonusAtk;
        public int BonusDef;
        /// <summary>Congelata: resta tappata al prossimo turno.</summary>
        public bool Frozen;
        /// <summary>Colpita da una creatura Cringe o da un "distruggi".</summary>
        public bool Doomed;

        public CardDef Def => Cards.ById[Id];
        public int Atk => Math.Max(0, Def.Atk + BonusAtk);
        public int Toughness => Def.Def + BonusDef;
        public int Remaining => Math.Max(0, Toughness - Damage);
        public bool Has(Keyword k) => Def.Has(k);
        public int Value => Def.Cost + Atk + Toughness;

        public void ResetState()
        {
            Tapped = false;
            Sick = true;
            Damage = 0;
            BonusAtk = 0;
            BonusDef = 0;
            Frozen = false;
            Doomed = false;
        }
    }

    public sealed class Player
    {
        public string Name;
        public Era Era;
        public int Life = Engine.StartLife;
        public List<Card> Library = new List<Card>();
        public List<Card> Hand = new List<Card>();
        public List<Card> Lands = new List<Card>();
        public List<Card> Creatures = new List<Card>();
        public List<Card> Graveyard = new List<Card>();
        public bool LandPlayed;

        public IEnumerable<Card> AllCards => Library.Concat(Hand).Concat(Lands).Concat(Creatures).Concat(Graveyard);
    }

    public readonly struct Target : IEquatable<Target>
    {
        public readonly bool IsPlayer;
        public readonly int Player;
        public readonly int Uid;

        Target(bool isPlayer, int player, int uid)
        {
            IsPlayer = isPlayer;
            Player = player;
            Uid = uid;
        }

        public static Target Face(int player) => new Target(true, player, -1);
        public static Target OfCard(int uid) => new Target(false, -1, uid);

        public bool Equals(Target o) => IsPlayer == o.IsPlayer && Player == o.Player && Uid == o.Uid;
        public override bool Equals(object obj) => obj is Target t && Equals(t);
        public override int GetHashCode() => IsPlayer ? Player : 1000 + Uid;
        public override string ToString() => IsPlayer ? $"giocatore {Player}" : $"carta {Uid}";
    }

    public sealed class LogEntry
    {
        public int Id;
        public int Who; // -1 = nessuno
        public string Text;
    }

    /// <summary>Generatore pseudo-casuale con seme (mulberry32), per partite ripetibili.</summary>
    public sealed class Rng
    {
        uint a;
        public Rng(uint seed) { a = seed; }
        public static Rng Random() => new Rng((uint)Environment.TickCount ^ (uint)Guid.NewGuid().GetHashCode());

        public double Next()
        {
            unchecked
            {
                a += 0x6d2b79f5;
                uint t = a;
                t = (t ^ (t >> 15)) * (t | 1);
                t ^= t + (t ^ (t >> 7)) * (t | 61);
                return (t ^ (t >> 14)) / 4294967296.0;
            }
        }

        public int Range(int maxExclusive) => (int)(Next() * maxExclusive);
    }

    public sealed class Game
    {
        public Player[] Players = new Player[2];
        public int Active;
        public int Turn = 1;
        public Phase Phase = Phase.Main;
        public List<int> Attackers = new List<int>();
        /// <summary>Attaccante → bloccante.</summary>
        public Dictionary<int, int> Blocks = new Dictionary<int, int>();
        /// <summary>-1 = in corso, 0 o 1 = vincitore, 2 = pareggio.</summary>
        public int Winner = -1;
        public List<LogEntry> Log = new List<LogEntry>();
        public int NextUid = 1;
        public Rng Rng;

        public bool Over => Winner != -1;
        public bool IsMainPhase => Phase == Phase.Main || Phase == Phase.Main2;
    }

    public static class Engine
    {
        public const int StartLife = 20;
        public const int StartHand = 7;
        public const int MaxHand = 7;
        /// <summary>Valore di Game.Winner in caso di pareggio.</summary>
        public const int DrawResult = 2;

        public static int Other(int p) => 1 - p;

        static string WhoName(int p) => p == 0 ? "te" : "la CPU";

        // =========================
        // PREPARAZIONE
        // =========================

        public static Card MakeCard(Game g, string id, int owner) => new Card { Uid = g.NextUid++, Id = id, Owner = owner };

        public static Game NewGame(Era you, Era cpu, Rng rng, int first = -1)
        {
            var g = new Game { Rng = rng };
            g.Players[0] = new Player { Name = "Tu", Era = you };
            g.Players[1] = new Player { Name = "CPU", Era = cpu };
            g.Active = first >= 0 ? first : (rng.Next() < 0.5 ? 0 : 1);

            for (int pid = 0; pid < 2; pid++)
            {
                var p = g.Players[pid];
                p.Library = Shuffle(Cards.DeckList(p.Era).Select(id => MakeCard(g, id, pid)).ToList(), rng);
                DrawCards(g, pid, StartHand, quiet: true);
            }
            AddLog(g, -1, g.Active == 0 ? "Inizi tu. Al primo turno non si pesca." : "Inizia la CPU. Al primo turno non si pesca.");
            return g;
        }

        /// <summary>Mescolata di Fisher–Yates: ogni ordine ha la stessa probabilità.</summary>
        static List<T> Shuffle<T>(List<T> list, Rng rng)
        {
            for (int i = list.Count - 1; i > 0; i--)
            {
                int j = rng.Range(i + 1);
                (list[i], list[j]) = (list[j], list[i]);
            }
            return list;
        }

        static void AddLog(Game g, int who, string text)
        {
            g.Log.Add(new LogEntry { Id = g.Log.Count + 1, Who = who, Text = text });
            if (g.Log.Count > 60) g.Log.RemoveRange(0, g.Log.Count - 60);
        }

        // =========================
        // ZONE E STATO
        // =========================

        public static Card FindCard(Game g, int uid)
        {
            foreach (var p in g.Players)
            {
                var c = p.Creatures.Find(x => x.Uid == uid) ?? p.Hand.Find(x => x.Uid == uid) ?? p.Lands.Find(x => x.Uid == uid);
                if (c != null) return c;
            }
            return null;
        }

        static bool OnBattlefield(Game g, int uid) => g.Players.Any(p => p.Creatures.Any(c => c.Uid == uid));

        static void DrawCards(Game g, int pid, int n, bool quiet = false)
        {
            var p = g.Players[pid];
            for (int i = 0; i < n; i++)
            {
                if (p.Library.Count == 0)
                {
                    AddLog(g, pid, $"{p.Name}: mazzo finito!");
                    p.Life = 0;
                    break;
                }
                var c = p.Library[0];
                p.Library.RemoveAt(0);
                p.Hand.Add(c);
            }
            if (!quiet && n > 0) AddLog(g, pid, $"{p.Name} pesca {(n == 1 ? "una carta" : n + " carte")}.");
        }

        /// <summary>Toglie una creatura dal campo: le pedine spariscono, le carte tornano pulite.</summary>
        static void LeaveBattlefield(Game g, Card c)
        {
            g.Players[c.Owner].Creatures.Remove(c);
            c.ResetState();
        }

        static void Destroy(Game g, Card c)
        {
            LeaveBattlefield(g, c);
            if (!c.Def.Token) g.Players[c.Owner].Graveyard.Add(c);
        }

        /// <summary>Azioni di stato: creature morte, giocatori a zero vite.</summary>
        static void CheckState(Game g)
        {
            foreach (var p in g.Players)
            {
                foreach (var c in p.Creatures.ToList())
                {
                    if (c.Damage >= c.Toughness || c.Doomed || c.Toughness <= 0)
                    {
                        string name = c.Def.Name;
                        Destroy(g, c);
                        AddLog(g, c.Owner, $"{name} è finito nel dimenticatoio.");
                    }
                }
            }
            if (g.Over) return;
            bool dead0 = g.Players[0].Life <= 0, dead1 = g.Players[1].Life <= 0;
            if (dead0 && dead1) g.Winner = DrawResult;
            else if (dead0) g.Winner = 1;
            else if (dead1) g.Winner = 0;
            if (g.Over)
            {
                g.Attackers.Clear();
                g.Blocks.Clear();
                AddLog(g, -1, g.Winner == DrawResult ? "Pareggio!" : g.Winner == 0 ? "Hai vinto!" : "Ha vinto la CPU.");
            }
        }

        // =========================
        // HYPE E BERSAGLI
        // =========================

        public static int UntappedLands(Game g, int pid) => g.Players[pid].Lands.Count(l => !l.Tapped);

        /// <summary>Il primo effetto con bersaglio decide chi va scelto.</summary>
        public static Effect TargetEffect(CardDef d) => d.Effects.FirstOrDefault(e => e.HasTarget);

        public static List<Target> ValidTargets(Game g, int pid, CardDef d)
        {
            var eff = TargetEffect(d);
            var result = new List<Target>();
            if (eff == null) return result;
            var mine = g.Players[pid].Creatures;
            var theirs = g.Players[Other(pid)].Creatures;
            IEnumerable<Card> cards = eff.Target switch
            {
                TargetKind.OwnCreature => mine,
                TargetKind.EnemyCreature => theirs,
                _ => theirs.Concat(mine),
            };
            if (eff.Type == EffectType.Destroy && eff.MaxAtk >= 0) cards = cards.Where(c => c.Atk <= eff.MaxAtk);
            if (eff.Target == TargetKind.Any)
            {
                result.Add(Target.Face(Other(pid)));
                result.Add(Target.Face(pid));
            }
            result.AddRange(cards.Select(c => Target.OfCard(c.Uid)));
            return result;
        }

        public static bool CanPlay(Game g, int pid, int uid)
        {
            if (g.Over || g.Active != pid || !g.IsMainPhase) return false;
            var c = g.Players[pid].Hand.Find(x => x.Uid == uid);
            if (c == null) return false;
            var d = c.Def;
            if (d.Type == CardType.Piattaforma) return !g.Players[pid].LandPlayed;
            if (d.Cost > UntappedLands(g, pid)) return false;
            // Un trend senza bersagli validi non fa nulla: non si può giocare.
            if (d.Type == CardType.Trend && TargetEffect(d) != null && ValidTargets(g, pid, d).Count == 0) return false;
            return true;
        }

        /// <summary>Serve scegliere un bersaglio? (Per i meme solo se ce n'è almeno uno.)</summary>
        public static bool NeedsTarget(Game g, int pid, int uid)
        {
            var c = FindCard(g, uid);
            return c != null && TargetEffect(c.Def) != null && ValidTargets(g, pid, c.Def).Count > 0;
        }

        // =========================
        // EFFETTI (un solo interprete per tutte le carte)
        // =========================

        static string TargetName(Game g, Target t)
        {
            if (t.IsPlayer) return WhoName(t.Player);
            var c = FindCard(g, t.Uid);
            return c != null ? c.Def.Name : "?";
        }

        static void Resolve(Game g, int pid, CardDef source, Target? target)
        {
            var me = g.Players[pid];
            var them = g.Players[Other(pid)];
            Card found = target.HasValue && !target.Value.IsPlayer ? FindCard(g, target.Value.Uid) : null;
            // Se il bersaglio nel frattempo è sparito, l'effetto su di lui non fa nulla.
            Card tc = found != null && OnBattlefield(g, found.Uid) ? found : null;

            foreach (var e in source.Effects)
            {
                switch (e.Type)
                {
                    case EffectType.Damage:
                        if (!target.HasValue) break;
                        if (target.Value.IsPlayer) g.Players[target.Value.Player].Life -= e.Amount;
                        else if (tc != null) tc.Damage += e.Amount;
                        AddLog(g, pid, $"{source.Name}: {e.Amount} danni a {TargetName(g, target.Value)}.");
                        break;
                    case EffectType.DamageAll:
                        var victims = e.Who == Who.All ? me.Creatures.Concat(them.Creatures).ToList() : them.Creatures.ToList();
                        foreach (var c in victims) c.Damage += e.Amount;
                        AddLog(g, pid, $"{source.Name}: {e.Amount} danno a {(e.Who == Who.All ? "ogni creatura" : "ogni creatura avversaria")}.");
                        break;
                    case EffectType.Destroy:
                        if (tc == null) break;
                        AddLog(g, pid, $"{source.Name} distrugge {tc.Def.Name}.");
                        tc.Doomed = true;
                        break;
                    case EffectType.Bounce:
                        if (tc == null) break;
                        LeaveBattlefield(g, tc);
                        if (!tc.Def.Token) g.Players[tc.Owner].Hand.Add(tc);
                        AddLog(g, pid, $"{source.Name} rimanda in mano {tc.Def.Name}.");
                        break;
                    case EffectType.Freeze:
                    case EffectType.Tap:
                        if (tc == null) break;
                        tc.Tapped = true;
                        if (e.Type == EffectType.Freeze) tc.Frozen = true;
                        AddLog(g, pid, $"{source.Name} {(e.Type == EffectType.Freeze ? "congela" : "tappa")} {tc.Def.Name}.");
                        break;
                    case EffectType.Pump:
                        if (tc == null) break;
                        tc.BonusAtk += e.Atk;
                        tc.BonusDef += e.Def;
                        AddLog(g, pid, $"{tc.Def.Name} prende +{e.Atk}/+{e.Def}.");
                        break;
                    case EffectType.PumpAll:
                        foreach (var c in me.Creatures)
                        {
                            c.BonusAtk += e.Atk;
                            c.BonusDef += e.Def;
                        }
                        AddLog(g, pid, $"{source.Name}: creature di {WhoName(pid)} +{e.Atk}/+{e.Def}.");
                        break;
                    case EffectType.Draw:
                        DrawCards(g, pid, e.Amount);
                        break;
                    case EffectType.Gain:
                        me.Life += e.Amount;
                        AddLog(g, pid, $"{(pid == 0 ? "Guadagni" : "La CPU guadagna")} {e.Amount} vite.");
                        break;
                    case EffectType.Drain:
                        them.Life -= e.Amount;
                        me.Life += e.Amount;
                        AddLog(g, pid, $"{source.Name} ruba {e.Amount} {(e.Amount == 1 ? "vita" : "vite")}.");
                        break;
                    case EffectType.Tokens:
                        for (int i = 0; i < e.Amount; i++) me.Creatures.Add(MakeCard(g, e.Token, pid));
                        AddLog(g, pid, $"{source.Name}: arrivano {e.Amount} pedine {Cards.ById[e.Token].Name}.");
                        break;
                    case EffectType.Ramp:
                        int idx = me.Library.FindIndex(c => c.Def.Type == CardType.Piattaforma);
                        if (idx < 0) break;
                        var land = me.Library[idx];
                        me.Library.RemoveAt(idx);
                        land.Tapped = true;
                        me.Lands.Add(land);
                        AddLog(g, pid, $"{source.Name}: una piattaforma in più.");
                        break;
                }
            }
        }

        // =========================
        // AZIONI
        // =========================

        /// <summary>
        /// Gioca una carta. Atomico: prima controlla costo e bersaglio, poi paga ed esegue.
        /// Se qualcosa non va, la partita resta esattamente com'era.
        /// </summary>
        public static bool Play(Game g, int pid, int uid, Target? target = null)
        {
            if (!CanPlay(g, pid, uid)) return false;
            var p = g.Players[pid];
            var c = p.Hand.Find(x => x.Uid == uid);
            var d = c.Def;

            var targets = ValidTargets(g, pid, d);
            if (targets.Count > 0 && (!target.HasValue || !targets.Contains(target.Value))) return false;

            p.Hand.Remove(c);

            if (d.Type == CardType.Piattaforma)
            {
                p.Lands.Add(c);
                p.LandPlayed = true;
                AddLog(g, pid, $"{p.Name} gioca {d.Name}.");
                return true;
            }

            int toPay = d.Cost;
            foreach (var l in p.Lands)
            {
                if (toPay == 0) break;
                if (!l.Tapped)
                {
                    l.Tapped = true;
                    toPay--;
                }
            }

            if (d.Type == CardType.Meme)
            {
                c.Sick = !c.Has(Keyword.Virale);
                p.Creatures.Add(c);
                AddLog(g, pid, $"{p.Name} evoca {d.Name}.");
            }
            else
            {
                AddLog(g, pid, $"{p.Name} lancia {d.Name}.");
            }

            Resolve(g, pid, d, targets.Count > 0 ? target : null);
            if (d.Type == CardType.Trend) p.Graveyard.Add(c);
            CheckState(g);
            return true;
        }

        public static bool CanAttack(Card c) => !c.Tapped && (!c.Sick || c.Has(Keyword.Virale)) && !c.Has(Keyword.Muro) && c.Atk > 0;

        public static bool CanBlock(Card blocker, Card attacker)
        {
            if (blocker.Tapped) return false;
            return !attacker.Has(Keyword.Tendenza) || blocker.Has(Keyword.Tendenza);
        }

        /// <summary>Dalla fase principale si passa a scegliere gli attaccanti.</summary>
        public static bool BeginAttack(Game g, int pid)
        {
            if (g.Over || g.Active != pid || g.Phase != Phase.Main) return false;
            g.Phase = Phase.Attack;
            return true;
        }

        public static bool DeclareAttackers(Game g, int pid, IEnumerable<int> uids)
        {
            if (g.Over || g.Active != pid || (g.Phase != Phase.Attack && g.Phase != Phase.Main)) return false;
            var p = g.Players[pid];
            var attackers = uids.Distinct().Select(u => p.Creatures.Find(c => c.Uid == u)).ToList();
            if (attackers.Any(c => c == null || !CanAttack(c))) return false;

            if (attackers.Count == 0)
            {
                g.Phase = Phase.Main2;
                return true;
            }

            foreach (var c in attackers) c.Tapped = true;
            g.Attackers = attackers.Select(c => c.Uid).ToList();
            g.Blocks.Clear();
            AddLog(g, pid, $"{p.Name} attacca con {string.Join(", ", attackers.Select(c => c.Def.Name))}.");

            // Se il difensore non può bloccare niente, i danni arrivano subito.
            var defenders = g.Players[Other(pid)].Creatures;
            if (attackers.Any(a => defenders.Any(b => CanBlock(b, a)))) g.Phase = Phase.Block;
            else ResolveCombat(g);
            return true;
        }

        public static bool DeclareBlocks(Game g, int pid, IDictionary<int, int> blocks)
        {
            if (g.Over || g.Phase != Phase.Block || pid == g.Active) return false;
            var used = new HashSet<int>();
            foreach (var kv in blocks)
            {
                var attacker = FindCard(g, kv.Key);
                var blocker = g.Players[pid].Creatures.Find(c => c.Uid == kv.Value);
                if (attacker == null || !g.Attackers.Contains(attacker.Uid) || blocker == null || used.Contains(kv.Value) || !CanBlock(blocker, attacker)) return false;
                used.Add(kv.Value);
            }
            g.Blocks = new Dictionary<int, int>(blocks);
            ResolveCombat(g);
            return true;
        }

        static void ResolveCombat(Game g)
        {
            var attacker = g.Players[g.Active];
            var defender = g.Players[Other(g.Active)];
            var gains = new int[2];
            int toFace = 0;
            var hits = new List<(Card src, int amount, Card dst)>();

            foreach (var uid in g.Attackers)
            {
                var a = attacker.Creatures.Find(c => c.Uid == uid);
                if (a == null) continue;
                Card b = g.Blocks.TryGetValue(uid, out var bu) ? defender.Creatures.Find(c => c.Uid == bu) : null;
                int power = a.Atk;

                if (b == null)
                {
                    toFace += power;
                    if (a.Has(Keyword.Cuoricino)) gains[a.Owner] += power;
                    continue;
                }

                // Travolgente: al bloccante solo il danno letale, il resto passa.
                int onBlocker = power;
                if (a.Has(Keyword.Travolgente))
                {
                    int lethal = a.Has(Keyword.Cringe) ? 1 : b.Remaining;
                    onBlocker = Math.Min(power, lethal);
                    toFace += power - onBlocker;
                }
                hits.Add((a, onBlocker, b));
                hits.Add((b, b.Atk, a));
                if (a.Has(Keyword.Cuoricino)) gains[a.Owner] += power;
                if (b.Has(Keyword.Cuoricino)) gains[b.Owner] += b.Atk;
            }

            // I danni sono simultanei: prima si calcolano tutti, poi si applicano.
            foreach (var (src, amount, dst) in hits)
            {
                if (amount <= 0) continue;
                dst.Damage += amount;
                if (src.Has(Keyword.Cringe)) dst.Doomed = true;
            }
            if (toFace > 0)
            {
                defender.Life -= toFace;
                AddLog(g, g.Active, $"{toFace} danni a {WhoName(Other(g.Active))}.");
            }
            for (int pid = 0; pid < 2; pid++)
            {
                if (gains[pid] <= 0) continue;
                g.Players[pid].Life += gains[pid];
                AddLog(g, pid, $"Cuoricino: +{gains[pid]} vite a {WhoName(pid)}.");
            }

            g.Attackers.Clear();
            g.Blocks.Clear();
            g.Phase = Phase.Main2;
            CheckState(g);
        }

        public static bool EndTurn(Game g, int pid)
        {
            if (g.Over || g.Active != pid || !g.IsMainPhase) return false;
            var p = g.Players[pid];

            // Fine turno: i danni si curano, i potenziamenti finiscono, la mano torna a 7.
            foreach (var q in g.Players)
            {
                foreach (var c in q.Creatures)
                {
                    c.Damage = 0;
                    c.BonusAtk = 0;
                    c.BonusDef = 0;
                }
            }
            while (p.Hand.Count > MaxHand)
            {
                var worst = p.Hand.OrderByDescending(c => c.Def.Cost).First();
                p.Hand.Remove(worst);
                p.Graveyard.Add(worst);
                AddLog(g, pid, $"{p.Name} scarta {worst.Def.Name}.");
            }

            g.Active = Other(pid);
            g.Turn++;
            g.Phase = Phase.Main;
            StartTurn(g);
            return true;
        }

        static void StartTurn(Game g)
        {
            var p = g.Players[g.Active];
            p.LandPlayed = false;
            foreach (var c in p.Lands.Concat(p.Creatures))
            {
                if (c.Frozen) c.Frozen = false;
                else c.Tapped = false;
                c.Sick = false;
            }
            int round = (g.Turn + 1) / 2;
            AddLog(g, g.Active, g.Active == 0 ? $"Turno {round}: tocca a te." : $"Turno {round}: tocca alla CPU.");
            DrawCards(g, g.Active, 1, quiet: true);
            CheckState(g);
        }
    }
}
