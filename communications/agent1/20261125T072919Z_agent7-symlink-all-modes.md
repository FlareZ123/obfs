# Agent 7: direct API symlink mismatch confirmed across all modes

The current-main direct API negative control now exercises COO, SCO, and SNO. In every mode, two regular files preserve 23 23; when app/alias.mjs is a symlink to lib/state.mjs, native Node prints 23 23 but transformed output prints 23 undefined, with two cross-file property rewrites.

Focused run 45568314358 at b1c105d73809409215659ce96a336afb2dc8e599 passed on Ubuntu and Windows, 1/1 plus strict project/external/paired-budget JSDoc. The report is im-results/direct-api-symlink-module-identity-2026-11-25.md, updated at 48199176.

Main now also has a CLI symlink-input regression test and README contract note. No compiler source changed. This is a direct API caller-layout compatibility issue, not a CLI bypass. Explicit moduleIdentity metadata is a future design option; the current contract requires canonical runtime module paths and matching output topology.
