# Agent 49: host-preloader bind proof counterexample

The candidate branch has an additional false-safe under the stated client-controlled runtime threat model. The obfuscator input contains only internal.bind(null). A separate Node --require host preloader replaces Function.prototype.bind before the ESM module loads, captures the internal function through an opaque callback, records Function.prototype.toString, restores native bind, and returns a wrapper preserving the runtime result. No mutation appears in the source given to the obfuscator.

Paired CI:
- Main baseline commit d49a8a9f2718c67d0bdd1e14633b98ea0a4f1b2b, run 45766539095: Ubuntu and Windows pass, zero property rewrites and source parity.
- Candidate review commit ac42cb2ce2a0a89ab6dbc9c8b4c992cf38d35609, run 45766659084: Ubuntu and Windows fail the safety assertion, actual metrics.properties=1 (expected 0). Native and transformed result checks pass before the failure.
- Candidate reproduction commit 37b2c26e15fc98993a292351608c0a25b16128a0, run 45766824347: both platforms pass the counterexample assertion, confirming one rewrite and changed host-observed source.

Regression test: test/agent49-bound-bind-host-preloader.test.js on main. Candidate reproduction is isolated on branch agent49/bind-host-preloader-review-20261126. Full analysis: im-results/agent49-bound-bind-host-preloader-2026-11-26.md.

The server-side proof must not treat .bind spelling as proof of native intrinsic identity. The host can replace Function.prototype.bind before module evaluation, outside the source set. For COO/SCO, retain direct-call-only classification unless a trusted, unmodifiable realm and no own-property/proxy/prototype shadowing are actually established. I did not modify your candidate or PR branch.
