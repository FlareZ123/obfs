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


## Source-coincident same-code negative-control follow-up

To distinguish candidate-versus-baseline cost observations from pure CPU counter quantization, a follow-up at exact source `d4cf37eb629c2dc4f8079ce27c5f3a286e1703a5` added **one** predeclared 21-pair placebo arm to `sims/sco-principal-resolution-cost.js`: two independent helper instances with *identical* `maxPendingTotal:2`, `maxPrincipalResolutionMs:10000`, and `abortPrincipalLookup:true`, the same immediate-async resolver, and the same 250,000 tiny protected effects per sample. The candidate-versus-no-deadline arm remained present, so both comparisons ran in the same source and runner environment. Raw pairs remain in [CI run 45053445284](https://github.com/FlareZ123/obfs/actions/runs/45053445284).

| Exact same-run comparison | Windows Node 22 CPU | Ubuntu Node 22 CPU |
| --- | --- | --- |
| Elapsed deadline + cancel vs default no-deadline helper, 21 paired trials | median **1.993×**, maximum **2.725×**, **4/21 strict >2.5×** | median **1.826×**, maximum **1.995×**, **0/21 strict >2.5×** |
| **Byte-identical elapsed deadline + cancel against itself**, 21 paired trials | median **1.004×**, maximum **1.564×**, **0/21 strict >2.5×** | median **1.016×**, maximum **1.131×**, **0/21 strict >2.5×** |

Windows passed the complete manual SCO workflow including 305-case Node regression, both JSDoc gates, the existing private-source and authorized relay experiments, and the added placebo. Ubuntu passed the same Node/CPU stages but again failed later in the standalone native-Chromium IPv6 shell, whose original untransformed script remained `pending`. The failing assertion is **`assert.equal(native,'[::1]|42')` at `test/sco-host-ipv6-browser.js:65`**, before the SCO compiler is even constructed for its generated-page path. That browser fixture failure is independent of the source change here.

**Updated interpretation:** Reproduced Windows 2.5× strict breaches in the deadline-versus-no-deadline arm across two source-pinned runs, while a same-source same-code placebo had no such excursions in the matched run. This rules out an explanation based solely on byte-identical-helper CPU measurement variability within this sample. It does not prove which individual component (clock checks, cancellation setup, Promise scheduling, or their interaction) causes the added cost, nor establish a universal performance distribution. The draft candidate remains **blocked** under the measured strict budget.
