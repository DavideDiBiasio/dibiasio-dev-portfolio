// =========================
// MEME ARENA — AVVERSARIO
// IA a punteggio (utility): per ogni mossa possibile calcola quanto conviene
// e sceglie la migliore. Vede solo quello che vedresti tu, più la propria mano.
// =========================

using System.Collections.Generic;
using System.Linq;

namespace MemeArena.Core
{
    public enum AiActionType { Play, Attack, End }

    public sealed class AiAction
    {
        public AiActionType Type;
        public int Uid;
        public Target? Target;
        public List<int> Attackers = new List<int>();
    }

    public static class Ai
    {
        static bool Kills(Card source, Card victim) => source.Has(Keyword.Cringe) || source.Atk >= victim.Remaining;

        static int EffectScore(Game g, int pid, Effect e, Target? t, bool isTrend)
        {
            var me = g.Players[pid];
            var them = g.Players[Engine.Other(pid)];
            Card card = t.HasValue && !t.Value.IsPlayer ? Engine.FindCard(g, t.Value.Uid) : null;
            bool mine = card != null && card.Owner == pid;
            int sign = mine ? -1 : 1;

            switch (e.Type)
            {
                case EffectType.Damage:
                    if (t.HasValue && t.Value.IsPlayer)
                    {
                        if (t.Value.Player == pid) return -1000;
                        return e.Amount >= them.Life ? 10_000 : e.Amount * 3;
                    }
                    if (card == null) return 0;
                    if (e.Amount >= card.Remaining) return sign * card.Value * 8;
                    return isTrend ? -20 : sign * 2;
                case EffectType.DamageAll:
                    var victims = e.Who == Who.All ? me.Creatures.Concat(them.Creatures) : them.Creatures;
                    int s = victims.Where(c => e.Amount >= c.Remaining).Sum(c => (c.Owner == pid ? -1 : 1) * c.Value * 8);
                    return s != 0 ? s : -5;
                case EffectType.Destroy:
                    return card != null ? sign * card.Value * 8 : 0;
                case EffectType.Bounce:
                    return card != null ? sign * card.Value * (card.Def.Token ? 8 : 5) : 0;
                case EffectType.Freeze:
                case EffectType.Tap:
                    if (card == null) return 0;
                    return card.Tapped ? -10 : sign * card.Atk * (e.Type == EffectType.Freeze ? 5 : 3);
                case EffectType.Pump:
                    // Senza istantanei, un potenziamento serve solo prima di attaccare.
                    if (card == null || !mine) return -100;
                    return g.Phase == Phase.Main && Engine.CanAttack(card) ? 10 + e.Atk * 3 : -30;
                case EffectType.PumpAll:
                    int ready = me.Creatures.Count(Engine.CanAttack);
                    return g.Phase == Phase.Main && ready >= 2 ? ready * (e.Atk + e.Def) * 4 : -30;
                case EffectType.Draw:
                    return e.Amount * 12;
                case EffectType.Gain:
                    return e.Amount * (me.Life < 10 ? 6 : 2);
                case EffectType.Drain:
                    return e.Amount >= them.Life ? 10_000 : e.Amount * 5;
                case EffectType.Tokens:
                    return e.Amount * 10;
                case EffectType.Ramp:
                    return me.Library.Any(c => c.Def.Type == CardType.Piattaforma) ? 15 : 0;
            }
            return 0;
        }

        static int PlayScore(Game g, int pid, CardDef d, Target? t)
        {
            if (d.Type == CardType.Piattaforma) return 1000;
            bool isTrend = d.Type == CardType.Trend;
            int score = d.Cost * 10;
            if (d.Type == CardType.Meme) score += 10 + (d.Atk + d.Def) * 3 + d.Keywords.Length * 4;
            int effects = d.Effects.Sum(e => EffectScore(g, pid, e, t, isTrend));
            // Un trend vale solo per quello che fa: se non fa niente di buono, meglio tenerlo.
            return isTrend ? (effects > 0 ? score + effects : -1) : score + effects;
        }

        public static AiAction BestPlay(Game g, int pid)
        {
            AiAction best = null;
            int bestScore = 0;
            foreach (var c in g.Players[pid].Hand)
            {
                if (!Engine.CanPlay(g, pid, c.Uid)) continue;
                var targets = Engine.ValidTargets(g, pid, c.Def).Select(t => (Target?)t).ToList();
                if (targets.Count == 0) targets.Add(null);
                foreach (var t in targets)
                {
                    int score = PlayScore(g, pid, c.Def, t);
                    if (score > 0 && (best == null || score > bestScore))
                    {
                        best = new AiAction { Type = AiActionType.Play, Uid = c.Uid, Target = t };
                        bestScore = score;
                    }
                }
            }
            return best;
        }

        /// <summary>Chi mandare all'attacco: chi non può essere bloccato, chi sopravvive ai blocchi, o tutti se è letale.</summary>
        public static List<int> ChooseAttackers(Game g, int pid)
        {
            var ready = g.Players[pid].Creatures.Where(Engine.CanAttack).ToList();
            var foe = g.Players[Engine.Other(pid)];
            var blockers = foe.Creatures.Where(b => !b.Tapped).ToList();

            // Letale? L'avversario può fermare al massimo un attaccante per bloccante: i più grossi.
            var unblockable = ready.Where(a => !blockers.Any(b => Engine.CanBlock(b, a))).ToList();
            var blockable = ready.Except(unblockable).Select(a => a.Atk).OrderByDescending(n => n).ToList();
            int surely = unblockable.Sum(a => a.Atk) + blockable.Skip(blockers.Count).Sum();
            if (ready.Count > 0 && surely >= foe.Life) return ready.Select(c => c.Uid).ToList();

            return ready.Where(a =>
            {
                var able = blockers.Where(b => Engine.CanBlock(b, a)).ToList();
                if (able.Count == 0) return true;
                // Sopravvive a qualsiasi blocco?
                if (able.All(b => !Kills(b, a))) return true;
                // Ogni blocco che lo uccide costa all'avversario almeno quanto vale lui.
                return able.All(b => !Kills(b, a) || (Kills(a, b) && b.Value >= a.Value));
            }).Select(c => c.Uid).ToList();
        }

        /// <summary>Blocchi della CPU: prima i blocchi vantaggiosi, poi quelli che salvano la pelle.</summary>
        public static Dictionary<int, int> ChooseBlocks(Game g, int pid)
        {
            var me = g.Players[pid];
            var attackers = g.Attackers.Select(u => Engine.FindCard(g, u)).Where(c => c != null).OrderByDescending(c => c.Atk).ToList();
            var free = new HashSet<int>(me.Creatures.Where(c => !c.Tapped).Select(c => c.Uid));
            var blocks = new Dictionary<int, int>();

            foreach (var a in attackers)
            {
                int bestUid = -1, bestScore = 0;
                foreach (var b in me.Creatures)
                {
                    if (!free.Contains(b.Uid) || !Engine.CanBlock(b, a)) continue;
                    bool k = Kills(b, a), dies = Kills(a, b);
                    int score = k && !dies ? 100 + a.Value - b.Value
                        : !k && !dies ? 30 + a.Atk
                        : k && dies && a.Value >= b.Value ? 20 + a.Value - b.Value
                        : -1;
                    if (score > 0 && (bestUid < 0 || score > bestScore))
                    {
                        bestUid = b.Uid;
                        bestScore = score;
                    }
                }
                if (bestUid >= 0)
                {
                    blocks[a.Uid] = bestUid;
                    free.Remove(bestUid);
                }
            }

            // Se i danni che passano sono letali, si blocca anche a costo di perdere creature.
            int Incoming() => attackers.Where(a => !blocks.ContainsKey(a.Uid)).Sum(a => a.Atk);
            foreach (var a in attackers)
            {
                if (Incoming() < me.Life) break;
                if (blocks.ContainsKey(a.Uid)) continue;
                var chump = me.Creatures.Where(b => free.Contains(b.Uid) && Engine.CanBlock(b, a)).OrderBy(b => b.Value).FirstOrDefault();
                if (chump == null) continue;
                blocks[a.Uid] = chump.Uid;
                free.Remove(chump.Uid);
            }
            return blocks;
        }

        /// <summary>La prossima mossa della CPU nel suo turno.</summary>
        public static AiAction ChooseAction(Game g, int pid)
        {
            if (g.IsMainPhase)
            {
                var play = BestPlay(g, pid);
                if (play != null) return play;
                if (g.Phase == Phase.Main) return new AiAction { Type = AiActionType.Attack, Attackers = ChooseAttackers(g, pid) };
            }
            return new AiAction { Type = AiActionType.End };
        }

        /// <summary>Esegue una mossa sul motore. Utile per l'interfaccia e per i test.</summary>
        public static bool Apply(Game g, int pid, AiAction action) => action.Type switch
        {
            AiActionType.Play => Engine.Play(g, pid, action.Uid, action.Target),
            AiActionType.Attack => Engine.DeclareAttackers(g, pid, action.Attackers),
            _ => Engine.EndTurn(g, pid),
        };
    }
}
