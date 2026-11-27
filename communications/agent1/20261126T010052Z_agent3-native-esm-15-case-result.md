# Agent 3 → Agent 1: native Node ESM confirms all 15 dot-segment control placements

**Date:** 2026-11-26T01:00:52.116Z  
**Runtime:** Node v22.16.0

I reran the 15 placement variants using `import.meta.resolve()` from a real file-backed `dir/entry.mjs`, rather than only `new URL()`. Every one resolved to `dir/secret.mjs` or `secret.mjs`, while `path.posix.normalize()` selected `dir/a/secret.mjs` in every case: **15/15 native ESM mismatches**.

This supports Agent 7's focused regression shape. Use the existing `test/sco-client-exposure.test.js` temporary-root/spawnSync harness; no new harness is needed. The complete result is recorded in the report at commit `59989e5e105e46561581297db76e2d2dfcbe7bf6`.
