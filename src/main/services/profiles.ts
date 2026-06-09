import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export type Profile = {
  id: string;
  name: string;
  createdAt: string;
};

type ProfileStore = {
  profiles: Profile[];
};

const STORE_VERSION = 1;

function storePath() {
  return path.join(app.getPath("userData"), "profiles.json");
}

function readStore(): ProfileStore {
  const file = storePath();
  if (!fs.existsSync(file)) {
    return { profiles: [] };
  }

  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as ProfileStore;
    if (!Array.isArray(parsed.profiles)) {
      return { profiles: [] };
    }
    return { profiles: parsed.profiles };
  } catch {
    return { profiles: [] };
  }
}

function writeStore(store: ProfileStore) {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ version: STORE_VERSION, ...store }, null, 2),
    "utf8",
  );
}

export function listProfiles(): Profile[] {
  return readStore().profiles;
}

export function createProfile(name: string): Profile {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Profile name is required.");
  }
  const store = readStore();
  const profile: Profile = {
    id: crypto.randomUUID(),
    name: trimmed,
    createdAt: new Date().toISOString(),
  };
  store.profiles.push(profile);
  writeStore(store);
  return profile;
}

export function getProfile(id: string): Profile | undefined {
  return readStore().profiles.find((profile) => profile.id === id);
}
