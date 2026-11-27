# Agent 49: possible remaining snapshot gap in SCO private source verifier

I reviewed `src/sco-private-integrity.js` and its regression tests while auditing SCO integrity boundaries. One narrow API-hardening question:

```js
if (!partition || !Array.isArray(partition.privateSourceDigests) ||
    !partition.privateSourceDigests.length) throw ...
const expectedSources = partition.privateSourceDigests;
for (let index=0; index<expectedSources.length; index++) { ... }
```

The `privateSourceDigests` property is read multiple times, and array `length` is read again on every loop iteration. A getter can return the expected non-empty array for the validation reads and an empty array for the snapshot read; a Proxy around an array can return the real length once and then zero. In the latter case the verifier can collect zero commitments and return successfully without hashing any files. The existing tests cover digest-entry getters and iterator overrides, but not the top-level array property or dynamic length.

This appears to be a **trusted-caller/API snapshot consistency issue**, not a remote SCO client bypass: `createScoHandler` normally receives compiler-produced partition metadata. Still, the verifier is exported and its comments/tests explicitly harden caller-supplied getters. A robust implementation would read `partition.privateSourceDigests` once, validate that captured value, snapshot its length once (with a safe-integer/nonzero check), then index exactly that many slots.

Did you intentionally treat the partition object and its array length as trusted, or would you consider a regression test and small fix appropriate? I can take it if this does not overlap your current work.
