// =========================
// MEME ARENA — STRUMENTI DELL'EDITOR
// Menu "Meme Arena" in alto: crea la scena e fa le build.
// Gli stessi metodi si lanciano da riga di comando, per esempio:
//   Unity -batchmode -quit -projectPath unity/MemeArena -executeMethod MemeArena.EditorTools.MemeArenaBuild.BuildWebGL
// =========================

using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace MemeArena.EditorTools
{
    public static class MemeArenaBuild
    {
        const string ScenePath = "Assets/MemeArena/Scenes/MemeArena.unity";

        /// <summary>Scena minima: una telecamera con lo sfondo notte. L'interfaccia si crea da sola all'avvio.</summary>
        [MenuItem("Meme Arena/Crea scena")]
        public static void CreateScene()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var cam = new GameObject("Main Camera", typeof(Camera)).GetComponent<Camera>();
            cam.tag = "MainCamera";
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color32(12, 13, 32, 255);
            cam.orthographic = true;

            EditorSceneManager.SaveScene(scene, ScenePath);

            var scenes = EditorBuildSettings.scenes.Where(s => s.path != ScenePath).ToList();
            scenes.Insert(0, new EditorBuildSettingsScene(ScenePath, true));
            EditorBuildSettings.scenes = scenes.ToArray();

            PlayerSettings.productName = "Meme Arena";
            PlayerSettings.companyName = "Davide Di Biasio";
            PlayerSettings.defaultScreenWidth = 1280;
            PlayerSettings.defaultScreenHeight = 900;
            AssetDatabase.SaveAssets();
            Debug.Log("Meme Arena: scena creata in " + ScenePath);
        }

        [MenuItem("Meme Arena/Build WebGL")]
        public static void BuildWebGL() => Build(BuildTarget.WebGL, "Builds/WebGL");

        [MenuItem("Meme Arena/Build Linux")]
        public static void BuildLinux() => Build(BuildTarget.StandaloneLinux64, "Builds/Linux/MemeArena.x86_64");

        [MenuItem("Meme Arena/Build Windows")]
        public static void BuildWindows() => Build(BuildTarget.StandaloneWindows64, "Builds/Windows/MemeArena.exe");

        static void Build(BuildTarget target, string output)
        {
            if (!File.Exists(ScenePath)) CreateScene();
            if (target == BuildTarget.WebGL)
            {
                // Più leggero da pubblicare su un sito statico come il portfolio.
                PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
                PlayerSettings.WebGL.decompressionFallback = true;
            }

            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = output,
                target = target,
                options = BuildOptions.None,
            });

            var summary = report.summary;
            Debug.Log($"Meme Arena: build {target} {summary.result}, {summary.totalSize / (1024 * 1024)} MB, {summary.totalErrors} errori.");
            if (Application.isBatchMode) EditorApplication.Exit(summary.result == BuildResult.Succeeded ? 0 : 1);
        }
    }
}
