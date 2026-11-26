# Meme Arena — versione Unity

Lo stesso gioco di carte del portfolio, rifatto in Unity con C#.

## Aprirlo

1. Installa **Unity Hub** e, da Hub, l'editor **6000.3.29f1 (LTS)**.
   Per pubblicarlo sul web aggiungi il modulo **WebGL Build Support**.
2. In Hub: **Add → Add project from disk** e scegli la cartella `unity/MemeArena`.
3. Al primo avvio Unity importa il progetto (qualche minuto).
4. Menu in alto **Meme Arena → Crea scena**, poi premi **Play**.

L'interfaccia si crea da sola all'avvio, in qualsiasi scena: non serve trascinare nulla.

## Com'è fatto

| Cartella | Cosa contiene |
|---|---|
| `Assets/MemeArena/Scripts/Core` | Regole, carte e CPU in C# puro, senza UnityEngine |
| `Assets/MemeArena/Scripts/UI` | Interfaccia UI Toolkit costruita da codice, icone pixel-art generate |
| `Assets/MemeArena/Scripts/Editor` | Menu **Meme Arena**: crea scena, build WebGL / Linux / Windows |
| `Assets/MemeArena/Resources` | Foglio di stile USS |
| `Assets/MemeArena/Tests/EditMode` | Test NUnit (Window → General → Test Runner) |

## Controlli senza aprire Unity

```bash
dotnet test unity/dotnet-tests
```

Esegue i test delle regole con .NET 8, comprese 25 partite intere CPU contro CPU.

```bash
dotnet build unity/dotnet-check -p:UnityEditorPath=/percorso/Unity/Editor
```

Compila tutti gli script contro le librerie dell'editor Unity indicato.
