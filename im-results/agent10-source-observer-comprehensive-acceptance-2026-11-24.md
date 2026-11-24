# Agent 10: comprehensive source-observer candidate acceptance — NO-GO (24 November 2026)

**Decision:** NO-GO / park the candidate.  
**Workflow:** [manual-validation run 45449892790](https://github.com/FlareZ123/obfs/actions/runs/45449892790)  
**Branch:** `agent3/frozen-main-rebase-20261124`  
**Exact checkout SHA:** `d56cc8c1fc07a61aa6cfad0852b2ac681e30cd7c`  
**Compiler implementation:** `src/source-observation-plan.js`, blob `cf1df37afb65ff60e639a005827df58914325127` (same production implementation as candidate commit `c243152490394f9289e5516548d93005995711b6`); later branch commits added tests, benchmark harness and evidence only.  
**Invocation:** Agent 10, lease `2026-11-24T17:32:44.860694Z`.

The workflow was dispatched with `focused_test` empty. Both mandatory Node 22.23.4 jobs executed the complete `test/*.test.js` corpus; the focused job was skipped as intended. Checkout was independently verified in both job logs: Ubuntu job `138643755669` and Windows job `138643755667` each fetched `d56cc8c1fc07a61aa6cfad0852b2ac681e30cd7c` and ran `git log -1 --format=%H`, which printed that exact SHA. The workflow does not literally invoke `git rev-parse HEAD`, but this command reads the same checked-out commit. The run completed with failure on both platforms.

## Comprehensive behavioral/adversarial suite

| Platform | Tests | Passed | Failed | Skipped | Test duration |
|---|---:|---:|---:|---:|---:|
| Ubuntu | 5,390 | 5,353 | 12 | 25 | 430,503 ms |
| Windows | 5,390 | 5,344 | 12 | 34 | 584,743 ms |

Both platforms reported the same 12 failing cases:

1. `bound-runtime-interception.test.js` — hostile bind interception expects two private rewrites; observed zero.
2. `bound-runtime-minifier-control.test.js` — same pre-import bind interception control expects two rewrites; observed zero.
3. `factory-object-flow.test.js` — private ESM factory expects one rewrite; observed zero.
4. `function-declaration-reader-proof.test.js` — cross-module named declaration reader expects two rewritten keys; no positive yield.
5. `function-declaration-reader-proof.test.js` — public-only normalization fixture expects one rewrite; observed zero, so its normalization stage does not establish an attack against a transformed output in this run.
6. `interfile.test.js` — four-file ESM dataflow expects one rewrite; observed zero.
7. `private-class-source-yield.test.js` — COO private direct-use class expected positive owner-key yield; observed false.
8. `private-class-source-yield.test.js` — same positive-yield failure in SNO.
9. `private-tuple-session.test.js` — two transformed owner fields expected; observed zero.
10. `sco-dense-hybrid-matched-http.test.js` — selected-SCO admission throws: “Selective SCO only admits distinct primitive literal const declarations or explicitly approved server environment reads”.
11. `sno-bound-runtime-interception.test.js` — two private record rewrites expected; observed zero.
12. `source-stable-bound-export.test.js` — two private key rewrites expected; observed zero.

The candidate-specific Node producer suite, `test/source-observation-plan-producer.test.js`, was part of the comprehensive corpus and is absent from both platform failure indexes; it therefore passed in this run, including its 16 rebind/mutation negative controls. This is a bounded producer-level pass, not a full-project acceptance pass. The paired candidate CPU diagnostic records one private property plus two binding rewrites in the small fixture, and one private property plus 34 binding rewrites in the medium fixture; both have zero literal rewrites because the FramePosition guard rejects the decoder prologue.\n\nThe majority are transformation-yield assertions, not native/emitted value mismatches. Cross-reference Agent 1's [11-case classification](agent1-452835-yield-failure-classification-2026-11-24.md): it classifies four as valid fail-closed source-preservation refusals (factory-object-flow, interfile, private-tuple-session, source-stable-bound-export), four as attacker-side extraction/normalization witnesses whose attack stage did not execute on a nonzero transformed output in the failed run (bound-runtime-interception, bound-runtime-minifier-control, sno-bound-runtime-interception, public-only normalizer), and three as genuine positive-yield gaps (cross-module named declaration readers, private-class COO, private-class SNO). The twelfth case, `sco-dense-hybrid-matched-http`, is a separate selective-SCO admission failure and was not part of Agent 1's 11-case classification. That classification is inherited from Agent 1's source/test review, not an independent re-execution by this invocation.

The SCO dense-hybrid case is now localized to a deterministic fixture source-shape bug. In `sims/sco-dense-hybrid-matched-http.js`, `rivestCoefficients(polySeed)` toggles parity with `coefficients[3]^=1` but does not reapply `u32`. Reproducing the exact fixture seed in Node 22.16.0 gives raw coefficients `[2434989846,382424758,4289249208,3819354487]` and corrected values `[2434989846,382424759,4289249208,-475612810]`. The generator emits `const OBFS_PRIVATE_C3=-475612810;`; that negative initializer is an ESTree `UnaryExpression`, not a `Literal`, so the selective SCO partitioner's literal-const gate correctly refuses it at line 1867. A narrow fixture correction is to wrap the XOR result in `u32` (for indices 2 and 3 for consistency). This preserves the intended 32-bit coefficient modulo semantics: `u32(-475612810)=3819354486`, exactly `2^32` apart, and a deterministic 1,000,000-case check of `u32(Math.imul(acc,x)+signed)` versus the unsigned coefficient had zero mismatches. No fixture or partitioner code was changed, and no rerun was dispatched; Agent 1 was asked to independently verify this diagnosis. This is a test-fixture source-shape issue, not evidence that the partitioner should admit arbitrary unary expressions.

The same 12 names were already reproduced in the source-paired 10-file control: frozen base [45423430520](https://github.com/FlareZ123/obfs/actions/runs/45423430520) at `deddc405307bf9bb39d7cb5a0b5eba36edf58593` and candidate [45423442804](https://github.com/FlareZ123/obfs/actions/runs/45423442804) at `f507f782fb6d70367153686cbe1c1f833433d5c7`, each 44 tests / 32 passed / 12 failed on both OS. The current comprehensive run is a later candidate pin (`d56cc8c1`), not either of those control commits. This supports that these 12 are present on the frozen base within that selected slice; it is **not** a comprehensive full-suite base-vs-candidate comparison.

## Other workflow results

Both platforms passed:
- `npm run typecheck`
- `npm run typecheck:external`
- strict JSDoc for the low-rank affine-oracle tests
- strict JSDoc for paired/complete-suite budget evaluators
- `npm run benchmark`
- paired own-key/null-prototype six-module session profiles
- native/emitted local formal-value whole-process profiles and public-clone checks

The standard benchmark's 11 workloads were near parity (approximately 0.63×–1.03× in the Ubuntu sample and 0.76×–1.03× in Windows). The six-module session and local parameter-value profiles preserved outputs and observed ratios near 1×, with two private properties renamed in the tested application. These are narrow workload samples, not a universal 2.5× ceiling.

The isolated width-four exhaustive step was skipped after the behavioral suite failed. The optional direct-alias A/B and blind-affine audit inputs were not enabled; their associated artifact step was therefore skipped.

## Real Chromium integration

Ubuntu's `npm run test:browser` failed at `test/source-observation-plan-producer-browser.js:220`:

> Chromium wall-time median must be supported and have no observed strict 2.5x pair breach; this is not a CPU-compute proof

The fixture times one fresh Blob-backed ESM import per sample with `performance.now()`, after six warm-up pairs and across 31 alternating pairs per workload; it is explicitly a module-evaluation wall-time measurement, not a CDP/OS CPU trace. The fixture's assertion runs before its budget-bound diagnostic JSON is printed. Therefore this integrated run does **not** disclose whether the paired-median decision was unsupported or whether a strict wall-time pair breach occurred. Do not infer a CPU breach from this message. The preceding native/emitted browser parity checks completed, but the integrated wall-time gate failed.

The next two Chromium steps passed:
- `verified-record-browser.js`: 64 cases, two private fields renamed, two null-prototype private fields renamed, all outputs matched; the report explicitly records that private source remains publicly fetchable.
- `esm-observation-browser.js`: six cases, six protected private fields, three observer refusals, six normalized public fields, native browser parity true.

Dedicated earlier browser receipts [45420013658](https://github.com/FlareZ123/obfs/actions/runs/45420013658) and [45422470318](https://github.com/FlareZ123/obfs/actions/runs/45422470318) passed, but the current full integrated run failed this wall-time gate. Preserve the discrepancy; do not select only the passing focused receipts.

## Separate candidate CPU diagnostic

The dedicated Node main-thread CPU diagnostic [45422437764](https://github.com/FlareZ123/obfs/actions/runs/45422437764) passed on Ubuntu and Windows at `1953e278db94addf99406f6cee944d0ab459f836`; the production compiler source is unchanged from the current `c243152` implementation. It measured 31 alternating native/candidate pairs per workload, 512 fresh ESM imports per batch, and six warm-up pairs using `process.threadCpuUsage()`.

| Platform | Workload | Median paired CPU ratio | Maximum observed pair | Strict >2.5× CPU pairs |
|---|---|---:|---:|---:|
| Ubuntu | Small | 1.003× | 1.108× | 0 |
| Ubuntu | Medium, 32 retained strings | 1.053× | 1.178× | 0 |
| Windows | Small | 0.984× | 1.660× | 0 |
| Windows | Medium, 32 retained strings | 1.005× | 1.205× | 0 |

The paired familywise diagnostic returned `sample-supported` for these two workloads. With 31 pairs and zero observed breaches, its reported 95% familywise per-workload upper breach-frequency bound is 11.2189% under an independent, representative-pair assumption. **That assumption is not established by this sampling design:** all pairs are sequential in one Node process/V8 isolate. Alternating arm order does not remove serial dependence from JIT tiering, heap/GC pressure, code-cache behavior, CPU/thermal drift or process-local state. Treat the interval as a conditional diagnostic, not validated 95% coverage. Even under the iid assumption, a per-workload upper breach-frequency bound below 1% at 95% familywise confidence across two workloads would require at least 368 independent pairs per workload; 31 pairs only yield the 11.2189% conditional bound. This is not a deterministic maximum and does not qualify repeated hot-function execution or sustained sessions. The workload also intentionally retains string literals because the FramePosition guard rejects the decoder prologue; these figures do not measure decoder overhead.

## Interpretation and disposition

- The comprehensive candidate gate is **RED** on both Ubuntu and Windows, with the same 12 behavioral/adversarial failures.
- Strict JSDoc and the standard benchmark/profile steps passed; that does not compensate for the red behavioral suite or the integrated Chromium wall-time failure.
- The candidate is still a narrow, opt-in, single-file ESM COO compatibility experiment. Its host intrinsic is explicitly `unknown-or-mutable`; a caller-declared pristine-intrinsics premise is not a trust anchor in an attacker-controlled browser realm.
- No cross-file, SCO, SNO, static reconstruction resistance, hostile-runtime tamper resistance, environment-lock guarantee, or universal 2.5× compute bound is established.
- No production source-observer implementation is merged into main. Keep the candidate branch and evidence intact; do not weaken positive-yield assertions or merge this candidate. Do not promote this report to `results/`.

**Next:** park this candidate at the frozen pin. Any future revival requires a separately approved source revision, a source-paired full acceptance decision, an integrated browser budget diagnostic that prints raw samples before asserting, and a measured threat-model-specific security advantage over an equal-trust minified control. The global product decision remains **RELEASE-BLOCKED**.
