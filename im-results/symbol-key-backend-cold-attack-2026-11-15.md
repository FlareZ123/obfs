# Experimental private Symbol-key backend: verified hot path, cold-budget counterexample, static recovery

**Status:** intermediate engineering evidence with a negative confidentiality and performance result. Agent 22, 15 November 2026. Exact tested main source commit **`0920511bcb81d580035a52ec524208736d6b4ce2`**; two-platform [manual run 43744682043](https://github.com/FlareZ123/obfs/actions/runs/43744682043) completed green. This is a focused experimental gate, not a clean full-project release.

## Method and reproduction

The opt-in implementation in [src/symbol-properties.js](../src/symbol-properties.js) uses the existing [local object-ownership proof](../src/properties.js). For a private object whose initializer keys, immutable aliases, direct accesses, optional members, simple destructuring, and known consumers are all statically proved, the pass replaces each ordinary own key with a unique, unregistered `Symbol()` value. It replaces all proved corresponding uses. It refuses unknown keys, method/source observers, external shape escapes, and public exports. This backend uses no bytecode interpreter and preserves the native data operations where admitted.

The [checked-in original](../examples/symbol-keys/before.cjs), [actual compiled output](../examples/symbol-keys/after.cjs), and [deterministic byte verifier](../examples/symbol-keys/build-sample.cjs) are a real reproducible source pair. Integration is explicitly opt-in through `experimentalSymbolKeys:true` or the COO/SNO `--symbol-keys` CLI flag; ordinary property hashing stays the default. The backend does not attempt private-symbol ownership across imported ESM objects. Its compile-time proof does not establish that the ambient native `Symbol` constructor is trustworthy in a hostile host runtime.

## Independent verification

[The native/compiled suite](../test/symbol-keys.test.js) checks own reads, mutations, aliases, optional chaining, destructuring, unsafe-shape refusals, and executable Node two-file ESM contracts. [The independent seedless source-only attacker](../sims/symbol-key-static-recover.js) and [attacker regression](../test/symbol-key-static-recovery.test.js) detect public top-level `const key=Symbol()` declarations, rename the symbol property references to independent ordinary strings, and recover a behaviorally equivalent private-field program. The attacker has neither original source nor compiler seed.

**Result:** focused Linux and Windows Node 22.23.4 test jobs each passed **8/8** tests, strict JSDoc, hot and cold profiles. The [live Chromium comparison](../test/symbol-keys-browser.js) also passed at the same run using real COO ESM modules: both native and Symbol-key programs called a page-owned `window.externalBridge.accept` and produced the same observable `4,8`. Generated key count was two for the selected module, zero for the unselected entry.

The static attacker recovered executable field dataflow for **both of two generated private keys**, including a SNO output that had run the normal identifier/string passes. It does **not** recover the literal original private property *spellings*, and a full JS decompiler metric was not evaluated. This is sufficient to invalidate a claim of functional confidentiality for the tested private-owner case.

## Performance: incompatible hot/cold conclusions

The [hot profiler](../sims/symbol-key-profile.js) performs 250,000 calls per sample, alternating 25 median samples after warmup. At pinned run 43744682043:

| Node 22.23.4 host | Native median (ms) | Symbol median (ms) | Ratio |
|---|---:|---:|---:|
| Ubuntu Linux | 1.297273 | 1.296860 | **0.99968×** |
| Windows | 1.496500 | 1.496000 | **0.99967×** |

This is a single warm JIT kernel, not proof of general runtime safety or startup cost.

The [separate fresh-compilation surrogate](../sims/symbol-key-cold.js) creates native and transformed CommonJS functions via `new Function`, executes fresh module initialization, and then makes 0, 1, 100 or 10,000 calls. It generates modules with 1, 10 and 50 owned objects, each with two private fields. Every generated object's two fields were successfully transformed, and native/transformed checksums matched. The samples are 101 alternate-order pairs after a warmup of dynamic-compiler caches. This exercise includes parsing plus initial allocation and repeated calls, **but excludes process startup, actual browser module download and page layout**.

| Objects | Calls | Linux ratio | Windows ratio |
|---:|---:|---:|---:|
| 1 | 0 | 2.043× | 2.375× |
| 1 | 1 | 2.370× | **2.889×** |
| 1 | 100 | 2.243× | **3.121×** |
| 1 | 10,000 | **5.222×** | **5.782×** |
| 10 | 0 | **11.564×** | **16.897×** |
| 10 | 1 | **5.869×** | **6.471×** |
| 10 | 100 | **12.041×** | **11.167×** |
| 10 | 10,000 | **14.418×** | **19.907×** |
| 50 | 0 | **7.116×** | **7.590×** |
| 50 | 1 | **7.114×** | **11.707×** |
| 50 | 100 | **14.880×** | **18.745×** |
| 50 | 10,000 | **17.710×** | **22.507×** |

Bold highlights observed ratios over the required 2.5× budget. Each individual case with few calls runs in microseconds and has short-duration noise, so use the multi-object results as indicative counterexamples, not a universal cost model. The COO browser may **not** deduct initialization time from this budget. Even after allowing the optional SNO server initialization deduction, the 10,000-call results provide substantial residual short-run cost; longer-lived warmed workloads differ dramatically.

## Five independent threat/performance dimensions

1. **Static reconstruction:** independent source-only replacement recovered executable equivalent private key access for two generated keys. Positive attack, not strong static confidentiality.
2. **Dynamic instrumentation:** `Symbol()` and computed accesses remain ordinary inspectable JavaScript; a full DevTools extraction attack was not separately measured. No new protected runtime.
3. **Unauthorized modification and integrity:** emitted Symbol declarations and uses are public/editable. Existing SNO self-hash behavior and SCO remote policies are unchanged.
4. **Environment authorization:** there is no new domain/URL lock or trust mechanism. Host-side mutation of the global `Symbol` binding before execution is outside the proof.
5. **Compatibility and performance:** focused tests, strict types and real Chromium succeeded. Dense warmed calls satisfy 2.5× for the single demonstrated kernel, but the cold surrogate exceeds 2.5× by a large margin on many permitted private-object workloads.

## Decision and next work

**Keep experimental and opt-in. Do not enable by default, advertise as anti-decompilation, or use for unprofiled COO/SCO execution.** Benchmark each real workload's startup and short-running warmup before considering inclusion. The ordinary conservative string-key renamer remains preferable as a general compatibility/performance baseline. Future work can investigate a runtime-dataflow representation whose cold and warm costs stay within the constraint and whose source-only attacker recovery is demonstrably harder; unique public Symbols alone do not meet either test.

The broader [main validation 43743438040](https://github.com/FlareZ123/obfs/actions/runs/43743438040) at earlier `a7b92c93bcb5c428b2454bf54e5d141d43839d01` still had seven pre-existing failures per OS plus a separate Ubuntu Chromium property-count mismatch; it must not be described as a green release. Pinned focused run 43744682043 is green at its own commit and includes the independently generated Symbol sample.
