# Agent 10: cross-file SCO host-lock Storage control

**Date:** 2026-11-25  
**Test-only branch:** `agent10/sco-host-lock-storage-browser-20261125`  
**Witness branch head:** `75ce2e...` (before the JSDoc-only annotation fix)  
**Manual browser run:** [45567407795](https://github.com/FlareZ123/obfs/actions/runs/45567407795)  
**Disposition:** no cross-file Storage source mismatch reproduced in this specific exported-producer/imported-consumer fixture.

## Fixture

Two ESM files are compiled together with `mode:'sco'`, `closedWorld:true`, `allowedHosts:['127.0.0.1']`, identifier rewriting enabled, and strings/properties disabled:

- `logic.mjs` exports `inspect()`, whose body contains `const privateLocal=31`.
- `entry.mjs` imports `inspect`, passes it as the value argument to native `localStorage.setItem`, and calls it. The entry file also has an unrelated local `independent()` helper.

The browser test executes native and generated graphs in Chromium, then executes the generated graph on a second hostname. Both source files' `observesFunctionSource` checks return false.

## Observed result

The cross-file target step completed successfully and emitted:

```json
{
  "browser": "Chromium",
  "sourceObserver": {"producer": false, "consumer": false},
  "metrics": {
    "producer": {"literals": 0, "objects": 0, "properties": 0, "bindings": 0},
    "consumer": {"literals": 0, "objects": 0, "properties": 0, "bindings": 1}
  },
  "nativeSource": {
    "length": 62,
    "sha256": "e7195c83bfca1b19f267a7974ceaeb41f631f8e29b35eabce00651b887ef6d4b",
    "containsPrivateName": true
  },
  "emittedSource": {
    "length": 62,
    "sha256": "e7195c83bfca1b19f267a7974ceaeb41f631f8e29b35eabce00651b887ef6d4b",
    "containsPrivateName": true
  },
  "sourceParity": true,
  "runtimeValuesPreserved": true,
  "hostLockPositive": true,
  "hostLockNegative": true
}
```

The exported producer's `privateLocal` remained in the stored function source; the producer file had zero binding rewrites. The consumer file had one binding rewrite, preserving the unrelated helper's obfuscation yield. Native and emitted function-source fingerprints were identical. Runtime values 31 and 7 were preserved. The host-locked graph executed on `127.0.0.1` and was rejected on `127.0.0.2`.

## Interpretation

This is a **negative cross-file result** for this exact case: the exported producer was not rewritten, so the Storage sink in the importing consumer did not expose a mutated producer function. It corroborates Agent 8's earlier statement that the current cross-file exported-producer control did not reproduce a second failure. It does not establish that all cross-file source-observation cases are safe; the result is limited to this two-file ESM graph and this exported function shape.

This complements the separate same-file classic-script witness in `im-results/agent10-sco-host-lock-storage-classic-script-browser-2026-11-25.md`, which does reproduce a source mismatch with two local binding rewrites. The distinction matters: a source sink in the consumer does not automatically imply the imported producer is eligible for rewriting.

## Workflow accounting

The target cross-file step passed in [45567407795](https://github.com/FlareZ123/obfs/actions/runs/45567407795). The full manual-browser workflow is RED due the existing `test/bound-runtime-interception-browser.js:52` assertion `0 !== 2`. The final JSDoc check also failed because the test fixture's `sourceType` was inferred as `string`; this was a harness typing issue, corrected by explicitly typing the two fixture entries as `sourceType:'module'` in commit `bcf20a54a8dcac8d89773de5a43673b1c941de36`. A final browser/JSDoc rerun is queued to validate that correction.

No production compiler source changed. This report is an intermediate negative result, not an academic established result or a release acceptance claim.
