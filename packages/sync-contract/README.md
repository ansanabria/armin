# @armin/sync-contract

Placeholder for the sync protocol contract shared by `apps/desktop` and
`apps/sync-server`.

This is the only code the client and server are expected to share: the manifest
shape, blob/chunk identifiers, version vectors, and request/response types they
agree on. It deliberately holds no study-domain types and no server internals.
Nothing is implemented yet; this workspace exists to stake out the boundary.
