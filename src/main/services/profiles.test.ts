import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
  },
}));

import { createProfile, getProfile, listProfiles } from "./profiles";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "armin-profiles-"));
  userDataDir.set(root);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("profiles service", () => {
  it("creates and lists profiles in profiles.json", () => {
    expect(listProfiles()).toEqual([]);

    const profile = createProfile("  Elliot  ");
    expect(profile.name).toBe("Elliot");
    expect(profile.id).toBeTruthy();
    expect(profile.createdAt).toBeTruthy();

    const listed = listProfiles();
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe("Elliot");
  });

  it("looks up a profile by id", () => {
    const created = createProfile("Test");
    const found = getProfile(created.id);
    expect(found?.name).toBe("Test");
    expect(getProfile("missing-id")).toBeUndefined();
  });

  it("persists multiple profiles across reads", () => {
    createProfile("Alpha");
    createProfile("Beta");
    const names = listProfiles()
      .map((p) => p.name)
      .sort();
    expect(names).toEqual(["Alpha", "Beta"]);
  });

  it("rejects empty profile names", () => {
    expect(() => createProfile("   ")).toThrow(/Profile name is required/);
  });
});
