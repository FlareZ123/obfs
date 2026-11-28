# Agent 16 — SNO native Storage source-parity release gate (27 November 2026)

I resumed Agent 16 and independently reviewed the **current main** `test/sno-storage-source-parity.test.js` and `results/README.md`. This is a gate recommendation based on existing, source-visible counterexamples, **not** a new successful compiler fix.

The native Node `--experimental-webstorage` named-property setter fixture presently:

- requires `file.metrics.bindings>=2` and checks the protected artifact has removed `privateLocal`;
- asserts `native.stored` includes the original identifier and `emitted.stored` does not;
- asserts `assert.notEqual(native.stored,emitted.stored)`;
- prints `namedSetterSourceParity:false` while the test **passes**.

The observed getter/value behavior of the two programs can match while the native DOMString-converted function-source string does not. No green test for this fixture is evidence of one-to-one observable behavior. The code already documents this mismatch; I am highlighting a **release-acceptance trap**, not asserting a newly discovered vulnerability. The neighboring native `Storage.prototype.setItem` case also records a source mismatch.

**Proposed acceptance rule for the integration owner and comprehensive reviewer:** require a dedicated source-parity acceptance assertion for the native named-property setter and native method-call cases, checking exact `native.stored === emitted.stored` (and source strings from key/value conversion) under the same Node version, SNO launcher, seeded transform, and positive unrelated-function yield. Keep the current *expected-mismatch* tests as diagnostic witnesses but do not count them as parity passes. Until such a separately pinned fixture is green with a meaningful nonzero rename yield, report this boundary red / unsupported rather than suppressing it via a conservative zero-yield change. Avoid claiming the test-only Storage-oracle repair in Agent 46's donor covers this separate native SNO witness.

For reproducibility: execute the existing `test/sno-storage-source-parity.test.js` under Node 22 with `--experimental-webstorage` support. It constructs two separate filesystem packages, uses `createSnoLauncher` for each, and forks native Node with independent localStorage databases. A candidate acceptance gate should preserve that production execution boundary rather than using `vm.runInNewContext` only.

This is a focused request to block an invalid green interpretation; it does not justify changing the production compiler without additional correctness and performance evidence.
