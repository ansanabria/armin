import { strFromU8, unzipSync } from "fflate";
import { deleteProfileData, initDb, writeProfileDbFile } from "../db";
import { runMigrations } from "../db/migrate";
import { getLocalSchemaVersion } from "../db/schema-version";
import { createProfile, deleteProfile, type Profile } from "./profiles";
import {
  BACKUP_DB_ENTRY,
  BACKUP_FORMAT,
  BACKUP_MANIFEST_ENTRY,
  type BackupManifest,
} from "./backup-format";

/**
 * Restore a profile from a backup archive produced by the export service. This
 * is non-destructive: it always creates a *new* profile and never touches any
 * existing data. The snapshot is opened and migrated forward to the current
 * schema, so older backups keep working after the app updates.
 */
export async function restoreProfileFromZip(
  bytes: Uint8Array,
  opts: { name?: string } = {},
): Promise<{ profile: Profile; deckCount: number; flashcardCount: number }> {
  const files = unzipSync(bytes);

  const manifestEntry = files[BACKUP_MANIFEST_ENTRY];
  if (!manifestEntry) {
    throw new Error("This file isn't an Armin backup (missing manifest.json).");
  }
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(strFromU8(manifestEntry)) as BackupManifest;
  } catch {
    throw new Error("This backup's manifest is corrupted.");
  }
  if (manifest.format !== BACKUP_FORMAT) {
    throw new Error("This file isn't an Armin backup.");
  }
  if (
    typeof manifest.schemaVersion === "number" &&
    manifest.schemaVersion > getLocalSchemaVersion()
  ) {
    throw new Error(
      "This backup was made with a newer version of Armin. Update Armin and try again.",
    );
  }

  const dbBytes = files[BACKUP_DB_ENTRY];
  if (!dbBytes || dbBytes.length === 0) {
    throw new Error("This backup is missing its database (armin.db).");
  }

  const name = opts.name?.trim() || restoredName(manifest.profileName);
  const profile = createProfile(name);
  try {
    writeProfileDbFile(profile.id, dbBytes);
    await initDb(profile.id);
    await runMigrations(profile.id);
  } catch (error) {
    // Roll back the half-created profile so a failed restore leaves no trace.
    try {
      deleteProfileData(profile.id);
    } catch {
      // best effort
    }
    try {
      deleteProfile(profile.id);
    } catch {
      // best effort
    }
    throw error instanceof Error
      ? new Error(`Couldn't restore this backup: ${error.message}`)
      : error;
  }

  return {
    profile,
    deckCount: manifest.deckCount ?? 0,
    flashcardCount: manifest.flashcardCount ?? 0,
  };
}

function restoredName(profileName: string | undefined): string {
  const trimmed = profileName?.trim();
  return trimmed ? `Restored: ${trimmed}` : "Restored profile";
}
