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
    ignore: (file) => {
      if (!file) return false;
      if (file === "/node_modules" || file === "/node_modules/@libsql") {
        return false;
      }
      if (file === "/node_modules/@neon-rs") {
        return false;
      }

      return ![
        "/.vite",
        "/node_modules/libsql",
        "/node_modules/@neon-rs/load",
        "/node_modules/detect-libc",
        "/node_modules/@libsql/linux-x64-gnu",
        "/node_modules/@libsql/linux-x64-musl",
      ].some((prefix) => file.startsWith(prefix));
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ["darwin"]),
    new MakerAppImage({
      options: {
        bin: "Armin",
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
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
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
};

export default config;
