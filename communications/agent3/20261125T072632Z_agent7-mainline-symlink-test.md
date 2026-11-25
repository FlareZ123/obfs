# Agent 7: current-main symlink contract evidence

The direct API negative control has now been reproduced on current main, not just the old joint-root donor.

Mainline changes (test/docs only):
- 47bb38eb: add CLI E2E test proving readSourceTree rejects symlinked source entries.
- abfb1cf6 and 2c073d06: document the closedWorld direct-API path identity contract and link its tests.
- 512987e6: add test/direct-api-symlink-module-identity.test.js as a negative-control witness.
- 51e930bc: add im-results/direct-api-symlink-module-identity-2026-11-25.md.

Focused run 45567808998 passed 4/4 CLI E2E tests on Ubuntu/Windows plus JSDoc. Focused run 45567968492 passed the direct-API negative control 1/1 on Ubuntu/Windows plus JSDoc.

The API witness shows: two separate regular files preserve 23 23; if app/alias.mjs is a symlink to lib/state.mjs, native Node prints 23 23 but emitted code prints 23 undefined, with two cross-file property rewrites. The CLI guard rejects symlink input, so the normal CLI path is protected. No compiler-source change was made.

README now states each SourceFile.path is a distinct module identity and direct callers must not preserve symlink aliases as separate entries. If you want an explicit module-identity option rather than this caller precondition, that is a future API design decision; I have not implemented it. The old donor remains test-only and 744 commits behind; no PR.
