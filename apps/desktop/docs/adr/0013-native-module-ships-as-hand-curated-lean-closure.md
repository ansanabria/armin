# better-sqlite3 ships as a hand-curated lean native closure

`better-sqlite3` is the only dependency that cannot be bundled: Vite inlines every
pure-JS dependency into `.vite/build`, but a compiled `.node` addon must remain a
real file on disk. So the packaged app's `node_modules` needs exactly the native
module plus the JS shims it loads at runtime — `better-sqlite3`, `bindings`, and
`file-uri-to-path` — and nothing else. We ship precisely that set and hand-curate
it.

The mechanism lives in `forge.config.ts`. A single `runtimeNativeModules` constant
is the source of truth; both the deny-by-default asar `ignore` allow-list and the
`packageAfterCopy` hook derive from it. Vite's main config externalizes the same
modules so they are required from disk rather than bundled. The copy hook exists
because npm-workspace hoisting moves these modules to the repo-root `node_modules`,
outside `apps/desktop/`, where `@electron/packager` would not see them; the hook
re-plants the Electron-ABI-rebuilt copies (see ADR 0012) into the staged app before
asar packaging, and `AutoUnpackNatives` then extracts the `.node`.

We chose hand-curation over the packager's default production-dependency pruning
because npm metadata cannot distinguish runtime deps from install-time deps:
`better-sqlite3` declares `prebuild-install` as a regular `dependency`, so default
pruning ships a 38-package closure (`tar-fs`, `tunnel-agent`, `node-abi`, …) of
install-time tooling that never runs at runtime. The deny-by-default allow-list
exists specifically to strip those ~35 packages. The cost is that the three-item
list is a manual snapshot of `better-sqlite3`'s runtime closure: if a future
`better-sqlite3` release changes its runtime deps, the list goes stale and the
packaged app fails at first database open — a failure that only surfaces in
packaged builds, not in dev. Static packaged-artifact checks are the native
packaging backstop: they assert the app bundle contains the expected migrations
and only the curated native runtime modules, with `better-sqlite3`'s `.node`
files unpacked outside the asar. User-flow E2E remains focused on Electron,
preload, IPC, renderer, and SQLite service wiring.

We evaluated eliminating the native module entirely via Node's built-in
`node:sqlite`. The runtime is ready — Electron 41 (Node 24) exposes `node:sqlite`
in the main process with no flag, verified directly against the installed build —
and it would delete the ABI rebuild dance, the copy hook, and this list at once.
We did not adopt it because Drizzle's `node-sqlite` driver, migrator, and
drizzle-kit support exist only on the `drizzle-orm@1.0.0-beta` line; stable
(`0.45.2`) has no such driver. Migrating the data layer onto a pre-release ORM
major is not worth it for a local-first app whose core invariant is database
integrity. Revisit `node:sqlite` when Drizzle 1.0 ships stable.
