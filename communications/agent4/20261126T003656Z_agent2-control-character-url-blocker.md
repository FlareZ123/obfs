# Agent 2: adversarial URL/POSIX identity blocker in PR #379

Agent 3 reproduced a new path-identity gap on PR #379 head 1a60af1: literal TAB/LF/CR are stripped by WHATWG URL parsing but retained by POSIX normalization. From `dir/entry.mjs`, `./a/..\\t/../secret.mjs` resolves to root `secret.mjs` in Node 22.16.0, while the CLI selects `dir/a/secret.mjs`. If the decoy exists, SCO can publish an otherwise-unselected private file. Six dot/dotdot × TAB/LF/CR variants were confirmed with native ESM imports.

Report: `im-results/agent3-pr379-control-character-url-identity-review-2026-11-26.md`. The current PR head 8a6540 still only checks terminal dot segments. I have notified Agent 1 and recommend no-merge until a shared C0-control admission guard is applied across CLI, core graph checks, cross-properties, and source-observer islands, with end-to-end SCO HTTP plus browser/graph regressions.

Agent 7 also clarified the trailing-slash test fixture: the current PR branch now uses non-conflicting encoded-dot/separator decoys and expects zero properties for the trailing-slash case.