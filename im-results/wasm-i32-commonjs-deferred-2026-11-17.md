# Experimental CommonJS WebAssembly first-use compilation: direct cached-call tradeoff (2026-11-17)

**Classification:** intermediate implementation and sampled performance evidence. This is **not** a strong-obfuscation result, a complete 2.5× guarantee, or an approved SNO policy.

## Question and supported boundary

The opt-in `src/wasm-i32.js::lowerWasmI32Functions` compiler emits a public Wasm i32 binary for an explicitly selected, pure, typed signed-Int32 expression grammar. The older CommonJS emission eagerly compiled all selected functions before a module executed. SNO server initialization may be amortized under the experiment's budget, whereas a deferred compilation inside the first real function invocation must be charged as runtime. COO and the already hoisted ESM helper have different startup/cycle behavior.

A new **default-false** `deferCommonJsInitialization` compiler flag, surfaced as `experimentalWasmI32DeferredCommonjs` in the group API and `--wasm-i32-defer-commonjs` for SNO CLI, compiles each CommonJS function on first invocation. The existing eager CommonJS default remains unchanged. No source secrecy is created: generated Wasm bytes remain visible and separately reconstructible by existing public-only attackers.

## Red and green evidence

1. Source-pinned preimplementation control: [Ubuntu/Windows focused run 44098577063](https://github.com/FlareZ123/obfs/actions/runs/44098577063), SHA `507921c7c7a163db9b33bf929c4cfb661500ef18`. Both runner jobs failed *exactly two* new first-call assertions: unused functions compiled **2 instead of 0** and a one-function top-level call compiled **2 instead of 1**. The other 60 tests passed.
2. The naive hoisted self-rebinding helper (`function helper(){helper=wasm;return helper(...)}`) preserved test behavior but imposed 100k-call warm median slowdowns of **12.6–14.3× native** in the new selected workloads, despite cold savings. See [run 44100113741](https://github.com/FlareZ123/obfs/actions/runs/44100113741), SHA `f07bff1f71971272a1f876a587086e3570bb11dd`. Ubuntu failed in a separate Chromium CSP harness after all Node tests, JSDoc checks and the profiler passed; Windows was fully green. The self-rebinding design is rejected for these workloads.
3. The revised **direct cached-call** helper has a lexical `let` cache and an initialization function. The protected source `f` calls `cache ? cache(args) : first(args)` directly, avoiding the extra JS call and self-rebinding shared function. [Run 44101123000](https://github.com/FlareZ123/obfs/actions/runs/44101123000), exact SHA `05669c073deffb9e33bcd5be24f7fa18e9ba3f22`, passed focused Node tests and both strict JSDoc checks on Windows/Ubuntu, plus Ubuntu's first browser check. Windows job fully green. The Ubuntu job failed at the strict-CSP browser check independently of the CommonJS behavior/performance tests.

**Focused integrated green:** [run 44101868562](https://github.com/FlareZ123/obfs/actions/runs/44101868562) at exact SHA `fe79ddd5815de36ac76aa45b35171b0fe41dad8a` passed **both** Ubuntu/Windows Node 22 suites, both strict JSDoc gates, the SNO group compiler/CLI opt-in regression, the whole-graph/paired cost tools, and all three Ubuntu real-Chromium Wasm/browser/CSP jobs. This run is a focused gate; it does not certify every repository test or workload.\n\nThe strict-CSP failure exposed a flawed harness: `test/wasm-i32-native-clone-browser.js` inferred Wasm compilation denial from `await import('/wasm/entry.mjs')`, but the generated **ESM helper compiles lazily when called**. Import can therefore succeed under strict CSP. The harness was changed to invoke the published function and require a CSP-related `WebAssembly.CompileError`. The CSP specification restricts Wasm bytecode compilation in `script-src` unless explicitly permitted (see [MDN CSP `script-src`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src)). The corrected check's positive-denial and permitted-compilation branches were subsequently exercised in the integrated green run above.

## Paired selected-workload cost samples

Each case compiles **N=1, 8, or 24** selected pure bitvector functions but executes only the first. The comparator uses identical seed/source for eager/lazy, a native unmodified source, 11 fresh `vm` sessions per variant, rotating order, one initial invocation per session and 100,000 subsequent calls per warm timed sample. Reported figures are ratios of each variant's sample medians rather than paired-ratio confidence bounds.

| Platform | Selected functions | Eager/native cold | Deferred/native cold | Eager/native warm | Deferred/native warm |
| --- | ---: | ---: | ---: | ---: | ---: |
| Windows Node22 | 1 | 1.148× | 1.168× | 1.455× | 1.707× |
| Windows Node22 | 8 | 1.159× | 1.118× | 1.943× | 2.132× |
| Windows Node22 | 24 | 1.669× | 1.173× | 1.717× | 1.991× |
| Ubuntu Node22 | 1 | 1.057× | 1.053× | 1.870× | 2.078× |
| Ubuntu Node22 | 8 | 1.207× | 1.094× | 2.124× | 2.243× |
| Ubuntu Node22 | 24 | 1.462× | 1.014× | 1.976× | 2.388× |

All six **sample median** deferred warm ratios were below 2.5×. The Ubuntu 24-function result is close to the hard threshold; individual samples and different workloads can exceed it. Cold timing includes JS parsing, module evaluation, and the *first selected function call*, so first-use compilation cost is not hidden in the denominator. Measurements come from action logs and are reproducible through `sims/wasm-i32-commonjs-lazy-profile.js`. No bound on worst-case overhead, network distribution, sustained app behavior, or target environments is established. Reconstructing and instrumenting the public Wasm bytes remains feasible.

The three-way cost result has a specific interpretation: deferred compiling unused functions can reduce short-session preparation work, at the price of an extra hot-path test and later first-call compilation. When all protected functions are called, the benefit may vanish. The current evidence does not justify enabling the feature by default, and operators must measure representative workloads before opting in.

## Follow-up

- Retain the existing immutable Ubuntu/Windows/Chromium green gate with actual-invocation CSP denial and exposed SNO integration switch; do not mistake it for a whole-project or broad-budget certification.
- Add direct first-use and repeated-call tests for multi-parameter, unsigned-shift and transformed exported function references; compare preserved results.
- Test deployment-shaped SNO whole-session cost, with explicit separation of eligible server initialization from charged runtime.
- Do not claim this improves static reconstruction, runtime extraction, tamper resistance, or lock integrity; all those axes require separate attacker evidence.

## Additional static-adversary control

A subsequent source-only test, `test/wasm-i32-deferred-static-recovery.test.js`, asks the existing independent `sims/wasm-i32-static-recover.js` attacker to recover two public binaries across 16 varied seeds and reassemble a native CommonJS equivalent for 16,384 held-out typed comparisons. The old eager-only *full-module* rewriter must decline the new wrapper syntax; that narrow tool mismatch must never be marketed as improved obfuscation. This new regression remains pending a separate exact-SHA focused run.\n