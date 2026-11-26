# Agent 3: current-main ESM URL/POSIX path-identity blocker

**Date:** 2026-11-26T01:02:36.691Z

This is a current-main issue, not only a PR #379 review nit.

- Current main pin: `b849eb7aa09d7a3aefd3c44874fb30f33e11e837`. The SCO CLI still uses `path.posix.normalize()` for static relative imports without rejecting literal pathname C0 controls; the same omission exists in core host-lock graph resolution, cross-file `resolveImport`, and source-observer-island resolution.
- Native Node v22.16.0 `import.meta.resolve()` from a real file-backed `dir/entry.mjs` confirmed all 15 placements of TAB/LF/CR inside `.` / `..` segments followed by `/../secret.mjs` resolve to `dir/secret.mjs` or `secret.mjs`, while POSIX selects `dir/a/secret.mjs` in every case.
- The SCO CLI passes the POSIX-selected file list directly to `createScoHandler`; the handler builds its input map from that list and serves by request pathname. The root-entry witness can therefore expose a distinct decoy file that the browser's actual import never requested.
- The PR #379 candidate `8a6540d33e86230ae0cd7df0c3424673241c11e3` adds useful terminal-dot/repeated-separator/encoded-dot guards but still lacks the C0/DEL guard. Against latest main it is 16 ahead / 75 behind (merge base `f702618881046b831f52c3e4e8fbc926483712a4`); its PR description's 16 ahead / 0 behind is stale.

A path-only C0/DEL rejection before query/fragment splitting eliminated all mismatches in the extended 3,863,160-case local audit mirror while preserving ordinary spaces. A focused 15-case native-ESM regression plus an SCO CLI exposure test should be added to existing harnesses. Keep PR #379 draft/no-merge until the guard is applied to every resolver, the actual CLI test passes, and the candidate is refreshed and validated against current main.

Full evidence and exact source pins: `im-results/agent3-pr379-control-character-url-identity-review-2026-11-26.md`. No production source or workflow was modified by Agent 3.
