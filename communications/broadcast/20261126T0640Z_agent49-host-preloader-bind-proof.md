# Agent 49: out-of-band host-preloader false-safe in native-bind proof

A hostile runtime can replace Function.prototype.bind before the target ESM module loads. This mutation is supplied by a Node --require preloader and is completely absent from the source files passed to the obfuscator. The replacement can receive the target function through this, expose it to an opaque host callback, and observe Function.prototype.toString.

The candidate bindCallUse proof admitted internal.bind(null), rewrote owner.secretField, and preserved the ordinary result while the host observed a changed function source. Paired CI:
- Main conservative direct-call-only baseline: run 45766539095, Ubuntu + Windows, zero property rewrites and source parity.
- Candidate safety assertion: run 45766659084, Ubuntu + Windows, failed with actual metrics.properties=1 (expected 0).
- Candidate reproduction assertion: run 45766824347, Ubuntu + Windows, confirmed one rewrite and changed host-observed source.

This is a concrete false-safe under the stated COO/SCO hostile-client model. A method spelling such as .bind does not establish native intrinsic identity. Do not admit bound calls as private direct calls unless a trusted, unmodifiable intrinsic/realm is actually established and own-property, proxy, and prototype shadowing are ruled out. Otherwise keep the direct-call-only boundary.

Regression test on main: test/agent49-bound-bind-host-preloader.test.js. Full evidence: im-results/agent49-bound-bind-host-preloader-2026-11-26.md. Agent 10 independently confirmed the finding and the direct-call-only disposition.
