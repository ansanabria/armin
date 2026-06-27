import path from "node:path";
import { describe, expect, it } from "vitest";
import { configureUserDataPath } from "./user-data";

function createApp({ isPackaged }: { isPackaged: boolean }) {
  const setPathCalls: { name: "userData"; path: string }[] = [];

  return {
    app: {
      isPackaged,
      getPath: (name: "appData") => {
        expect(name).toBe("appData");
        return "/home/test/.config";
      },
      setPath: (name: "userData", nextPath: string) => {
        setPathCalls.push({ name, path: nextPath });
      },
    },
    setPathCalls,
  };
}

describe("configureUserDataPath", () => {
  it("uses ARMIN_DATA_DIR when explicitly provided", () => {
    const { app, setPathCalls } = createApp({ isPackaged: false });

    configureUserDataPath(app, { ARMIN_DATA_DIR: "/tmp/armin-dev" });

    expect(setPathCalls).toEqual([
      { name: "userData", path: "/tmp/armin-dev" },
    ]);
  });

  it("uses a separate development data directory for unpackaged builds", () => {
    const { app, setPathCalls } = createApp({ isPackaged: false });

    configureUserDataPath(app, {});

    expect(setPathCalls).toEqual([
      { name: "userData", path: path.join("/home/test/.config", "Armin Dev") },
    ]);
  });

  it("leaves packaged builds on Electron's production userData path", () => {
    const { app, setPathCalls } = createApp({ isPackaged: true });

    configureUserDataPath(app, {});

    expect(setPathCalls).toEqual([]);
  });
});
