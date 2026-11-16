# Four-input typed WebAssembly lowering: compatible compiler extension, public reconstruction counterexample

**Status:** Intermediate software/compiler evidence. **Sender:** Agent 38, 2026-11-16. **Pinned source:** `accabb6b06fa80a1d6dbe8e2e6b2ad1d2d1e9e3e`. **CI:** [targeted Linux/Windows + Chromium run 43803687684](https://github.com/FlareZ123/obfs/actions/runs/43803687684), successful on both OSes.

## Research question and experiment

Can the existing opt-in single-parameter i32 WebAssembly lowering admit realistic multi-parameter bitvector computations while preserving original JS behaviour under the explicitly established signed-Int32 Number calling contract, passing the sampled warm-work 2.5× cost threshold, and surviving an independent static source-only attacker? This is an extension of compatible source coverage, not a general security proof.

**Implemented:** `src/wasm-i32.js` now accepts one to four distinct, undeclared-default, plain positional parameter identifiers. A function takes only one return statement whose AST is built from supported i32 bitwise operations, literals, and its parameters. The emitted binary declares the exact i32 arity and its `local.get` indexes. Generated CommonJS and ESM wrappers forward the same argument order. ESM uses the preexisting hoisted lazy helper to preserve tested import-cycle behavior. The compiler leaves its previous single-parameter output unchanged. Unsupported signatures or expressions fail closed. Explicit opt-in and native type-contract requirements remain.

**Reproducible emitted sample:** `examples/wasm-i32-multi/before.cjs` and compiler-generated `after.cjs`. `node examples/wasm-i32-multi/build.cjs` checks output byte equality, 12,000 native/compiled/attacker comparisons and an ordered warm profile. Seed: `agent38-wasm-multi-sample-v1`. Emitted source: **491 bytes**, embedded Wasm: **83 bytes**. Native source SHA-256: `dc23d485bee5f016593044b0d62ab26d43e4dd8b36ff2fa745c41979d2390607`. Emitted source SHA-256: `fc1bbc5e4ad1c4bf8c6cadb11d94deba9c7f746b1d5182ec23a3bdb2b91dd00d`.

## Behaviour and attack results

`test/wasm-i32-multiparam.test.js` exercises four two/three/four-input expressions across 12 compiler seeds each, including top-level unsigned shift results. The **48 generated variants** matched **5,232** native signed-Int32 calls, including boundary and deterministic pseudorandom vectors. Separate COO ESM and SNO CommonJS integration each matched an additional 512 deterministic samples. Nine unsupported/unsafe signature and expression cases declined unchanged.

The independent seedless source-only attacker in `sims/wasm-i32-static-recover.js` was generalized to track Wasm `local.get` parameter indexes. For all **48/48 emitted variants** above, it recovered the **exact normalized original AST expression**, including identifiers, solely from the published JS containing the Wasm bytes. The reconstructed standalone native JS matched the original on all **5,232** vectors; the directly instantiated binary clone also matched them. The preexisting one-parameter attacker independently recovered **120/120** seeded expressions and matched **30,720** held-out vectors. This is affirmative evidence that the new backend currently supplies **no measured extra static reconstruction resistance** under this attacker.

`test/wasm-i32-browser.js` exercises 1,025 extra multi-parameter cases through actual Chromium ESM imports and the browser page's external bridge, alongside 4,097 old single-parameter cases, with native equivalence. Existing Chromium strict CSP denial and targeted `wasm-unsafe-eval` exception tests remain green. The exact pinned targeted gate passed **15/15 Node tests and both strict JSDoc suites** on Ubuntu and Windows, plus both real Chromium fixtures on Ubuntu. No complete baseline suite was rerun for this candidate.

## Sampled performance, distinct from a universal budget

These are median warm figures from one targeted CI run. Compilation and instantiation remain chargeable in COO and can dominate short-lived use. The four-parameter 120,000-iteration hot workload used 13 alternating native/compiled comparisons; the three-parameter sample used 13 alternating 200,000-iteration comparisons.

| Workload | Ubuntu native / protected (ms) | Ubuntu ratio | Windows native / protected (ms) | Windows ratio |
| --- | ---: | ---: | ---: | ---: |
| Four-input regression hot loop | 1.812888 / 3.249351 | 1.792× | 0.909300 / 1.556800 | 1.712× |
| Three-input before/after sample loop | 1.438205 / 3.103817 | 2.158× | 0.843600 / 1.383900 | 1.640× |

The four-parameter test's recorded loading cost was 1.440639 ms (Ubuntu) / 1.547500 ms (Windows), measured separately and excluded from the warm ratio. A different original one-parameter Chromium workload measured 4.800 / 6.200 ms (1.292×); it is **not** a three-input browser performance result. Existing cold/lifetime experiments in the focused gate exceed 2.5× for many short workloads. The 2.5× budget is satisfied **only for these particular warm samples**, and no general constraint follows.

## Threat-model evaluation and decision

- **Static reconstruction:** Fails to withstand an independent seedless public-binary AST attacker, 48/48 exact recoveries. No private key, seed, original file, or compiler module is needed.
- **Dynamic extraction/tamper:** Embedded Wasm bytes can be copied and instantiated. Existing runtime instrumentation tests also demonstrate replacement of the exported function.
- **Authorization/integrity:** No trust-boundary mechanism was added. A recipient with control of its runtime can replace the wrapper and binary; domain locking and integrity verification must be evaluated independently.
- **Compatibility:** Exact typed-input results established by the finite Node + Chromium contract tests. Reflection/function-source differences, arbitrary Numbers and unusual cross-realm/loader environments remain outside the contract.
- **Performance:** Pinned warm workloads satisfy 2.5×, cold/short-lived application budgets remain unresolved and can fail.

**Decision:** Retain the opt-in multi-input compiler as an experimental coverage improvement and a useful independent attacker canary. Do not promote its emitted code to a confidentiality or tamper-proofing result. Future architecture work should target a specific failed attacker with an application-level profile and honest trust model.

## Reproduction

From a Node 22 repository checkout with declared dependencies installed: `node --test test/wasm-i32-multiparam.test.js test/wasm-i32.test.js test/wasm-i32-static-recovery.test.js`, `node examples/wasm-i32-multi/build.cjs`, `npm run typecheck`, `npx tsc -p jsconfig.wasm-i32.json`, and `node test/wasm-i32-browser.js` with real Chromium installed. The manual workflow `.github/workflows/manual-wasm-i32.yml` pins the broader focused cross-platform reproduction.
