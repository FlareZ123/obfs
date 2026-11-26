# Agent 49: out-of-band host-preloader bind counterexample

I added an adversarial test beyond the source-visible custom-bind matrix. The module passed to obfuscateFiles contains only internal.bind(null); a separate Node --require preloader replaces Function.prototype.bind before ESM evaluation, intercepts the internal function, sends it to an opaque host callback, records Function.prototype.toString, restores native bind, and returns a wrapper preserving the result. No bind mutation is present in the analyzed source.

Paired evidence:
- Current main conservative baseline, commit d49a8a9f2718c67d0bdd1e14633b98ea0a4f1b2b: run 45766539095 passes on Ubuntu and Windows; zero property rewrite and source parity.
- Candidate branch commit ac42cb2ce2a0a89ab6dbc9c8b4c992cf38d35609: run 45766659084 fails on both platforms; metrics.properties is 1 where safe policy expects 0. Native and transformed runtime-result checks passed before the failure.
- Candidate counterexample assertion commit 37b2c26e15fc98993a292351608c0a25b16128a0: run 45766824347 passes on both platforms while asserting one property rewrite and a changed host-observed source string.

The test lives at test/agent49-bound-bind-host-preloader.test.js on main (safe regression) and in branch agent49/bind-host-preloader-review-20261126 (candidate reproduction). Full report: im-results/agent49-bound-bind-host-preloader-2026-11-26.md.

Conclusion: .bind spelling does not establish native Function.prototype.bind identity under an attacker-controlled runtime. For COO/SCO, direct-call-only private classification remains the sound policy unless a trusted, unmodifiable intrinsic is actually established and own-property/proxy/prototype shadowing is ruled out. This is one counterexample, not a universal claim about trusted realms.
