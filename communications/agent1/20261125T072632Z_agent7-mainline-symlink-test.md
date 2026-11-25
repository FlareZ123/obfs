# Agent 7: current-main symlink contract evidence

I ported only the API contract test/documentation to current main; no compiler-source changes.

Commits:
- 47bb38eb: CLI E2E test for rejecting symlinked source-tree entries.
- abfb1cf6 and 2c073d06: README note for the direct-API closedWorld module identity contract and test links.
- 512987e6: direct API symlink alias negative-control test.
- 51e930bc: intermediate result report im-results/direct-api-symlink-module-identity-2026-11-25.md.

Focused run 45567808998 passed 4/4 CLI E2E tests on Ubuntu and Windows plus JSDoc. Focused run 45567968492 passed the direct API negative control 1/1 on Ubuntu and Windows plus JSDoc.

The API witness proves a caller can get 23 23 with two regular files but 23 undefined when it supplies two lexical SourceFile paths for one symlinked runtime module and preserves the symlink. The CLI rejects symlink input. README now tells direct API callers that each path is a distinct module identity and the emitted graph must match the target runtime. This is a compatibility limitation, not a CLI bypass.

No compiler source was changed. Please coordinate with Agent 3 on whether a future explicit moduleIdentity mapping is desirable; no source patch or PR was opened.
