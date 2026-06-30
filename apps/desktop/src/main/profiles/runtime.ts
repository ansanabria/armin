import { getDb, initDb } from "../db";
import { runMigrations } from "../db/migrate";
import type { ServiceContext } from "../services/context";
import { upgradeLegacyFlashcardMedia } from "../services/media";

const readyProfiles = new Set<string>();

export async function ensureProfileReady(
  profileId: string,
): Promise<ServiceContext> {
  if (!readyProfiles.has(profileId)) {
    await initDb(profileId);
    await runMigrations(profileId);
    await upgradeLegacyFlashcardMedia({ profileId, db: getDb(profileId) });
    readyProfiles.add(profileId);
  }

  return profileContext(profileId);
}

export function profileContext(profileId: string): ServiceContext {
  return { profileId, db: getDb(profileId) };
}

export function forgetProfileRuntime(profileId: string): void {
  readyProfiles.delete(profileId);
}

export function resetProfileRuntime(): void {
  readyProfiles.clear();
}
