# Exact direction-subset indexed quartic defect contraction

**Classification:** Intermediate attacker-side performance experiment, 23 November 2026 (Agent 17). This is an opt-in alternative to the original exact quartic contractor and is not a production obfuscation mechanism, API-hardening result, or 2.5x defender benchmark.

## Mathematical equivalence

The existing 32-bit degree-at-most-four exact inversion learner uses the full public vector-valued ANF model, then for each input direction v computes the entire nonconstant x-ANF coefficient set of

`Z(x,v)=F(x XOR v) XOR F(x) XOR F(v) XOR F(0)`.

For each source monomial `c_M * x_M` and every proper nonempty x subset `S` of `M`, the coefficient of `x_S` receives `c_M` exactly when `T=M minus S` is a subset of set bits of direction `v`. The original `scan` method checks **every** such split term for every v. The opt-in `grouped` method stores split terms in buckets indexed by the required direction subset `T` and visits only subsets T of v of weight 1, 2 or 3 (bounded by degree-four source promise), XORing each group's coefficient vectors to exactly the same result. An x-value's coefficient is still determined by the same XOR sum, so there is no approximation or new source assumption.

A maximally populated 32-bit degree-four ANF generates

`2 * C(32,2) + 6 * C(32,3) + 14 * C(32,4) = 534,192`

split entries (constant and linear terms have no nontrivial split). Directions of small Hamming weight visit far fewer entries when grouped; dense directions may receive less benefit. The cached buckets have additional allocation overhead; no peak-memory measurement has yet been made.

## Implementation and exact behavior

`sims/exact-quartic-compatible-cegar.js` now exports the original
`makeBoundedDegreeDefectContractor(model)` / `prepareExactBoundedDegreeInverter(model)` as unchanged default **scan** paths. The opt-in `'grouped'` constructor and `prepareExactBoundedDegreeInverter(model,{strategy:'grouped'})` give the alternative. Invalid strategy names fail closed.

`test/exact-quartic-grouped-contractor.test.js` independently compares complete coefficient vectors on 44 dense quartic direction tests including bit 31, all-one and random directions. It tests source-paired exact output inversion on two independently constructed quartic triangular permutations, and compares complete setup times on sparse fixed-gate quartic sources. Every output comparison passed in [focused Ubuntu/Windows run 45262744029](https://github.com/FlareZ123/obfs/actions/runs/45262744029), source SHA `9f478a7710dc733a99c9037e09b7a1b2f8db0794`. The full Node22 mainline suite was skipped.

In that **sparse** family (only a few nonlinear ANF monomials), full 528-contraction setup times differed minimally: Ubuntu scan 621/611 ms, grouped 618/597 ms; Windows scan 655/650 ms, grouped 627/640 ms. No material win is established for that family. The setup timing also includes other non-contraction work, such as repeated model evaluations.

## Balanced dense-model contraction kernel

`test/exact-quartic-grouped-abba.test.js` independently constructs two dense 32-bit quartic ANF coefficient sets (534,192 split terms each), a fixed 32-direction batch per seed mixing one-hot and random 32-bit directions, then measures four repetitions of each contraction strategy in ABBA/BAAB order after both were warmed. Every batch's combined coefficient parity matched; exact per-direction coefficients were verified by the separate complete-equality regression. Focused two-platform [run 45263147435](https://github.com/FlareZ123/obfs/actions/runs/45263147435) at `263c1be6c34716a8f0e51956cc92ed8a01595eef` passed Ubuntu and Windows focused tests plus strict project/external JSDoc; comprehensive Node suite was skipped.

| Runner | Dense seed | Scan 32-direction batch (ms) | Grouped 32-direction batch (ms) | Scan / grouped batch mean |
| --- | --- | --- | --- | ---: |
| Ubuntu | 393886482 | 166, 98, 91, 99 | 62, 51, 61, 50 | 2.04 |
| Ubuntu | 2121735405 | 92, 86, 90, 86 | 52, 61, 50, 64 | 1.56 |
| Windows | 393886482 | 197, 125, 126, 125 | 98, 94, 100, 96 | 1.47 |
| Windows | 2121735405 | 141, 143, 143, 143 | 113, 103, 106, 104 | 1.34 |

For these chosen dense direction batches, grouped was **1.34–2.04× faster at the contraction kernel**. This is not the ratio for full ANF fitting, full flag setup, 2.5× original-code runtime, source recovery, or general attacker end-to-end time. It is a small finite deterministic sample, not a population estimate, and the first batch includes residual warming.

The complete flag-setup paired dense-source experiment is `test/exact-quartic-compatible-cegar.test.js`, and its final source-pinned timing should be reported separately before claiming any user-visible improvement of the exact flag implementation.

## Attacker model / product disposition

All models and derivative coefficients are **attacker-side** reconstructions under an externally assumed bound on a source-function's Boolean degree; the clone cannot verify that promise from finitely restricted low-weight queries. Compatible-triangular structure is separately assumed for the global greedy inverse. No unauthorized network access, original-source extraction or general JavaScript reconstruction follows.

The main project remains **RELEASE-BLOCKED**; these results belong in `im-results/`, not the established strong-protection index. Retain the original default contractor as a stable baseline until broader source-paired end-to-end compute and memory comparisons justify selecting a different strategy.


## Same-model complete flag-setup source comparison (further validation)

The same full quartic source generator and public ANF learner already used by the main exact-inversion tests was paired across both strategies, with the setup order reversed between two source seeds. Source-pinned [run 45263432517](https://github.com/FlareZ123/obfs/actions/runs/45263432517), SHA `faca34f8c8462fe8b054b124f945840e1670dde5`, passed Ubuntu and Windows focused jobs with strict JSDoc; the full Node22 regression was skipped. For each seed, **both** complete 528+32 contraction setups yielded the same exact 16 held-out inverse targets after learning the same 41,449 responses.

| Runner | Source seed | Order | Scan complete setup (ms) | Grouped complete setup (ms) |
| --- | --- | --- | ---: | ---: |
| Ubuntu | 1904288581 | scan → grouped | 1823 | 1139 |
| Ubuntu | 1638494499 | grouped → scan | 2419 | 1138 |
| Windows | 1904288581 | scan → grouped | 2174 | 1402 |
| Windows | 1638494499 | grouped → scan | 2656 | 1290 |

The grouped exact flag setup was faster in all four selected cells; the measured full-setup speedup ranged about **1.55–2.13×**. The test changes algorithm order across source seeds but does not repeat multiple balanced cycles for the same source because full setup redoes expensive certificate work. The scan path when timed second was *slower* in these two samples; JIT/GC/host effects are not fully controlled. These are reproducible same-run engineering observations, not a universal speed distribution. The original baseline remains default pending broader performance and memory comparisons. In particular, the sparse-source full setup showed negligible benefit, so no blanket optimization claim is justified.


## Degree-two / degree-three grouped branch validation

The grouped constructor's shorter subset enumeration (only single direction bits for degree two; singles and pairs for degree three) is separately exercised in `test/exact-quartic-grouped-contractor.test.js`. It compares every returned x-ANF coefficient against the original scan for 76 deterministic 32-bit direction probes across full degree-two and degree-three random source coefficient sets. This additional test passed Ubuntu and Windows focused jobs in [run 45263699210](https://github.com/FlareZ123/obfs/actions/runs/45263699210), source `5941e48b8e9254bb80337b4a0bb9a89e896739e5`; full Node22 remained skipped. This closes a lower-degree coverage omission in the earlier grouped-quartic source pin without expanding source-family or performance claims.
