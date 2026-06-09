import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const userDataDir = vi.hoisted(() => {
  let dir = "";
  return {
    get: () => dir,
    set: (next: string) => {
      dir = next;
    },
  };
});

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => {
      if (name === "userData") return userDataDir.get();
      throw new Error(`Unexpected getPath: ${name}`);
    },
    getAppPath: () => "/repo/armin",
    isPackaged: false,
  },
}));

import { getMcpSetup } from "./mcp";

describe("getMcpSetup", () => {
  const originalDataDir = process.env.ARMIN_DATA_DIR;

  beforeEach(() => {
    userDataDir.set("/default/user/data");
  });

  afterEach(() => {
    if (originalDataDir === undefined) {
      delete process.env.ARMIN_DATA_DIR;
    } else {
      process.env.ARMIN_DATA_DIR = originalDataDir;
    }
  });

  it("reports ARMIN_DATA_DIR when set", () => {
    process.env.ARMIN_DATA_DIR = "/tmp/armin-test-data";
    const setup = getMcpSetup("profile-1");
    expect(setup.dataDir).toBe("/tmp/armin-test-data");
    expect(setup.profileId).toBe("profile-1");
    expect(setup.isPackaged).toBe(false);
    expect(setup.repoPath).toBe("/repo/armin");
  });

  it("falls back to Electron userData when ARMIN_DATA_DIR is unset", () => {
    delete process.env.ARMIN_DATA_DIR;
    const setup = getMcpSetup("default");
    expect(setup.dataDir).toBe("/default/user/data");
    expect(setup.profileId).toBe("default");
  });
});
