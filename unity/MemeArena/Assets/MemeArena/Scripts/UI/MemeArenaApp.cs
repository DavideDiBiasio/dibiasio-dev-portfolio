// =========================
// MEME ARENA — INTERFACCIA (UI Toolkit)
// Si avvia da sola in qualsiasi scena: crea il proprio UIDocument,
// costruisce l'interfaccia da codice e ridisegna tutto a ogni mossa.
// La CPU gioca una mossa ogni CpuDelay secondi, così si vede cosa fa.
// =========================

using System.Collections.Generic;
using System.Linq;
using MemeArena.Core;
using UnityEngine;
using UnityEngine.UIElements;

namespace MemeArena.UI
{
    [RequireComponent(typeof(UIDocument))]
    public sealed class MemeArenaApp : MonoBehaviour
    {
        const int You = 0;
        const int Cpu = 1;
        const float CpuDelay = 0.9f;
        const string WinsKey = "meme-arena:vittorie";
        const string LossesKey = "meme-arena:sconfitte";

        [Tooltip("Foglio di stile. Se vuoto, viene caricato da Resources/MemeArenaStyles.")]
        public StyleSheet styles;

        Game g;
        VisualElement root;
        VisualElement screen;

        // Stato dell'interfaccia (non delle regole).
        int? selected;
        int? targeting;
        readonly List<int> attackers = new List<int>();
        readonly Dictionary<int, int> blocks = new Dictionary<int, int>();
        int? pendingBlocker;
        string spotlight;
        float spotlightUntil;
        float cpuTimer = -1;
        float cpuBlockTimer = -1;
        int[] lastLife = { 0, 0 };
        float[] hitUntil = { 0, 0 };
        bool recorded;
        bool rulesOpen;

        // =========================
        // AVVIO AUTOMATICO
        // =========================

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Bootstrap()
        {
            if (FindAnyObjectByType<MemeArenaApp>() != null) return;
            var go = new GameObject("Meme Arena");
            var doc = go.AddComponent<UIDocument>();
            doc.panelSettings = CreatePanelSettings();
            go.AddComponent<MemeArenaApp>();
        }

        static PanelSettings CreatePanelSettings()
        {
            var ps = ScriptableObject.CreateInstance<PanelSettings>();
            ps.name = "Meme Arena Panel";
            // Si adatta a telefono e monitor: riferimento 1280×900, metà larghezza e metà altezza.
            ps.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            ps.referenceResolution = new Vector2Int(1280, 900);
            ps.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
            ps.match = 0.5f;
            // Tema vuoto: tutto lo stile arriva dal nostro foglio USS.
            ps.themeStyleSheet = ScriptableObject.CreateInstance<ThemeStyleSheet>();
            return ps;
        }

        void OnEnable()
        {
            var doc = GetComponent<UIDocument>();
            if (doc.panelSettings == null) doc.panelSettings = CreatePanelSettings();
            root = doc.rootVisualElement;
            root.Clear();
            root.AddToClassList("app");
            var sheet = styles != null ? styles : Resources.Load<StyleSheet>("MemeArenaStyles");
            if (sheet != null) root.styleSheets.Add(sheet);
            else Debug.LogWarning("Meme Arena: foglio di stile non trovato in Resources/MemeArenaStyles.");
            root.style.unityFontDefinition = FontDefinition.FromFont(Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"));
            root.RegisterCallback<KeyDownEvent>(OnKey, TrickleDown.TrickleDown);

            screen = new VisualElement();
            screen.AddToClassList("screen");
            root.Add(screen);
            ShowPick();
        }

        // =========================
        // CICLO
        // =========================

        void Update()
        {
            if (g == null || g.Over) return;
            bool dirty = false;

            // La CPU decide i blocchi quando attacchi tu.
            if (cpuBlockTimer >= 0)
            {
                cpuBlockTimer -= Time.deltaTime;
                if (cpuBlockTimer < 0)
                {
                    Engine.DeclareBlocks(g, Cpu, Ai.ChooseBlocks(g, Cpu));
                    attackers.Clear();
                    dirty = true;
                }
            }

            // Il turno della CPU, una mossa alla volta.
            if (g.Active == Cpu && g.Phase != Phase.Block)
            {
                if (cpuTimer < 0) cpuTimer = CpuDelay;
                cpuTimer -= Time.deltaTime;
                if (cpuTimer < 0)
                {
                    CpuStep();
                    cpuTimer = CpuDelay;
                    dirty = true;
                }
            }
            else
            {
                cpuTimer = -1;
            }

            if (spotlight != null && Time.time > spotlightUntil)
            {
                spotlight = null;
                dirty = true;
            }
            if ((hitUntil[0] > 0 && Time.time > hitUntil[0]) || (hitUntil[1] > 0 && Time.time > hitUntil[1]))
            {
                hitUntil[0] = hitUntil[1] = 0;
                dirty = true;
            }

            if (dirty) Changed();
        }

        void CpuStep()
        {
            var action = Ai.ChooseAction(g, Cpu);
            if (action.Type == AiActionType.Play)
            {
                var card = Engine.FindCard(g, action.Uid);
                if (card != null && card.Def.Type != CardType.Piattaforma)
                {
                    spotlight = card.Id;
                    spotlightUntil = Time.time + CpuDelay * 1.6f;
                }
            }
            Ai.Apply(g, Cpu, action);
        }

        /// <summary>Dopo ogni mossa: scossa a chi ha perso vita, risultato salvato, tutto ridisegnato.</summary>
        void Changed()
        {
            if (g != null)
            {
                for (int p = 0; p < 2; p++)
                {
                    if (g.Players[p].Life < lastLife[p]) hitUntil[p] = Time.time + 0.25f;
                    lastLife[p] = g.Players[p].Life;
                }
                if (g.Over && !recorded)
                {
                    recorded = true;
                    if (g.Winner == You) PlayerPrefs.SetInt(WinsKey, PlayerPrefs.GetInt(WinsKey) + 1);
                    else if (g.Winner == Cpu) PlayerPrefs.SetInt(LossesKey, PlayerPrefs.GetInt(LossesKey) + 1);
                    PlayerPrefs.Save();
                }
            }
            RenderGame();
        }

        // =========================
        // SCELTA DEL MAZZO
        // =========================

        void ShowPick()
        {
            g = null;
            ResetUi();
            screen.Clear();

            var pick = Add(screen, "pick");
            Label(pick, "Meme Arena", "pick__title");
            Label(pick, "Scegli il tuo mazzo", "pick__kicker");

            var grid = Add(pick, "pick__grid");
            Button first = null;
            foreach (var era in Cards.EraOrder)
            {
                var info = Cards.Eras[era];
                var b = DeckButton(grid, info.Name, info.Years, info.Style, CardArt.EraColor(era), () => StartGame(era));
                first ??= b;
            }
            DeckButton(grid, "A caso", "", "Lascia scegliere al destino.", new Color(0.68f, 0.67f, 0.79f), () =>
                StartGame(Cards.EraOrder[Random.Range(0, Cards.EraOrder.Length)]));

            int wins = PlayerPrefs.GetInt(WinsKey), losses = PlayerPrefs.GetInt(LossesKey);
            if (wins + losses > 0) Label(pick, $"Vittorie {wins} · Sconfitte {losses}", "pick__stats");

            AddRules(pick);
            first?.Focus();
        }

        Button DeckButton(VisualElement parent, string name, string years, string style, Color color, System.Action onClick)
        {
            var b = new Button(onClick);
            b.AddToClassList("deck");
            b.style.borderTopColor = b.style.borderBottomColor = b.style.borderLeftColor = b.style.borderRightColor = color;
            var title = Label(b, name, "deck__name");
            title.style.color = color;
            if (years != "") Label(b, years, "deck__years");
            Label(b, style, "deck__style");
            parent.Add(b);
            return b;
        }

        void StartGame(Era era)
        {
            var others = Cards.EraOrder.Where(e => e != era).ToArray();
            g = Engine.NewGame(era, others[Random.Range(0, others.Length)], Rng.Random());
            ResetUi();
            recorded = false;
            lastLife = new[] { g.Players[0].Life, g.Players[1].Life };
            Changed();
        }

        void ResetUi()
        {
            selected = null;
            targeting = null;
            attackers.Clear();
            blocks.Clear();
            pendingBlocker = null;
            spotlight = null;
            cpuTimer = -1;
            cpuBlockTimer = -1;
            hitUntil[0] = hitUntil[1] = 0;
        }

        // =========================
        // TAVOLO
        // =========================

        bool YourTurn => g != null && !g.Over && g.Active == You;
        bool MustBlock => g != null && !g.Over && g.Phase == Phase.Block && g.Active == Cpu;

        List<Target> TargetSet()
        {
            if (!targeting.HasValue) return null;
            var c = Engine.FindCard(g, targeting.Value);
            return c != null ? Engine.ValidTargets(g, You, c.Def) : new List<Target>();
        }

        void RenderGame()
        {
            if (g == null) return;
            screen.Clear();
            var targets = TargetSet();
            var board = Add(screen, "board");

            // ---- CPU ----
            var cpuSide = Add(board, "side");
            PlayerBar(cpuSide, Cpu, targets);
            CreatureRow(cpuSide, Cpu, targets);

            // ---- Centro ----
            var mid = Add(board, "mid");
            Label(mid, PhaseLabel(), "mid__phase");
            Actions(Add(mid, "mid__actions"));
            var log = Add(mid, "mid__log");
            foreach (var line in Enumerable.Reverse(g.Log).Take(4))
            {
                var l = Label(log, (line.Who == Cpu ? "◆ " : "") + line.Text, "mid__line");
                if (line.Who == Cpu) l.AddToClassList("mid__line--cpu");
            }
            if (spotlight != null)
            {
                var spot = Add(mid, "spotlight");
                Label(spot, "La CPU gioca", "spotlight__label");
                spot.Add(CardView(Cards.ById[spotlight], null));
            }

            // ---- Tu ----
            var youSide = Add(board, "side");
            CreatureRow(youSide, You, targets);
            PlayerBar(youSide, You, targets);
            Hand(youSide);

            // ---- Finestre ----
            if (selected.HasValue) DetailDialog(selected.Value);
            if (g.Over) OverDialog();
        }

        void PlayerBar(VisualElement parent, int pid, List<Target> targets)
        {
            var p = g.Players[pid];
            var bar = Add(parent, "bar");
            var face = Target.Face(pid);
            bool isTarget = targets != null && targets.Contains(face);

            var who = new Button(() => { if (isTarget) ResolveTarget(face); });
            who.AddToClassList("bar__who");
            who.focusable = isTarget;
            if (isTarget) who.AddToClassList("is-target");
            if (Time.time < hitUntil[pid]) who.AddToClassList("is-hit");
            SetBorder(who, CardArt.EraColor(p.Era));
            Label(who, (pid == You ? "Tu" : "CPU") + " · " + Cards.Eras[p.Era].Name, "bar__name");
            Label(who, "♥ " + p.Life, "bar__life");
            bar.Add(who);

            Label(bar, $"Hype {Engine.UntappedLands(g, pid)}/{p.Lands.Count}", "bar__chip");
            if (pid == Cpu) Label(bar, $"Mano {p.Hand.Count}", "bar__chip");
            Label(bar, $"Mazzo {p.Library.Count}", "bar__chip");
        }

        void CreatureRow(VisualElement parent, int pid, List<Target> targets)
        {
            var row = new ScrollView(ScrollViewMode.Horizontal);
            row.AddToClassList("row");
            parent.Add(row);
            var creatures = g.Players[pid].Creatures;
            if (creatures.Count == 0)
            {
                Label(row, "Nessuna creatura", "row__empty");
                return;
            }
            foreach (var c in creatures)
            {
                var slot = new Button(() => TapCard(c));
                slot.AddToClassList("slot");
                slot.Add(CardView(c.Def, c));
                bool attacking = g.Attackers.Contains(c.Uid) || attackers.Contains(c.Uid);
                if (targets != null && targets.Contains(Target.OfCard(c.Uid))) slot.AddToClassList("is-target");
                if (attacking) slot.AddToClassList(pid == You ? "is-attacking" : "is-attacking-down");
                if (pid == You && g.Phase == Phase.Attack && YourTurn && Engine.CanAttack(c)) slot.AddToClassList("is-ready");
                if (pendingBlocker == c.Uid) slot.AddToClassList("is-pending");
                if (pid == Cpu && MustBlock && g.Attackers.Contains(c.Uid) && CanBlockPending(c)) slot.AddToClassList("is-target");
                if (attacking) Label(slot, "Attacca", "slot__tag", "slot__tag--atk");
                if (blocks.ContainsValue(c.Uid)) Label(slot, "Blocca", "slot__tag", "slot__tag--block");
                if (blocks.ContainsKey(c.Uid)) Label(slot, "Bloccato", "slot__tag", "slot__tag--block");
                row.Add(slot);
            }
        }

        void Hand(VisualElement parent)
        {
            var hand = new ScrollView(ScrollViewMode.Horizontal);
            hand.AddToClassList("hand");
            parent.Add(hand);
            foreach (var c in g.Players[You].Hand)
            {
                var slot = new Button(() => TapCard(c));
                slot.AddToClassList("slot");
                slot.AddToClassList("slot--hand");
                if (Playable(c.Uid)) slot.AddToClassList("is-playable");
                slot.Add(CardView(c.Def, null));
                hand.Add(slot);
            }
        }

        bool Playable(int uid) => YourTurn && !targeting.HasValue && Engine.CanPlay(g, You, uid);

        bool CanBlockPending(Card attacker)
        {
            if (!pendingBlocker.HasValue) return false;
            var b = Engine.FindCard(g, pendingBlocker.Value);
            return b != null && Engine.CanBlock(b, attacker);
        }

        string PhaseLabel()
        {
            if (g.Over) return "Partita finita";
            if (g.Active == Cpu) return g.Phase == Phase.Block ? "La CPU attacca: scegli i bloccanti" : "Turno della CPU…";
            return g.Phase switch
            {
                Phase.Main => "Tuo turno: gioca carte, poi attacca",
                Phase.Attack => "Tocca le creature che attaccano",
                Phase.Block => "La CPU sceglie i bloccanti…",
                _ => "Dopo il combattimento: gioca carte o passa",
            };
        }

        void Actions(VisualElement bar)
        {
            if (targeting.HasValue)
            {
                var c = Engine.FindCard(g, targeting.Value);
                Label(bar, "Scegli un bersaglio per " + (c != null ? c.Def.Name : ""), "mid__hint");
                ActionButton(bar, "Annulla", false, () => { targeting = null; RenderGame(); });
                return;
            }
            if (MustBlock)
            {
                Label(bar, "Tocca una tua creatura, poi l'attaccante da fermare.", "mid__hint");
                ActionButton(bar, blocks.Count == 0 ? "Nessun blocco" : $"Conferma {blocks.Count} {(blocks.Count == 1 ? "blocco" : "blocchi")}", true, ConfirmBlocks);
                return;
            }
            if (!YourTurn) return;
            switch (g.Phase)
            {
                case Phase.Main:
                    ActionButton(bar, "Attacca", true, () => { Engine.BeginAttack(g, You); attackers.Clear(); Changed(); });
                    ActionButton(bar, "Fine turno", false, EndYourTurn);
                    break;
                case Phase.Attack:
                    var go = ActionButton(bar, $"Attacca con {attackers.Count}", true, ConfirmAttack);
                    go.SetEnabled(attackers.Count > 0);
                    ActionButton(bar, "Nessun attacco", false, () => { attackers.Clear(); ConfirmAttack(); });
                    break;
                case Phase.Main2:
                    ActionButton(bar, "Fine turno", true, EndYourTurn);
                    break;
            }
        }

        Button ActionButton(VisualElement parent, string text, bool primary, System.Action onClick)
        {
            var b = new Button(onClick) { text = text };
            b.AddToClassList("btn");
            b.AddToClassList(primary ? "btn--primary" : "btn--ghost");
            parent.Add(b);
            return b;
        }

        // =========================
        // CARTA
        // =========================

        VisualElement CardView(CardDef d, Card c, bool big = false)
        {
            var card = new VisualElement();
            card.AddToClassList("mc");
            if (big) card.AddToClassList("mc--big");
            if (d.Type == CardType.Trend) card.AddToClassList("mc--trend");
            if (c != null && c.Tapped) card.AddToClassList("mc--tapped");
            SetBorder(card, CardArt.EraColor(d.Era));

            var top = Add(card, "mc__top");
            Label(top, d.Name, "mc__name");
            if (d.Type != CardType.Piattaforma && !d.Token)
            {
                var cost = Label(top, d.Cost.ToString(), "mc__cost");
                cost.style.backgroundColor = CardArt.EraColor(d.Era);
            }

            var art = Add(card, "mc__art");
            art.style.backgroundImage = Background.FromTexture2D(CardArt.For(d));
            if (c != null && c.Sick && d.Type == CardType.Meme && !d.Has(Keyword.Virale)) Label(art, "zz", "mc__sick");

            string type = d.Type == CardType.Meme ? (d.Token ? "Pedina" : "Meme") : d.Type == CardType.Trend ? "Trend" : "Piattaforma";
            Label(card, type + " · " + Cards.Eras[d.Era].Name, "mc__type");

            if (d.Keywords.Length > 0)
            {
                var kws = Add(card, "mc__keywords");
                foreach (var k in d.Keywords) Label(kws, KeywordInfo.Label(k), "mc__keyword");
            }

            if (big)
            {
                if (d.Text != "") Label(card, d.Text, "mc__text");
                foreach (var k in d.Keywords) Label(card, KeywordInfo.Label(k) + ": " + KeywordInfo.Help(k), "mc__text");
                if (d.Flavor != "") Label(card, d.Flavor, "mc__flavor");
            }

            if (d.Type == CardType.Meme)
            {
                int atk = c?.Atk ?? d.Atk;
                int def = c != null ? c.Toughness - c.Damage : d.Def;
                var stats = Label(card, $"{atk}/{def}", "mc__stats");
                SetBorder(stats, CardArt.EraColor(d.Era));
                if (c != null && (c.BonusAtk > 0 || c.BonusDef > 0)) stats.AddToClassList("mc__stats--up");
                if (c != null && c.Damage > 0) stats.AddToClassList("mc__stats--hurt");
            }
            return card;
        }

        // =========================
        // INTERAZIONI
        // =========================

        void TapCard(Card c)
        {
            if (g.Over)
            {
                OpenDetail(c.Uid);
                return;
            }

            // Scelta del bersaglio.
            if (targeting.HasValue)
            {
                var t = Target.OfCard(c.Uid);
                if (TargetSet().Contains(t)) ResolveTarget(t);
                return;
            }

            bool mineOnField = c.Owner == You && g.Players[You].Creatures.Contains(c);

            // Dichiarazione attaccanti.
            if (g.Phase == Phase.Attack && YourTurn && mineOnField)
            {
                if (!Engine.CanAttack(c))
                {
                    OpenDetail(c.Uid);
                    return;
                }
                if (!attackers.Remove(c.Uid)) attackers.Add(c.Uid);
                RenderGame();
                return;
            }

            // Blocchi: prima il tuo bloccante, poi l'attaccante.
            if (MustBlock)
            {
                if (mineOnField)
                {
                    var existing = blocks.FirstOrDefault(kv => kv.Value == c.Uid);
                    if (blocks.ContainsValue(c.Uid)) blocks.Remove(existing.Key);
                    else if (!c.Tapped) pendingBlocker = pendingBlocker == c.Uid ? (int?)null : c.Uid;
                    else OpenDetail(c.Uid);
                    RenderGame();
                    return;
                }
                if (c.Owner == Cpu && g.Attackers.Contains(c.Uid) && pendingBlocker.HasValue)
                {
                    var blocker = Engine.FindCard(g, pendingBlocker.Value);
                    if (blocker != null && Engine.CanBlock(blocker, c))
                    {
                        foreach (var key in blocks.Where(kv => kv.Value == blocker.Uid).Select(kv => kv.Key).ToList()) blocks.Remove(key);
                        blocks[c.Uid] = blocker.Uid;
                        pendingBlocker = null;
                    }
                    RenderGame();
                    return;
                }
            }

            OpenDetail(c.Uid);
        }

        void OpenDetail(int uid)
        {
            selected = uid;
            RenderGame();
        }

        void CloseDetail()
        {
            selected = null;
            RenderGame();
        }

        void PlaySelected()
        {
            if (!selected.HasValue) return;
            int uid = selected.Value;
            selected = null;
            if (Engine.NeedsTarget(g, You, uid))
            {
                targeting = uid;
                RenderGame();
                return;
            }
            Engine.Play(g, You, uid);
            Changed();
        }

        void ResolveTarget(Target t)
        {
            if (!targeting.HasValue) return;
            int uid = targeting.Value;
            targeting = null;
            Engine.Play(g, You, uid, t);
            Changed();
        }

        void ConfirmAttack()
        {
            Engine.DeclareAttackers(g, You, attackers);
            if (g.Phase == Phase.Block) cpuBlockTimer = CpuDelay; // la CPU ci pensa un attimo
            else attackers.Clear();
            Changed();
        }

        void ConfirmBlocks()
        {
            Engine.DeclareBlocks(g, You, blocks);
            blocks.Clear();
            pendingBlocker = null;
            Changed();
        }

        void EndYourTurn()
        {
            Engine.EndTurn(g, You);
            Changed();
        }

        void OnKey(KeyDownEvent e)
        {
            if (e.keyCode != KeyCode.Escape) return;
            if (selected.HasValue) CloseDetail();
            else if (targeting.HasValue) { targeting = null; RenderGame(); }
            else if (pendingBlocker.HasValue) { pendingBlocker = null; RenderGame(); }
        }

        // =========================
        // FINESTRE
        // =========================

        void DetailDialog(int uid)
        {
            var c = Engine.FindCard(g, uid);
            if (c == null)
            {
                selected = null;
                return;
            }
            bool inHand = g.Players[c.Owner].Hand.Contains(c);
            var scrim = Add(screen, "scrim");
            scrim.RegisterCallback<ClickEvent>(e => { if (e.target == scrim) CloseDetail(); });
            var dialog = Add(scrim, "dialog");
            dialog.Add(CardView(c.Def, inHand ? null : c, big: true));
            var actions = Add(dialog, "dialog__actions");
            Button focus = null;
            if (c.Owner == You && inHand)
            {
                bool ok = Playable(c.Uid);
                focus = ActionButton(actions, ok ? "Gioca" : "Non puoi giocarla ora", true, PlaySelected);
                focus.SetEnabled(ok);
                if (!ok) focus = null;
            }
            var close = ActionButton(actions, "Chiudi", false, CloseDetail);
            (focus ?? close).Focus();
        }

        void OverDialog()
        {
            var scrim = Add(screen, "scrim", "scrim--solid");
            var dialog = Add(scrim, "dialog", "dialog--over");
            Label(dialog, $"Turno {(g.Turn + 1) / 2}", "dialog__kicker");
            Label(dialog, g.Winner == You ? "Hai vinto!" : g.Winner == Cpu ? "Ha vinto la CPU" : "Pareggio", "dialog__title");
            Label(dialog, $"Vittorie {PlayerPrefs.GetInt(WinsKey)} · Sconfitte {PlayerPrefs.GetInt(LossesKey)}", "dialog__text");
            var actions = Add(dialog, "dialog__actions");
            ActionButton(actions, "Rigioca", true, ShowPick).Focus();
        }

        void AddRules(VisualElement parent)
        {
            var box = Add(parent, "rules");
            var toggle = new Button(() => { rulesOpen = !rulesOpen; ShowPick(); }) { text = rulesOpen ? "Come si gioca ▲" : "Come si gioca ▼" };
            toggle.AddToClassList("rules__toggle");
            box.Add(toggle);
            if (!rulesOpen) return;
            foreach (var line in new[]
            {
                "Ogni giocatore parte con 20 vite e 7 carte. Vince chi porta l'altro a zero, o chi resta con carte nel mazzo quando l'altro deve pescare e non può.",
                "Piattaforme: una per turno. Ognuna dà 1 hype a turno, e l'hype paga le carte.",
                "Meme: sono le creature. Appena entrano dormono (zz): attaccano dal turno dopo.",
                "Trend: effetti immediati come danni, carte o vite. Poi vanno negli scarti.",
                "Attacco: chi attacca si tappa. L'avversario può bloccare con le sue creature; i danni si scambiano, gli attaccanti non bloccati colpiscono il giocatore.",
                "Fine turno: i danni sulle creature si curano e i potenziamenti finiscono.",
            }) Label(box, line, "rules__line");
            foreach (Keyword k in System.Enum.GetValues(typeof(Keyword)))
                Label(box, KeywordInfo.Label(k) + ": " + KeywordInfo.Help(k), "rules__line", "rules__keyword");
        }

        // =========================
        // AIUTI
        // =========================

        static VisualElement Add(VisualElement parent, params string[] classes)
        {
            var e = new VisualElement();
            foreach (var c in classes) e.AddToClassList(c);
            parent.Add(e);
            return e;
        }

        static Label Label(VisualElement parent, string text, params string[] classes)
        {
            var l = new Label(text);
            foreach (var c in classes) l.AddToClassList(c);
            parent.Add(l);
            return l;
        }

        static void SetBorder(VisualElement e, Color color)
        {
            e.style.borderTopColor = color;
            e.style.borderBottomColor = color;
            e.style.borderLeftColor = color;
            e.style.borderRightColor = color;
        }
    }
}
