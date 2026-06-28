/** Shared constants and types for the Armin backup/restore archive format. */

export const BACKUP_FORMAT = "armin-backup";
export const BACKUP_FORMAT_VERSION = 2;

/** Zip entry names inside a backup archive. */
export const BACKUP_MANIFEST_ENTRY = "manifest.json";
export const BACKUP_DB_ENTRY = "armin.db";
export const BACKUP_MEDIA_PREFIX = "media/";

export type BackupManifest = {
  /** Discriminator identifying an Armin backup archive. */
  format: typeof BACKUP_FORMAT;
  /** Archive layout version, independent of the app version. */
  formatVersion: number;
  /** App version that produced the backup (informational). */
  app: string;
  /** Schema version (migration count) the database was at when exported. */
  schemaVersion: number;
  profileName: string;
  /** ISO timestamp of the export. */
  exportedAt: string;
  deckCount: number;
  flashcardCount: number;
};
