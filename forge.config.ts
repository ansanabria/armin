import fs from "node:fs";
import path from "node:path";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { MakerAppImage } from "@reforged/maker-appimage";

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: path.resolve(__dirname, "assets/icons/icon"),
    extraResource: ["./assets/icons"],
    // Deny-by-default packaging: ship the bundled output, migrations, and only
    // the native runtime dependency (better-sqlite3 + its two pure-JS deps).
    // The AutoUnpackNatives plugin extracts the compiled .node from the asar.
    ignore: (file) => {
      if (!file) return false;
      if (file === "/node_modules") return false;

      const keep = [
        "/.vite",
        "/drizzle",
        "/node_modules/better-sqlite3",
        "/node_modules/bindings",
        "/node_modules/file-uri-to-path",
      ];
      return !keep.some(
        (prefix) => file === prefix || file.startsWith(`${prefix}/`),
      );
    },
  },
  rebuildConfig: {
    force: true,
    onlyModules: ["better-sqlite3"],
  },
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ["darwin"]),
    new MakerAppImage({
      options: {
        bin: "armin-launch",
        icon: path.resolve(__dirname, "assets/icons/icon.svg"),
        categories: ["Education", "Office"],
        genericName: "Flashcard app",
        keywords: ["flashcards", "spaced repetition", "study"],
      },
    }),
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "ansanabria",
          name: "armin",
        },
        prerelease: true,
        draft: false,
        force: true,
        generateReleaseNotes: true,
      },
    },
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process,
      // Preload scripts, Worker process, etc.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the
          // corresponding file of `config`.
          entry: "src/main/main.ts",
          config: "vite.main.config.mts",
          target: "main",
        },
        {
          entry: "src/preload/preload.ts",
          config: "vite.preload.config.mts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.mts",
        },
        {
          name: "profile_picker",
          config: "vite.profile-picker.config.mts",
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  hooks: {
    // AppImages mount via FUSE (nosuid), so Electron's setuid sandbox helper
    // can never be privileged and the app aborts on launch unless started with
    // --no-sandbox. The AppImage maker makes AppRun a symlink to the binary, so
    // we drop a launcher script next to it and point the maker's `bin` at it.
    postPackage: async (_config, { outputPaths }) => {
      const launcher = [
        "#!/bin/sh",
        'HERE="$(dirname "$(readlink -f "$0")")"',
        'exec "$HERE/Armin" --no-sandbox "$@"',
        "",
      ].join("\n");
      for (const outputPath of outputPaths) {
        if (!fs.existsSync(path.join(outputPath, "Armin"))) continue;
        fs.writeFileSync(path.join(outputPath, "armin-launch"), launcher, {
          mode: 0o755,
        });
      }
    },
  },
};

export default config;
