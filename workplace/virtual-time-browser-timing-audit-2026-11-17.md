# Browser timing instrumentation audit: virtual-time flags with performance clocks

**Author:** Agent 8, 2026-11-17 13:30 UTC. **Scope:** source inspection of `main` JavaScript files with `browser` in filename and `test/` or `sims/` path, plus pending PR49. This is a reproducible audit inventory, not a claim all benchmarks are wrong. The source inspection does not cover other filenames or external benchmark harnesses. **Status:** intermediate investigation.

## Trigger and exact negative evidence

A Chromium cold multi-module experiment, [Ubuntu job 134059201251](https://github.com/FlareZ123/obfs/actions/runs/44089085066) at executable SHA `e199a25c312fedf595df8aa0ab72626ac05a3224`, correctly executed 108 complete original/obfuscated/attacker-rebuilt stateful ESM sessions and fetched 324 unique module URLs. With `--virtual-time-budget=45000`, `performance.now()` recorded **0 ms** for **every** separately measured synchronous application invocation, including 10,000 Unicode events, while each asynchronous graph import appeared ~30 ms. Output SHA-256s and external callbacks matched Node originals. The test passed its prior nonzero-*total* assertion but its 'COO/native 1.0×' timing result is unusable for the 2.5× compute budget.

The observed mechanism is insufficient advancement of the benchmark's selected clock while protected synchronous work runs under this specific virtual-time Chrome configuration. It is not proof that all `performance.now()` uses or all virtual-time browser checks fail. See [exact evidence and corrected clock-liveness harness](../im-results/polyvariant-app-cold-browser-clock-2026-11-17.md) in draft PR57, and the benchmark correction CI [44091233847](https://github.com/FlareZ123/obfs/actions/runs/44091233847), which was queued when this inventory was written.

## Similar code paths requiring independent clock validation

The following **main-branch** files were explicitly fetched by the GitHub repository connector on 17 November and each contains both an invocation of Chrome with `--virtual-time-budget` and a JavaScript `performance.now()` measurement on the page or embedded script:

| File | Measured task identified in source | Clock-audit priority |
| --- | --- | --- |
| `sims/coo-native-shards-browser-session.js` | Browser ESM session elapsed time | High: emitted/native startup and work claim |
| `sims/fixed-arity-browser-session.js` | Page construction/initialization elapsed time | High: a browser budget claim |
| `test/polyvariant-affine-browser.js` | Native and transformed hot arithmetic loop | High: 2.5× arithmetic measurement |
| `test/polyvariant-app-three-way-browser.js` | Original, emitted and attacker rebuilt warmed full application | High: published browser attacker cost comparison |
| `test/branch-block-browser.js` | 3M-iteration native, transformed, masked loops | Medium: hot branch optimization comparison |
| `test/coo-native-shards-browser.js` | Native and encoded work elapsed time | Medium: shard timing |
| `test/coo-runtime-one-query-browser.js` | Module import and fitting-query attacker wall time | High: could mismeasure time-to-clone |
| `test/wasm-i32-browser.js` | Native and lowered Wasm arithmetic work | High: competitive performance claim |

A **separate open PR49 branch** `agent4/minified-native-release-control-20261117` has `test/polyvariant-app-four-way-browser.js` with the same flag (`--virtual-time-budget=30000`) and `performance.now()` for 12 paired warmed four-way trials and 12 fresh ESM trials. Its existing independently pinned browser results were positive and not zero; **their validity is not denied by our separate counterexample**, but an independent liveness probe in that exact page/Chrome configuration is required before treating the numbers as strong browser runtime evidence.

Of the remaining 31 fetched matching browser-filename scripts in this bounded audit, most use `--virtual-time-budget` only as a **page completion primitive** and perform output or transport equivalence checks, without `performance.now()` measurements. Those browser checks should not be blanket classified as timing-invalid solely for using virtual time. A separately fetched `sims/sco-devalue-browser-profile.js` used `performance.now()` but did **not** contain the virtual-time flag, so this specific flag-based hypothesis does not apply to it.

## Minimal reproducible remediation

1. At the exact CI SHA, add an independent **synchronous CPU liveness probe** comparing `performance.now()` before/after a consumed, bounded computation. Refuse a zero/no-progress interval for the workload on which a timing conclusion depends.
2. Compare the same actual published/native/reconstructed or minified source bytes under **ordinary real-time** Chrome, with the application callback/output checksum unchanged, before altering the stated candidate performance decision. Log the Chrome version and timer quantization. The local root URL must be securely scoped and the benchmark's network/setup boundary explicit.
3. Preserve exact raw samples and the distinction among (a) load/network/ESM graph time, (b) application computation, and (c) total first-call latency. Network-dominated totals can mask excessive CPU slowdown; separately test hot workload compute.
4. Keep existing paired-ratio/familywise statistics as conditional tools only after the clock has been validated. A one-sided median bound and zero observed over-budget pairs are not proof of a universal 2.5× limit.
5. Prefer one corrected, source-pinned shared browser runner over dispatching many independent, stale SHA matrices. Only promote results demonstrated with a functioning clock and positive work control.

**No security gain inference:** this audit is about measurement validity, not a new obfuscation method or evidence against static recovery, hostile instrumentation, integrity bypass or execution outside authorized environments. The larger obfuscator objective remains unsolved.
