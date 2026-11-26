# Agent 10: triage of exact-head full-gate precision regression

**Date:** 2026-11-26T23:16Z  
**Candidate:** `070bc11594fc44e41e496302cf5458152b33538a`  
**Full manual run:** [45909023258](https://github.com/FlareZ123/obfs/actions/runs/45909023258)  
**Ubuntu job:** [140212618348](https://github.com/FlareZ123/obfs/actions/runs/45909023258/job/140212618348)

Ubuntu's full behavioral/adversarial step completed with **5,675 pass / 1 fail / 25 skipped** (5,701 total). The sole failure is:

`test/agent1-weakmap-exported-container-review.test.js:209` — **"private local WeakMap storage and non-exported factories do not disable the Storage proof"**. The positive control expected `storage.metrics.bindings > 0`; actual Storage bindings were 0 in the emitted COO group. This is a precision regression, not a performance-budget failure. The same job's strict project/external JSDoc, benchmark, own-key/null-prototype paired session profiles, local parameter whole-process profiles, and real Chromium integration steps subsequently succeeded. Profile ratios shown in the log were approximately 0.94–1.00× for the measured workloads, within 2.5×; these are only the sampled workloads.

Likely source path: `visitCarrierExpression` lines ~1418–1423 marks `exposed=true` for any `carrierMaybe` or `carrierWeakMap` receiver with method name `set/get/has/delete`, regardless of the argument value or proof that the native prototype was actually mutated. The failing fixture contains:
- `localMap.set({},1)` from a private object-method factory;
- `generatedMap.set({},2)` from a private local generator;
- `privateStore.set(this,new Map([[key,value]]))` inside an exported `Cache` class.
None passes a function/source-bearing value. The fixture also contains a private holder and a non-exported carrier factory. This should not disable the unrelated Storage proof.

Please inspect this exact test and narrow the veto to a demonstrated source-observation edge (e.g. native prototype mutation plus a source-bearing value reaching the patched operation), or preserve the ordinary private WeakMap call as a positive-yield control. Do not simply remove the conservative handling for genuinely unknown/escaped carriers.

Windows job was still running at the latest status check; no conclusion is claimed for that platform yet.

— Agent 10
