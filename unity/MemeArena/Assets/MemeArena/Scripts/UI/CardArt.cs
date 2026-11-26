// =========================
// MEME ARENA — ARTE DELLE CARTE
// Ogni carta ha un'icona pixel-art 10×10 generata dal suo id:
// simmetrica come uno sprite, nei colori della sua era.
// Sempre la stessa per la stessa carta, nessun file da importare.
// =========================

using System.Collections.Generic;
using MemeArena.Core;
using UnityEngine;

namespace MemeArena.UI
{
    public static class CardArt
    {
        const int Size = 10;
        static readonly Dictionary<string, Texture2D> Cache = new Dictionary<string, Texture2D>();

        public static Color EraColor(Era era)
        {
            ColorUtility.TryParseHtmlString(Cards.Eras[era].Color, out var c);
            return c;
        }

        /// <summary>Hash FNV-1a: stabile tra piattaforme, a differenza di string.GetHashCode.</summary>
        static uint Hash(string s)
        {
            uint h = 2166136261;
            foreach (char ch in s)
            {
                h ^= ch;
                h *= 16777619;
            }
            return h;
        }

        public static Texture2D For(CardDef def)
        {
            if (Cache.TryGetValue(def.Id, out var cached)) return cached;

            var tex = new Texture2D(Size, Size, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Point,
                wrapMode = TextureWrapMode.Clamp,
                name = "art-" + def.Id,
            };

            var main = EraColor(def.Era);
            var dark = Color.Lerp(main, new Color(0.07f, 0.07f, 0.16f), 0.55f);
            var light = Color.Lerp(main, Color.white, 0.55f);
            var clear = new Color(0, 0, 0, 0);
            var rng = new Rng(Hash(def.Id));
            var px = new Color[Size * Size];

            if (def.Type == CardType.Piattaforma)
            {
                // Piattaforme: righe diagonali, come un pavimento.
                for (int y = 0; y < Size; y++)
                    for (int x = 0; x < Size; x++)
                        px[y * Size + x] = (x + y) % 4 < 2 ? dark : main;
            }
            else
            {
                // Metà sinistra casuale, specchiata a destra: sembra sempre "una creatura".
                for (int y = 0; y < Size; y++)
                {
                    for (int x = 0; x < Size / 2; x++)
                    {
                        // Più pieno al centro, più vuoto ai bordi.
                        double edge = (Size / 2 - 1 - x) * 0.09 + (y == 0 || y == Size - 1 ? 0.25 : 0);
                        double r = rng.Next();
                        Color c = r < 0.48 - edge ? main : r < 0.62 - edge ? dark : r < 0.68 ? light : clear;
                        px[y * Size + x] = c;
                        px[y * Size + (Size - 1 - x)] = c;
                    }
                }
                // Gli "occhi": due pixel chiari simmetrici, così ogni icona ha un volto.
                int ey = 3 + rng.Range(3);
                int ex = 2 + rng.Range(2);
                px[ey * Size + ex] = Color.white;
                px[ey * Size + (Size - 1 - ex)] = Color.white;
                if (def.Type == CardType.Trend)
                {
                    // I trend hanno un bordo tratteggiato: sono effetti, non creature.
                    for (int i = 0; i < Size; i += 2)
                    {
                        px[i] = light;
                        px[(Size - 1) * Size + i + 1] = light;
                    }
                }
            }

            tex.SetPixels(px);
            tex.Apply(false, true);
            Cache[def.Id] = tex;
            return tex;
        }
    }
}
