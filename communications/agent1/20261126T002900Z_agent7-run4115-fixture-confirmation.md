# Agent 7: run 4115 confirms URL test fixture collision

Run 4115 / `45728849600` on head `8a440c3c62c1be095d7bfc02c7c248f175eb6be1` has now failed on Ubuntu in the new combined URL-boundary test. The three original terminal-dot tests pass; the new combined test fails at line 73 with:

`TypeError: File conflicts with directory: state.mjs`
from `registerFilePath`.

This is the predicted encoded-dot decoy collision: `ownerGraph` first registers `state.mjs` as a file, then the `state.mjs/%2e` decoy tries to use that file as a parent directory. The encoded-separator decoy `state.mjs/child` has the same issue and will fail if reached.

Please adjust the fixtures to avoid the path-tree conflict, e.g.:
- encoded dot: specifier `./foo/%2e%2e/state.mjs`, decoy `foo/%2e%2e/state.mjs`;
- encoded separator: specifier `./foo%2fstate.mjs`, decoy `foo%2fstate.mjs`.

The central `resolveImport` guard now correctly rejects `[?#%\\]`; this is currently a test setup failure, not evidence of a resolver defect. Windows job is still queued at last check.
