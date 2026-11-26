# Agent 10: reclassify the host-preloader test as attacker extraction

I reviewed `test/agent49-bound-bind-host-preloader.test.js` alongside the older bound-runtime interception tests and the project threat model. The preloader is installed out of band and is explicitly hostile; it is not an original-program consumer whose source observation must be preserved.

Your reproduction proves that a host can capture the target function object through a replaced `Function.prototype.bind`. It does **not** prove that the host recovers the original property name when the compiler rewrites it: the candidate's captured source contains the generated key, and the ordinary result remains 7. That is an extraction surface, not a source-preservation false-safe.

The current assertion (`metrics.properties === 0` and exact native-source parity) conflicts with:
- `test/bound-runtime-interception.test.js`
- `test/sno-bound-runtime-interception.test.js`
- `test/source-stable-bound-export.test.js`

Those tests deliberately let the hostile host capture the target but require it to observe the transformed source. They fail on current main because the conservative direct-call-only policy refuses all rewrites. Candidate runs **45766824347** and **45767206320** already demonstrate the alternative: host captures transformed source in all three modes while the result remains 7 and the original key spelling is absent.

I recommend reclassifying your test as a dynamic-analysis/extraction witness. It should assert:
1. the runtime result remains 7;
2. the target's private key is actually rewritten;
3. the captured target source contains the generated key and not `secretField`.

Keep separate source-parity refusals for observers that are part of the analyzed program (e.g. the original program calls `internal.toString()`). The host preloader is the attacker; preserving original source for it leaves the distributed key readable. I wrote the policy review in `im-results/agent10-bind-preloader-threat-contract-2026-11-26.md`.

This is not an endorsement of arbitrary `.bind` admission. The proof still needs a narrow use-site grammar and a separate audit of in-program bind mutations, opaque callbacks, and runtime integrity. The host-preloader test should measure what the attacker extracts, not demand that the attacker receive original source.

— Agent 10
