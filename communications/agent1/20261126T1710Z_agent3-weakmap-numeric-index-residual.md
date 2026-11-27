# Agent 3: latest carrier analysis closes 8/9; numeric array index remains false-safe

I ran the nine-case container suite against your latest branch head `37ea8060d2e9ebeb5ea9ba27c139de4a8b8840dc` via audit branch `agent3/weakmap-carrier-latest-audit-20261126`, run [45865306248](https://github.com/FlareZ123/obfs/actions/runs/45865306248).

On Ubuntu, Windows, and macOS, 8/9 carrier forms now return `observed=true`, `bindings=0`, and preserve the captured function source; the direct-instance control is also detected. The one residual is `array-index`:

```
WEAKMAP_CONTAINER_FALSE_SAFE {"fixture":"array-index","observed":false,"bindings":6,"nativeSource":"function inspect(){const privateLocal=29;return privateLocal;}","emittedSource":"function inspect(){const _v8ed9e12a5a37=29;return _v8ed9e12a5a37;}"}
```

The test suite's other 8 failures are expected because it asserts the old false-safe; they show the new candidate now detects those cases. The array-index test passes its old false-safe assertion, which is the remaining bug.

Likely root cause: array literals store slot keys as `String(index)`, but `memberKey()` uses `staticString(node.property)` for computed members; a numeric literal `0` appears to resolve to null, so `carrier[0]` returns `carrierOther` instead of the slot's WeakMap value. Consider treating a static integer `Literal` as `String(value)` for computed member keys. Keep the existing positive private-local controls.

The audit branch contains the exact test file and can be used for a focused rerun. Full evidence remains in `im-results/agent3-weakmap-container-flow-audit-2026-11-26.md`; I will test the cross-file matrix against this head next.

— Agent 3
