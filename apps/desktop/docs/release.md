# Release checklist

Armin releases are published from tags on `master`. The `development` branch is
for saving WIP and may receive direct commits or feature branch merges without
running CI. When `development` is releasable, open a PR into `master`; CI runs on
that PR, and `master` should remain known-good and release-capable.

Fast dogfood releases are always alpha tags and publish only the Ubuntu/Linux
artifact. Official releases can be beta prereleases or stable releases; both run
CI and publish Linux, Windows, and macOS artifacts.

## Alpha 1 distribution

- Linux: AppImage
- Windows: Squirrel installer
- macOS: ZIP
- Auto-update: deferred for Alpha 1
- Code signing/notarization: deferred for Alpha 1

Linux users can manage the AppImage with Gear Lever. Because the Alpha artifacts
are unsigned, Windows and macOS may show trust or security warnings during
installation or first launch.

## Toolchain

The release workflow runs entirely on Node 24 (npm 11), including the Forge
publish step. Use the same locally (`.nvmrc` pins Node 24) so `package-lock.json`
stays npm-11 compatible. Avoid regenerating the lockfile under npm 10 (Node 22):
npm 10 drops the `libc` fields npm 11 records, and npm 10's `npm ci` then rejects
an npm-11 lockfile as out of sync around the optional `esbuild@0.28.0` platform
packages.

## Local checks

Run these before opening a release PR or creating a release tag:

```bash
npm run icons --workspace apps/desktop
npm run lint
npm run test --workspace apps/desktop
npm run test:mcp --workspace apps/desktop
npm run test:e2e:build --workspace apps/desktop
npm run check:package --workspace apps/desktop
npm run test:e2e --workspace apps/desktop
```

## Versioning

Use semver with at most one prerelease suffix:

- Dogfood alpha: `0.2.0-alpha`, tagged as `v0.2.0-alpha`.
- Official beta: `0.2.0-beta`, tagged as `v0.2.0-beta`.
- Official stable: `0.2.0`, tagged as `v0.2.0`.

Bump the `MAJOR.MINOR.PATCH` base version for each new set of changes. A single
base version is shared across its prerelease stages: `0.3.0-alpha` (dogfood) and
`0.3.0-beta` (official prerelease) both carry the `0.3.0` base before the `0.3.0`
stable release. Do not append numeric prerelease suffixes such as `0.3.0-alpha.1`
or `0.3.0-beta.1`.

Include the `package.json` version bump in the PR from `development` to `master`
when possible, so the merged commit and release tag are traceable together.

## Promote development to master

1. Commit WIP directly to `development`, or merge feature branches into
   `development`.
2. When `development` is releasable, update `package.json` to the target version.
3. Open a PR from `development` into `master`.
4. Wait for CI to pass.
5. Merge the PR. `master` is now ready to tag.

## Publish a fast prerelease

Fast prereleases are for local dogfooding. They are always alpha versions,
publish only the Ubuntu/Linux AppImage, and are marked as GitHub prereleases.

1. Promote `development` to `master` with an alpha version, for example
   `0.2.0-alpha`.
2. Create and push a matching tag from `master`:

```bash
git tag v0.2.0-alpha
git push origin master v0.2.0-alpha
```

Tags ending in `-alpha` skip the full release CI job and publish only the Linux
AppImage to a GitHub prerelease.

## Publish an official beta release

Official beta releases are prereleases with the full platform artifact set.

1. Promote `development` to `master` with a beta version, for example
   `0.3.0-beta`.
2. Create and push a matching tag from `master`:

```bash
git tag v0.3.0-beta
git push origin master v0.3.0-beta
```

Tags ending in `-beta` run CI, build each platform on its native runner, and
publish all artifacts to a GitHub prerelease.

## Publish a full release

Official stable releases publish the full platform artifact set as normal GitHub
releases.

1. Promote `development` to `master` with a stable version, for example `0.3.0`.
2. Create and push a matching tag from `master`:

```bash
git tag v0.3.0
git push origin master v0.3.0
```

Plain version tags run CI, build each platform on its native runner, and publish
all artifacts to a normal GitHub release.

## Manual fallback

The `Release` GitHub Actions workflow can still be run manually from `master`.
Use `release_mode=fast` for an Ubuntu-only prerelease, or `release_mode=full` for
the full platform release path. Manual runs publish the tag derived from the
current `package.json` version.

## Smoke test artifacts

For each artifact downloaded from the GitHub release:

- Launch the app.
- Create a profile.
- Create a deck and card.
- Restart the app and confirm data persists.
- Start a review session.
- Open settings and confirm MCP setup instructions render correctly.

For Linux, also import the AppImage into Gear Lever and confirm it launches from
the desktop entry.
