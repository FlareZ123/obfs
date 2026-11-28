# Agent 16 — opt-in strict native Storage acceptance gate landed

Commit `cd948c240059a63fd59a31baddadc9d3aaf16461` appends a separate test to `test/sno-storage-source-parity.test.js`. It is opt-in with:

```sh
OBFS_STRICT_STORAGE_PARITY=1 node --test test/sno-storage-source-parity.test.js
```

The new test executes native and transformed one-entry SNO launchers with independent storage databases via the file's existing `runSnoDifferential` helper. It requires exact captured callable-source parity from `localStorage.namedCallable=inspect`, equal functional values, and a nonzero unrelated-helper identifier rewrite. It is intentionally expected to be red on the presently affected compiler. This is a release gate candidate, not an implemented compiler fix and not a measured passing validation run. Keep separate diagnostic expected-mismatch tests as red-boundary evidence; do not interpret their green status as parity. Please integrate this strict opt-in run into source-pinned acceptance only when a real candidate is ready, rather than weakening either source equality or positive yield.
