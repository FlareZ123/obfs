# SCO principal lookup elapsed-deadline admission under event-loop starvation

**Date:** 22 November 2026. **Agent:** 24. **Status:** red/green correctness evidence with a strict performance veto; experimental branch only, not a release feature. The strong-protection release decision stays **RELEASE-BLOCKED**.

## Threat and reproducible defect

The trusted SCO server may use `createScoKeyedIsolation(principalOf,{maxPendingTotal,maxPrincipalResolutionMs,abortPrincipalLookup})`. Before this experiment, the helper relied solely on Node's `setTimeout` to reject unresolved asynchronous identity lookups. A verifier's microtask can block the event loop, then resolve the identity after the configured deadline but before the timer callback runs. In this case, the helper can queue and execute a protected operation after the nominal identity deadline. A synchronous blocking principal resolver exhibits the same admission gap because it returns before any timer is scheduled. No client-side obfuscation or authorization bypass is implicated; the only attack capability in the tests is a slow, trusted identity resolver.

The two regression fixtures are appended to [the existing principal-resolution test file](../test/sco-principal-resolution-deadline.test.js). Both use a 5 ms deadline and 35 ms `Atomics.wait` in one Node thread to prevent deadline timer delivery. The first settles an asynchronous verifier inside a queued microtask, checks a rejected protected operation and aborted signal, and checks that a fresh request can consume the released global reservation. The second uses a synchronous blocking verifier and checks that no protected effect is executed.

## Source-pinned red and green results

| Exact source | Test disposition | Cross-platform observations |
| --- | --- | --- |
| `f8a27ad4352fe51570a9b2d9218e368201751c54` (tests added; original helper) | **RED:** [manual SCO authorization run 45052792052](https://github.com/FlareZ123/obfs/actions/runs/45052792052) | Both Ubuntu and Windows reported 2/305 failed tests: the two named fixtures failed with `Missing expected rejection (ScoIsolationBusyError)`. |
| `3806d09d6545337a5de7be19f8e9e3ffd15ddafd` (elapsed-time guard and tests) | **TARGETED GREEN:** [manual SCO authorization run 45052627292](https://github.com/FlareZ123/obfs/actions/runs/45052627292) | Windows: 304 passed/one skipped/zero failed out of 305 Node tests, simulated comparisons and both strict JSDoc gates passed. Ubuntu's 305-case Node test step passed, including both new cases, but the overall workflow failed later at an unrelated real Chromium IPv6 guard fixture: observed `pending` versus expected `[::1]|42`. Ubuntu's strict JSDoc steps were consequently not reached. |

The candidate adds `node:perf_hooks` `performance.now()` before identity resolution and checks the elapsed monotonic time before accepting the principal. If time has expired, it aborts a cooperating verifier's signal and throws the existing pre-execution busy exception, permitting the HTTP handler to return 429 and free the capacity reservation. This cannot interrupt a blocking synchronous verifier or recover time already consumed.

The candidate documentation was updated at `8de47f2613897b4d4ab4425c1de87eb203eb4961`, after the executable source was pinned by the run above.

## Empirical performance veto

The same green candidate source ran the existing [SCO deadline CPU profiler](../sims/sco-principal-resolution-cost.js), which compares an opt-in bounded lookup against the default **same keyed isolation helper without the lookup deadline**. Each pair executes equivalent protected effects in alternating order; these are direct-helper warm Node 22 process CPU and wall ratios, **not** original application versus compiled output. Windows CPU can be quantized.

On a tiny-effect workload (250,000 cached immediate-async lookups per pair), with `abortPrincipalLookup:true`, **Windows recorded 6/21 strict CPU ratios greater than 2.5×**, median **2.248×**, maximum **3.118×**; Ubuntu recorded 0/21 breaches, median **1.837×**, maximum **2.120×**. Separate 8 KiB SHA-256-per-operation runs recorded 0/21 strict CPU breaches per platform. Windows tiny-work median wall ratio was 2.197×, with no wall ratio strictly above 2.5×. These distributions are workload-specific; the exact raw pairs are retained in the [CI logs](https://github.com/FlareZ123/obfs/actions/runs/45052627292).

The strict Windows exceedances must remain in the record and **veto an unqualified performance claim on the sampled workload**. The data do not isolate extra clock calls as the cause, because no byte-identical placebo or counterbalanced same-source ablation was run. Unlike a whole-application native-versus-compiled comparison, this is a helper-only stress measurement. The historical opt-in deadline build measured lower sample ratios, but a historical run is not a same-clock causal comparison.

## Decision

**Hold this implementation as a research-only candidate. Do not merge into the three-mode production implementation or claim a universal 2.5× bound.** A successor must either amortize the elapsed-time guard for realistic identity lookups or explicitly constrain its opt-in performance contract, then repeat preregistered same-source controls, the new red/green regressions, and strict real CPU profiling across Windows and Ubuntu. The separate Chromium IPv6 failure should be reproduced or triaged without attributing it to this helper.

This improves scoped trusted-server correctness only. It contributes no new source confidentiality, anti-debugging, environment locking, or protection against legitimate authorized SCO relays.
