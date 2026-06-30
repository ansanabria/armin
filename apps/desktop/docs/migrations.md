# Database Migrations

Armin stores each Profile in its own local SQLite database. The app upgrades those
databases by running the SQL files in `drizzle/` with Drizzle's SQLite migrator.

## Workflow

1. Update the current schema in `src/main/db/schema.ts`.
2. Generate a descriptively named migration for ordinary schema changes:
   `npm run db:generate --workspace apps/desktop -- --name=<descriptive_snake_case_name>`.
3. Review the generated SQL before committing it.
4. Commit Drizzle's generated snapshot and journal changes with the SQL whenever
   `drizzle-kit generate` creates them.
5. Hand-edit or hand-author SQL only when the upgrade semantics require it:
   data backfills, table renames, SQLite table rebuild constraints, or preserving
   user history that generated DDL would lose.
6. Manually verify hand-authored or materially hand-edited migrations against a
   copied or temporary old-shape database before release.
7. Run `npm run typecheck`, `npm run lint`, and `npm run test --workspace apps/desktop`.

When a change touches migration discovery, packaging, or the bundled `drizzle/`
folder, also run `npm run package --workspace apps/desktop` and
`npm run check:package --workspace apps/desktop`.

Agents may edit generated SQL directly when the semantic mapping is obvious from
the code and domain model. If the mapping is ambiguous, ask before writing the
backfill. Record the manual verification performed in the PR or issue instead of
adding a one-off migration regression test by default.

## Release Boundary

Once a migration has appeared in any tagged release artifact, including alpha, do
not rewrite it. Add a new migration that carries the fix forward.

Before a tagged release, rewriting the newest local migration is acceptable only
when it has not become someone else's durable upgrade path.

## Drizzle Metadata

The existing migration history has incomplete Drizzle snapshot metadata. Do not
reconstruct old snapshots as cleanup. Runtime migration depends on the SQL files
and `drizzle/meta/_journal.json`, and tests guard that bundle.

For future generated migrations, keep Drizzle's generated snapshot metadata and
journal changes with the SQL file. If a future migration is fully manual, update
the journal and SQL deliberately rather than pretending the migration was
generated.

## Naming

Migration names should always describe the schema or data change. Use snake_case
names, not generated fantasy names. Agents must pass `--name` when running
`npm run db:generate --workspace apps/desktop`, for example:

```bash
npm run db:generate --workspace apps/desktop -- --name=add_deck_scheduling_overrides
```

For custom manual migrations, use Drizzle's custom migration generation with a
descriptive name:

```bash
npm run db:generate --workspace apps/desktop -- --custom --name=backfill_flashcard_content
```

Backup and restore compatibility also uses the journal entry count as the local
schema version. A build can restore backups from its own schema version or older,
but refuses backups from a newer journal count.

## Verifying Manual Migrations

Manual and materially edited migrations should be checked with an ephemeral
old-shape database. The verification should:

- create a temporary SQLite database
- create the old schema shape directly
- seed data that exercises the upgrade behavior
- apply the migration SQL
- inspect that data, relationships, and history were preserved as intended
- delete the temporary database afterward

Do not keep these checks as permanent tests unless the migration encodes a
long-lived core service invariant rather than a one-time upgrade path.
