using System.Collections.Generic;
using System.Linq;
using MemeArena.Core;
using NUnit.Framework;

namespace MemeArena.Tests
{
    public class EngineTests
    {
        // ---------- Aiuti ----------

        static Game Fresh(Era you = Era.Brainrot, Era cpu = Era.Golden)
        {
            var g = Engine.NewGame(you, cpu, new Rng(7), first: 0);
            foreach (var p in g.Players) p.Hand.Clear();
            return g;
        }

        /// <summary>Mette in mano una carta precisa, con le piattaforme necessarie già in campo.</summary>
        static Card Give(Game g, int pid, string id, int lands = 0)
        {
            var p = g.Players[pid];
            for (int i = 0; i < lands; i++) p.Lands.Add(new Card { Uid = g.NextUid++, Id = Cards.LandId(p.Era), Owner = pid, Sick = false });
            var c = Engine.MakeCard(g, id, pid);
            p.Hand.Add(c);
            return c;
        }

        /// <summary>Una creatura già in campo, pronta ad attaccare.</summary>
        static Card Summon(Game g, int pid, string id)
        {
            var c = Engine.MakeCard(g, id, pid);
            c.Sick = false;
            g.Players[pid].Creatures.Add(c);
            return c;
        }

        /// <summary>Ogni carta deve stare in una zona sola.</summary>
        static void AssertZones(Game g)
        {
            var seen = new HashSet<int>();
            foreach (var p in g.Players)
                foreach (var c in p.AllCards)
                    Assert.IsTrue(seen.Add(c.Uid), $"La carta {c.Uid} ({c.Id}) è in due zone");
        }

        // ---------- Carte ----------

        [Test]
        public void OgniEraHaUnMazzoDa30Con12Piattaforme()
        {
            foreach (var era in Cards.EraOrder)
            {
                var list = Cards.DeckList(era);
                Assert.AreEqual(30, list.Count);
                Assert.AreEqual(12, list.Count(id => id.StartsWith("land-")));
            }
        }

        [Test]
        public void OgniEraHaUnaRispostaControLeCreature()
        {
            var answers = new[] { EffectType.Damage, EffectType.Destroy, EffectType.Bounce, EffectType.Freeze, EffectType.Tap };
            foreach (var era in Cards.EraOrder)
                Assert.IsTrue(Cards.All.Any(c => c.Era == era && c.Effects.Any(e => answers.Contains(e.Type))), $"{era} non ha rimozioni");
        }

        // ---------- Regole ----------

        [Test]
        public void SiParteCon20ViteE7Carte()
        {
            var g = Engine.NewGame(Era.Boomer, Era.Cursed, new Rng(1), first: 0);
            Assert.AreEqual(20, g.Players[0].Life);
            Assert.AreEqual(7, g.Players[1].Hand.Count);
            AssertZones(g);
        }

        [Test]
        public void UnaSolaPiattaformaPerTurno()
        {
            var g = Fresh();
            var a = Give(g, 0, "land-brainrot");
            var b = Give(g, 0, "land-brainrot");
            Assert.IsTrue(Engine.Play(g, 0, a.Uid));
            Assert.IsFalse(Engine.CanPlay(g, 0, b.Uid));
        }

        [Test]
        public void ServeAbbastanzaHypeEGiocareTappaLePiattaforme()
        {
            var g = Fresh();
            var tung = Give(g, 0, "tung-tung", 2);
            Assert.IsFalse(Engine.CanPlay(g, 0, tung.Uid));
            var land = Give(g, 0, "land-brainrot");
            Engine.Play(g, 0, land.Uid);
            Assert.IsTrue(Engine.Play(g, 0, tung.Uid));
            Assert.IsTrue(g.Players[0].Lands.All(l => l.Tapped));
        }

        [Test]
        public void TrendConBersaglioSenzaBersaglioNonCambiaNulla()
        {
            var g = Fresh();
            var rage = Give(g, 0, "ragebait", 1);
            Assert.IsFalse(Engine.Play(g, 0, rage.Uid));
            Assert.Contains(rage, g.Players[0].Hand);
            Assert.IsFalse(g.Players[0].Lands[0].Tapped);
            Assert.IsTrue(Engine.Play(g, 0, rage.Uid, Target.Face(1)));
            Assert.AreEqual(18, g.Players[1].Life);
            Assert.Contains(rage, g.Players[0].Graveyard);
        }

        [Test]
        public void LeCreatureAppenaEntrateNonAttaccanoQuelleViraliSi()
        {
            var g = Fresh();
            var gamb = Give(g, 0, "gatto-gambero", 2);
            var squalo = Give(g, 0, "squalo-scarpe", 1);
            Engine.Play(g, 0, gamb.Uid);
            Engine.Play(g, 0, squalo.Uid);
            Engine.BeginAttack(g, 0);
            Assert.IsFalse(Engine.DeclareAttackers(g, 0, new[] { gamb.Uid }));
            Assert.IsTrue(Engine.DeclareAttackers(g, 0, new[] { squalo.Uid }));
            Assert.AreEqual(18, g.Players[1].Life);
        }

        [Test]
        public void BloccoDanniSimultanei()
        {
            var g = Fresh();
            var a = Summon(g, 0, "squalo-scarpe"); // 2/1
            var b = Summon(g, 1, "cane-wow"); // 2/3
            Engine.DeclareAttackers(g, 0, new[] { a.Uid });
            Assert.AreEqual(Phase.Block, g.Phase);
            Engine.DeclareBlocks(g, 1, new Dictionary<int, int> { [a.Uid] = b.Uid });
            Assert.IsFalse(g.Players[0].Creatures.Contains(a));
            Assert.IsTrue(g.Players[1].Creatures.Contains(b));
            Assert.AreEqual(20, g.Players[1].Life);
        }

        [Test]
        public void InTendenzaSiBloccaSoloConInTendenza()
        {
            var g = Fresh(Era.Boomer, Era.Golden);
            var gif = Summon(g, 0, "gif-glitter");
            var cane = Summon(g, 1, "cane-wow");
            Engine.DeclareAttackers(g, 0, new[] { gif.Uid });
            Assert.AreEqual(Phase.Main2, g.Phase);
            Assert.AreEqual(18, g.Players[1].Life);
            Assert.AreEqual(0, cane.Damage);
        }

        [Test]
        public void CringeETravolgente()
        {
            var g = Fresh(Era.Cursed, Era.Golden);
            var occhio = Summon(g, 0, "occhio-fritto"); // 1/1 cringe
            var boss = Summon(g, 1, "like-a-boss"); // 4/4
            Engine.DeclareAttackers(g, 0, new[] { occhio.Uid });
            Engine.DeclareBlocks(g, 1, new Dictionary<int, int> { [occhio.Uid] = boss.Uid });
            Assert.IsFalse(g.Players[1].Creatures.Contains(boss));

            var h = Fresh(Era.Golden, Era.Wholesome);
            var big = Summon(h, 0, "oltre-9000"); // 6/5 travolgente
            var pup = Summon(h, 1, "cagnolino"); // 1/2 cuoricino
            Engine.DeclareAttackers(h, 0, new[] { big.Uid });
            Engine.DeclareBlocks(h, 1, new Dictionary<int, int> { [big.Uid] = pup.Uid });
            // 4 danni passano; il Cagnolino ne infligge 1 e recupera 1 vita.
            Assert.AreEqual(20 - 4 + 1, h.Players[1].Life);
        }

        [Test]
        public void CuoricinoFaGuadagnareVita()
        {
            var g = Fresh(Era.Wholesome, Era.Brainrot);
            var dog = Summon(g, 0, "golden-retriever"); // 3/4
            Engine.DeclareAttackers(g, 0, new[] { dog.Uid });
            Assert.AreEqual(23, g.Players[0].Life);
            Assert.AreEqual(17, g.Players[1].Life);
        }

        [Test]
        public void CongelataRestaTappataAlProssimoTurno()
        {
            var g = Fresh(Era.Wholesome, Era.Brainrot);
            var target = Summon(g, 1, "tung-tung");
            var flag = Give(g, 0, "segnalazione", 2);
            Engine.Play(g, 0, flag.Uid, Target.OfCard(target.Uid));
            Engine.EndTurn(g, 0);
            Assert.AreEqual(1, g.Active);
            Assert.IsTrue(target.Tapped);
            Engine.EndTurn(g, 1);
            Engine.EndTurn(g, 0);
            Assert.IsFalse(target.Tapped);
        }

        [Test]
        public void NotiziaFalsaRimandaInManoLePedineSpariscono()
        {
            var g = Fresh(Era.Boomer, Era.Golden);
            var cane = Summon(g, 1, "cane-wow");
            var fake = Give(g, 0, "notizia-falsa", 2);
            Engine.Play(g, 0, fake.Uid, Target.OfCard(cane.Uid));
            Assert.Contains(cane, g.Players[1].Hand);

            var token = Summon(g, 1, "ballerino");
            var fake2 = Give(g, 0, "notizia-falsa", 2);
            Engine.Play(g, 0, fake2.Uid, Target.OfCard(token.Uid));
            Assert.IsFalse(g.Players[1].Hand.Contains(token));
            AssertZones(g);
        }

        [Test]
        public void AFineTurnoDanniEBonusSpariscono()
        {
            var g = Fresh(Era.Golden, Era.Brainrot);
            var cane = Summon(g, 0, "cane-wow");
            var win = Give(g, 0, "epic-win", 1);
            Engine.Play(g, 0, win.Uid, Target.OfCard(cane.Uid));
            cane.Damage = 2;
            Assert.AreEqual(3, cane.BonusAtk);
            Engine.EndTurn(g, 0);
            Assert.AreEqual(0, cane.Damage);
            Assert.AreEqual(0, cane.BonusAtk);
        }

        [Test]
        public void ChiFinisceIlMazzoPerde()
        {
            var g = Fresh();
            g.Players[1].Library.Clear();
            Engine.EndTurn(g, 0);
            Assert.AreEqual(0, g.Winner);
        }

        // ---------- CPU ----------

        [Test]
        public void LaCpuBloccaConChiUccideESopravvive()
        {
            var g = Fresh(Era.Brainrot, Era.Golden);
            var a = Summon(g, 0, "squalo-scarpe"); // 2/1
            Summon(g, 1, "forever-alone"); // 1/1: scambio
            var wall = Summon(g, 1, "cane-wow"); // 2/3: uccide e sopravvive
            Engine.DeclareAttackers(g, 0, new[] { a.Uid });
            var blocks = Ai.ChooseBlocks(g, 1);
            Assert.AreEqual(1, blocks.Count);
            Assert.AreEqual(wall.Uid, blocks[a.Uid]);
        }

        [Test]
        public void LaCpuNonAttaccaControUnMuroCheLaUccide()
        {
            var g = Fresh(Era.Brainrot, Era.Golden);
            Summon(g, 0, "squalo-scarpe"); // 2/1
            Summon(g, 1, "cane-wow"); // 2/3
            Assert.IsEmpty(Ai.ChooseAttackers(g, 0));
        }

        [Test]
        public void LaCpuUsaLaRimozioneSullaMinacciaPiuGrossa()
        {
            var g = Fresh(Era.Cursed, Era.Golden);
            Summon(g, 0, "occhio-fritto");
            Summon(g, 1, "forever-alone");
            var big = Summon(g, 1, "oltre-9000");
            Give(g, 0, "maledizione", 4);
            var action = Ai.ChooseAction(g, 0);
            Assert.AreEqual(AiActionType.Play, action.Type);
            Assert.AreEqual(Target.OfCard(big.Uid), action.Target);
        }

        [Test]
        public void PartiteInteroCpuControCpuFinisconoSenzaCarteDuplicate()
        {
            for (uint seed = 1; seed <= 25; seed++)
            {
                var g = Engine.NewGame(Cards.EraOrder[seed % 5], Cards.EraOrder[(seed * 3 + 1) % 5], new Rng(seed));
                int steps = 0;
                while (!g.Over && steps++ < 5000)
                {
                    if (g.Phase == Phase.Block)
                    {
                        int defender = Engine.Other(g.Active);
                        Assert.IsTrue(Engine.DeclareBlocks(g, defender, Ai.ChooseBlocks(g, defender)));
                        continue;
                    }
                    Assert.IsTrue(Ai.Apply(g, g.Active, Ai.ChooseAction(g, g.Active)), $"Mossa rifiutata (seme {seed})");
                }
                Assert.IsTrue(g.Over, $"La partita con seme {seed} non finisce");
                AssertZones(g);
                foreach (var p in g.Players)
                    Assert.IsTrue(p.Creatures.All(c => c.Def.Type == CardType.Meme));
            }
        }
    }
}
