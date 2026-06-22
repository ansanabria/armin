# Database Migrations

Armin stores each Profile in its own local SQLite database. The app upgrades those
databases by running the SQL files in `drizzle/` with Drizzle's SQLite migrator.

## Workflow

1. Update the current schema in `src/main/db/schema.ts`.
2. Generate a descriptively named migration for ordinary schema changes:
   `npm run db:generate -- --name=<descriptive_snake_case_name>`.
3. Review the generated SQL before committing it.
4. Commit Drizzle's generated snapshot and journal changes with the SQL whenever
   `drizzle-kit generate` creates them.
5. Hand-edit or hand-author SQL only when the upgrade semantics require it:
   data backfills, table renames, SQLite table rebuild constraints, or preserving
   user history that generated DDL would lose.
6. Add an isolated old-shape migration test for every hand-authored or materially
   hand-edited migration.
7. Run `npm run typecheck`, `npm run lint`, and `npm test`.

When a change touches migration discovery, packaging, or the bundled `drizzle/`
folder, also run `npm run package`.

Agents may edit generated SQL directly when the semantic mapping is obvious from
the code and domain model. If the mapping is ambiguous, ask before writing the
backfill. In both cases, the old-shape migration test is the evidence that the
upgrade preserves the intended data.

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
`npm run db:generate`, for example:

```bash
npm run db:generate -- --name=add_deck_scheduling_overrides
```

For custom manual migrations, use Drizzle's custom migration generation with a
descriptive name:

```bash
npm run db:generate -- --custom --name=backfill_flashcard_content
```

Backup and restore compatibility also uses the journal entry count as the local
schema version. A build can restore backups from its own schema version or older,
but refuses backups from a newer journal count.

## Testing Manual Migrations

Manual and materially edited migrations must have an ephemeral old-shape test.
The test should:

- create a temporary SQLite database
- create the old schema shape directly
- seed data that exercises the upgrade behavior
- apply the migration SQL
- assert that data, relationships, and history were preserved as intended
- delete the temporary database afterward

Add a full-chain `runMigrations` test when the migration is high-risk or depends
on the surrounding migration sequence.
