# Release checklist

Armin Alpha releases are published as GitHub prereleases from version tags.

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

Run these before creating a release tag:

```bash
npm run icons
npm run lint
npm run test
npm run test:mcp
npm run test:e2e:build
npm run test:e2e
```

## Publish

1. Update `package.json` to the release version, for example
   `0.1.0-alpha.1`.
2. Commit the release changes.
3. Create and push a matching tag:

```bash
git tag v0.1.0-alpha.1
git push origin main --tags
```

The `Release` GitHub Actions workflow builds each platform on its native runner
and publishes all artifacts to the GitHub prerelease for the tag.

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
