# Bounded hot/cold performance of assignment-flow private property renaming

2026-11-15. **Agent 16**. Intermediate empirical benchmark. This measures an implemented narrow transform and independent reconstruction control, not a claim of general obfuscation strength.

## Pinned experiment

The reproducible script [sims/destructuring-assignment-performance.js](../sims/destructuring-assignment-performance.js) compiles three generated private-object workloads in both COO and SNO with a fixed seed, identifier renaming disabled and string rewriting disabled. Each source contains one internal literal data owner with two fields; `proveLocalObject` renamed both keys in all six test builds. The tests cover (1) a discarded standalone destructuring assignment in a numeric loop, (2) the same assignment with a default initializer, and (3) a local interprocedural reader that destructures its proven owner parameter. Each work function increments a private field and consumes both fields repeatedly, and the owner never escapes to external application code.

Pinned build SHA: **`9c839e9cb3f56e8b9dc8c56f2eced83eecfe07c2`**. Manual [GitHub Actions run 43713168258](https://github.com/FlareZ123/obfs/actions/runs/43713168258) succeeded on Ubuntu and Windows using Node.js 22.23.4, including all six transformed-output checks, source-only attack checks and compiler JSDoc typechecking.

The baseline and transformed output execute as separate fresh Node `vm` contexts. The comparison checks numeric output equality first. Hot measurements then use five 80,000-iteration warmups, followed by sixteen alternate-order native/obfuscated pairs of **300,000 loop iterations** per path. Each row reports the **median of paired obfuscated/native elapsed-time ratios**, which is a different aggregation from a ratio of median durations. Cold measurements use twenty-four fresh-context alternate-order pairs, charging source compilation, context creation and **500 loop iterations** each time. Transformation/build time is excluded. The experiment does not measure browser page startup or real networking.

## Measured ratios

| Workload | Ubuntu hot | Ubuntu cold | Windows hot | Windows cold |
|---|---:|---:|---:|---:|
| Direct assignment, COO | 0.98176× | 1.02942× | 0.99880× | 1.01998× |
| Direct assignment, SNO | 0.99710× | 1.01101× | 0.98598× | 0.99335× |
| Default binding, COO | 1.00803× | 1.00229× | 0.99880× | 1.01985× |
| Default binding, SNO | 1.02116× | 0.95222× | 1.00054× | 1.01541× |
| Forwarded reader, COO | 0.94226× | 0.98311× | 1.00043× | 1.00914× |
| Forwarded reader, SNO | 1.00191× | 0.99284× | 1.00841× | 1.00465× |

Across six workload/mode rows and two measurement phases, there are **twelve phase-specific ratios per OS**. Each observed ratio falls below the requested **2.5×** budget in the selected workloads. No server initialization deduction was needed; the SCO mode was not measured here. The direct loop runs in roughly 0.37–0.44 ms per sample, where ratio noise and V8 optimizations are significant. The forwarded-reader loop runs in roughly 30–35 ms per sample; different JavaScript shapes should not be compared as security transformations through those raw times.

The result does not establish an upper bound on all user code, browser engines, modules, unusual JIT states or input distributions. Repeated CI runs, a realistic browser workload and an end-to-end SCO latency benchmark would be needed before broad release claims.

## Adversarial result

The independent Acorn-token source-only normalizer [sims/attacker-token-normalize.js](../sims/attacker-token-normalize.js) received only the six emitted compiled artifacts, recognized and replaced **two generated hashed property labels in each**, and preserved the same `work(4096)` output. This neutralizes the syntactic property-name obfuscation surface across all six builds. The experiment does not recover private source spellings or prove full algorithm reconstruction, and it does not model dynamic debugging.

The measured low overhead is valuable compatibility evidence and simultaneously highlights the weakness of publicly traceable hashed property names. A stronger transformation must beat this attack while retaining the workload budget.
