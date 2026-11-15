# Typed numeric JavaScript-to-Wasm candidate: fast hot path, trivial binary cloning, cold-budget failures

**Status:** experimental engineering comparison, not a published security result or general JS compiler. Researcher Agent 12, 2026-11-15.

## Question and candidate implementation

Would WebAssembly translation protect pure numeric JavaScript functions more efficiently than the rejected public postfix VM? The existing postfix VM exceeded 15× isolated hot-path overhead and was independently reconstructed. A Wasm implementation might run near native JS speed but introduces binary compilation/startup costs and a typed semantic restriction.

Implemented a **strict opt-in experimental compiler** in `sims/wasm-numeric-lower.js`. It uses the existing Acorn parser plus a separately installed, pinned **Binaryen 132.0.0** research compiler, without changing the released `src/` pipeline or the main package dependency list. The input grammar accepts exactly one named, non-generator, synchronous function declaration with 1–8 distinct plain parameters and one return expression. Expression nodes are restricted to the parameter identifiers, number literals, unary minus and binary `+ - * /`. Any other construct raises an explicit error. The output is a standalone binary Wasm module with one f64 function exported under the original function name. The binary itself runs with the standard WebAssembly JavaScript API; Binaryen is **offline tooling**, absent from distributed runtime output.

**Crucial contract:** all arguments must already be primitive JavaScript Numbers, and the code must not observe original function-source spelling. JS `"4"+2` is `"42"`; a Wasm `f64.add` export called with those inputs yields `6`, demonstrating why this requires external type/ownership proof. Function`#toString`, error stacks, arbitrary coercion, precision expectations outside f64, JS host state, `this`, closure captures and more cannot be translated by this candidate. No claims of general semantics-preserving lowering.

## Differential and adversarial tests

Sources:
- `sims/wasm-numeric-lower.js` (strict compiler and independent binary-clone attacker)
- `sims/wasm-numeric-experiment.js` (5,121 native JS vs Wasm checks, cloned binary checks, disassembly and isolated hot benchmark)
- `sims/wasm-numeric-cold.js` (short-run cold startup performance)
- `.github/workflows/manual-wasm-numeric.yml` (manually dispatched Ubuntu/Windows Node.js 22, `binaryen@132.0.0` separately installed)

Pinned source commit: `b72afa04083da94a0d531eb720cc390bb0a23107`; fully green manual experiment [CI #43698048170](https://github.com/FlareZ123/obfs/actions/runs/43698048170). Follow-up with cold benchmark included: head `e2120d30eef38bfcfc46050c0b60ff4c6b511c38`, green [CI #43698242446](https://github.com/FlareZ123/obfs/actions/runs/43698242446).

The emitted test function was `function score(x,y){return (((x*1.25)+y)*0.75)-(x/7);}`. Binaryen generated **76 bytes**. On each OS, 5,121 values including +0, -0, NaN, infinities, subnormal values, extreme floats and 5,000 deterministic numeric pairs agreed with native JS under exact `Object.is` comparison, so no epsilon tolerance obscured a mismatch.

An attacker receiving **only the emitted public Wasm bytes and export name** instantiated an independent, byte-for-byte executable clone with the standard `WebAssembly.Module`/`Instance` APIs. It matched **5,121/5,121** outputs on both OS. Separately, the public Binaryen reader `readBinary(bytes).emitText()` exposed `f64.mul`, `f64.add`, `f64.sub`, `f64.div`. This is exact executable cloning, with verified instruction disclosure, rather than a claim of fully reconstructed original JS source text. No seed, source string, compiler API or private server access was required by the attacker.

## Performance (Node.js 22.23.4)

Each hot benchmark performed 220,000 calls in a loop, with warmups and 28 alternating-order samples per variant. It compares native JavaScript to Wasm direct export calls; startup is excluded in this column. Collected from the initial pinned cross-platform run:

| OS | Original median (ms) | Wasm median (ms) | Direct hot ratio |
|---|---:|---:|---:|
| Ubuntu | 3.457355 | 3.998622 | **1.1566×** |
| Windows | 2.545500 | 3.030800 | **1.1907×** |

Wasm binary compilation and instantiation in the already-running process took **0.2641 ms on Ubuntu / 0.1876 ms on Windows** for this isolated sample. Offline Binaryen lowering took 419.0/372.6 ms respectively and belongs to the build stage rather than the delivered precompiled program; in COO, **runtime** startup must still count. The raw timings are JIT- and runner-sensitive.

The later cold study compares fresh `new Function` JS compilation to a fresh `WebAssembly.Module` and `WebAssembly.Instance` per sample, plus the specified number of actual calls. The inputs and output are identical. This is a **surrogate startup comparison**, not full page/network/module-loading time. Each row is the ratio of medians over 20 alternating-order trials; small values are timing-noisy and the control's dynamic compile is an approximation:

| Calls after fresh creation | Ubuntu JS ms | Ubuntu Wasm ms | Ubuntu ratio | Windows JS ms | Windows Wasm ms | Windows ratio |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0.000941 | 0.004356 | **4.629×** | 0.002300 | 0.009400 | **4.087×** |
| 10 | 0.001332 | 0.003615 | **2.714×** | 0.003000 | 0.009800 | **3.267×** |
| 1,000 | 0.050114 | 0.222288 | **4.436×** | 0.075900 | 0.355800 | **4.688×** |
| 100,000 | 1.196475 | 1.618698 | **1.353×** | 1.745900 | 2.287000 | **1.310×** |

The 1,000-call anomaly relative to the 10-call ratio may reflect JIT tiering, module compilation caching and very short sample noise. These observations strongly **reject a universal ≤2.5× guarantee** even for this constrained subset. Longer-lived hot work was within the budget for the specific tested kernel and hardware. The prompt's initialization deduction is only eligible for **server-side SCO or SNO initialization**, not the COO browser path.

## Five independent evaluation dimensions

1. **Static reconstruction / executable cloning:** exact public-binary cloning succeeded 100% (5,121 checked points) on both OS. Generic binary disassembly reveals arithmetic ops; no original JS source/name recovery claimed.
2. **Dynamic analysis / instrumentation:** direct attacker instantiation of the public binary and export worked. A debugger can instrument calls; a specific DevTools automation attack was not measured.
3. **Tampering / environment authorization:** local Wasm bytes and wrapper remain attacker-modifiable under COO/SNO full-control models; no cryptographic trust boundary was introduced. No server authorization feature implemented in this candidate.
4. **Native compatibility:** 5,121/5,121 exact output agreement for the test **Number-only** function. A demonstrated string-concatenation counterexample makes broader JS equivalence false; ESM cross-file references and original `toString` remain unsupported.
5. **Performance:** isolated hot ratio 1.16–1.19× passed 2.5×; several cold short-call ratios 2.7–4.7× exceeded it. No generalized CPU budget claim.

## Decision

**Keep this as an isolated experimental numeric backend and performance comparator. Do not enable it as a default security transform.** The current candidate adds a typed contract, creates startup costs on short-lived workloads and provides no demonstrated source confidentiality against full-control attackers. Relative to the current postfix VM it shows that a selected compiled numeric kernel can run close to native, but public WebAssembly is neither a cryptographic secret nor a protected execution boundary. Any further integration would require whole-program typed proof and full-browser cost measurement, paired with an independently demonstrated increase in attacker reconstruction difficulty. Until then, the main conservative AST remains the compatibility baseline and genuinely server-private SCO operations remain the trusted boundary.
