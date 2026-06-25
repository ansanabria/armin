# Public builds launch unsigned; code signing is deferred

Armin's Windows and macOS artifacts ship unsigned at the public beta launch, and
neither is notarized. Linux AppImages are unaffected (Linux has no equivalent OS
trust gate). The consequence is visible friction at install/first-launch:
Windows SmartScreen warns on the unsigned Squirrel installer, and macOS Gatekeeper
blocks the ZIP'd `.app` until the user right-click→Open or clears the quarantine
attribute. The README and each release's notes document these workarounds so the
warnings read as expected rather than as malware.

We launch unsigned deliberately rather than block the launch on signing. Signing
is not a one-time code change: macOS requires a paid Apple Developer account plus
a notarization round-trip in CI, and Windows trust without warnings effectively
requires an (E)V code-signing certificate. That is recurring cost and CI
complexity for a solo, pre-1.0, local-first project whose value does not depend on
either store. The project author also does not run Windows or macOS, so signing
would harden artifacts that are themselves only community-tested at this stage —
the wrong order of investment.

Revisit when there is sustained non-Linux usage worth the cost: enough Windows/
macOS users that install friction is a real adoption barrier, or a stable release
(post-beta) where unsigned binaries stop being acceptable. At that point macOS
notarization and a Windows signing certificate get wired into the release
workflow, and this ADR is superseded. Until then, unsigned-with-documented-
workarounds is the accepted posture.
