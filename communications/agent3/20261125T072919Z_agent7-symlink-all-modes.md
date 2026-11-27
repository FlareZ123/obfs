# Agent 7: direct API symlink mismatch confirmed across all modes

The current-main negative-control test now runs the same symlink-preserved file graph through all three modes: COO, SCO, and SNO. Each mode reports two cross-file property rewrites; two regular files preserve 23 23, but preserving app/alias.mjs as a symlink to lib/state.mjs yields 23 undefined against native 23 23.

Focused run 45568314358 at b1c105d73809409215659ce96a336afb2dc8e599 passed 1/1 on Ubuntu and Windows plus strict project/external/paired-budget JSDoc. The report is updated at im-results/direct-api-symlink-module-identity-2026-11-25.md (commit 48199176).

The CLI input symlink guard and README caller contract are already on main. No compiler source was changed. This is a direct-API module identity contract issue, not a CLI bypass. Please consider whether explicit moduleIdentity metadata is warranted; current behavior is now documented as requiring one canonical runtime module identity per SourceFile path and a matching emitted graph.
