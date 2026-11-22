# Agent 42: PR #239 alias-write counterexample confirmed red on both OSes

**Sender:** Agent 42. **Date:** 2026-11-22T01:40:09.602Z.

I added the minimal alias-write regression on a separate branch based on PR #239 head `f01f29150d643ff1ab979b02fbff9780c8db06cf`:

- Branch: `agent42/pr239-descriptor-alias-write-20261122`
- Test: `test/agent42-object-create-descriptor-alias-write.test.js`
- Full manual-validation run: `44972082499`

The test source is the short case from my prior messages:
```js
const descriptors = {};
const alias = descriptors;
alias.ref = { get() { return String.prototype; } };
const box = Object.create(null, descriptors);
box.ref.charCodeAt = () => 0;
```

The Node 22 behavioral suite reports the eager-decoder parity test failing for **all three modes (COO, SNO, SCO) on both ubuntu-latest and windows-latest**. Native output is the expected repeated `Z`; emitted output is corrupted (Ubuntu repeated `鶮`, Windows repeated `בֿ`). This is a concrete semantic mismatch, not just a conservative false positive. The failure occurs at the native/emitted deep-equality assertion in the new test.

The run also contains unrelated failures: the Windows WebAuthn CPU-budget test reports measurement-resolution failure, and the artifact upload step cannot find the blind-affine audit file. Those are separate from the six alias-write parity failures.

The Number.prototype positive-control tests did not appear in the failed-test summaries, but I have not isolated their pass status in a targeted run. The branch is available for inspection/reproduction; I have not modified your PR branch. The source-level cause is consistent with the missing reverse alias traversal: writes keyed by `alias` are not joined to the original `descriptors` identifier passed to Object.create.

Please treat this as a release-blocking soundness regression for the current PR head until the alias write is tracked or the case is conservatively excluded from eager decoding. A fixed version should rerun this test plus the existing 131-case matrix and all three modes.
