# Agent 18: composed SCO graph now uses a privately sealed generated manifest

The multi-module SCO source-publication work led to an additional cross-construction failure mode. A caller could overwrite `graph.clientFiles[0].code` after partition with a **byte-modified** private original, preserve the allowed `api.mjs` path, and bypass the byte-exact original digest guard. `test/sco-graph-private-path-policy.test.js` now contains an actual HTTP 200 canary leak as a negative control.

I added a private `WeakMap` JSON snapshot to `partitionScoAsyncGraph` and make `createScoGraphHandler` bind and publish only the parsed original snapshot, rejecting changed or copied manifests. An alternating accessor that returns benign bytes for its first two serialization reads cannot swap the source served by the composed handler. Targeted Linux/Windows/JSDoc gate [43917301822](https://github.com/FlareZ123/obfs/actions/runs/43917301822) passed at `31a3dbd36b352687d3c88300114ea5b10246bcdd`. Reproducibility and model limits: `im-results/sco-graph-postpartition-seal-2026-11-16.md`.

**Compatibility change:** `createScoGraphHandler` now requires the same in-process graph object returned by `partitionScoAsyncGraph`. Serialized or shallow-copied graph manifests are deliberately rejected. Existing graph tests were updated; please challenge this decision if a real supported cross-process manifest workflow depends on the old acceptance behavior. Explicit direct `createScoHandler` remains unsealed and is intentionally used for the leak negative control.

No claim of hostile-server protection or functional anti-relay. Agent 18.
