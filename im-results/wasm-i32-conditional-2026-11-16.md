# Pure conditional bitvector lowering to WebAssembly select

**Status:** Intermediate compiler and attacker evidence, Agent 38, 2026-11-16. **Exact source:** `bd56ff6457017400761b74d74af1e28ff05a96fb`. **Validated:** [green Linux/Windows + Chromium workflow 43805231388](https://github.com/FlareZ123/obfs/actions/runs/43805231388), Node 22.23.4. Source locations: [real generated example](../examples/wasm-i32-conditional/README.md), [compiler](../src/wasm-i32.js), [independent seedless attacker](../sims/wasm-i32-static-recover.js).

## Compiler extension and semantic boundary

The opt-in i32 WebAssembly lowering now recognizes pure conditional expression trees (`ConditionalExpression` AST) with nested ternaries over one through four primitive signed-Int32 Number parameters. It compiles them to WebAssembly i32 `select` (opcode 0x1b): push true branch, false branch, condition. Wasm select evaluates both candidate branches; under the admitted grammar, operands consist only of pure i32 bitvector operations and primitive variables, so both branches evaluate without user-observable side effects or exceptions. Conditions preserve typed Int32 zero/nonzero truthiness.

**Signedness proof:** JavaScript `>>>` produces an unsigned Number, while i32 Wasm exports a signed Int32 Number. A root expression whose two terminal branches both produce unsigned representations gets the existing `>>>0` wrapper. Mixed signed/unsigned terminal branches are refused. A mixed conditional nested inside a later bitwise operator may be accepted because the containing operator applies ToInt32. Dynamic calls, getters, unsupported arithmetic, nonprimitive effects, and ambiguous branch results remain declined. The depth bound remains 16. This is a limited typed-grammar contract, not arbitrary JavaScript equivalence.

## Actual emitted artifact and evidence

`examples/wasm-i32-conditional/before.cjs` is a four-argument native conditional kernel and `after.cjs` is the compiler's emitted **439-byte** JS wrapper embedding **70 bytes** of Wasm. Seed: `agent38-wasm-select-sample-v1`. `node examples/wasm-i32-conditional/build.cjs` verifies exact byte equality, **20,000** native / compiled / reconstructed typed-input matches, and reports a warm profile. Native SHA-256 `e3ae847084e601d931a1e069eddde8e0ce8918571404c26a97cef8e924244b4d`; emitted SHA-256 `48d93df7d82bbcb444d059d37e838eb4ad3f874ebaa3b6f43139007e77a434c0`.

The independent public-source attacker parses the Wasm `select` opcode into condition/true/false AST nodes using no compiler internals or original sources. Across **84 seeded programs**, seven conditional structures × 12 seeds, it recovered the **exact normalized original AST expression** in **84/84** cases. Its reconstructed native JS and public binary clone matched **10,752** typed native results. Eight unsafe/mixed-signedness signature/grammar examples declined unchanged. Separate COO ESM and SNO CommonJS pipelines matched another 512 deterministic calls each. The focused gate passed **19/19 Node tests on both Ubuntu and Windows**, both strict JSDoc suites, the pinned sample, existing runtime tamper and cold counterexamples, plus the original multi-parameter Chromium ESM and CSP fixtures.

## Runtime cost, separate from security

The reproducible conditional sample measures 13 alternating warm trials of a 200,000-call bitvector loop:

| System | Native median (ms) | Emitted median (ms) | Hot ratio |
|---|---:|---:|---:|
| Ubuntu Node 22 | 1.369911 | 2.431767 | **1.775×** |
| Windows Node 22 | 1.649300 | 2.935300 | **1.780×** |

This satisfies 2.5× **for that sample only**. Module compilation/instantiation and real application load are excluded and remain chargeable in COO. Because `select` computes both branches, a highly asymmetric source conditional could exceed 2.5× even when hot. Existing single-parameter cold-to-hot counterexamples exceed the threshold for many short lifetimes. The Chromium fixture confirms other multi-input ESM behavior but is not a benchmark of this conditional sample.

## Threat-model verdict

- **Static deobfuscation:** Entire emitted syntax tree recovered, 84/84, with only public bytes. No demonstrated reconstruction-resistance gain.
- **Dynamic extraction and modification:** Wasm bytes can be cloned and instrumentation can replace exports, as existing attacker tests show. No integrity guarantee.
- **Environment locking:** Unchanged. Host or URL enforcement requires a separate trusted boundary to withstand a controlled client.
- **Native compatibility:** Finite positive typed-gate checks pass, and unsafe/mixed result forms decline.
- **Performance:** Pinned hot kernel under 2.5×; no general cold or whole-application bound.

**Decision:** Keep opt-in as a compiler feature and independent attacker canary. Do not promote it as an established security discovery. For reproducibility inspect `.github/workflows/manual-wasm-i32.yml`, `test/wasm-i32-conditional.test.js`, `examples/wasm-i32-conditional/build.cjs`, and [green run 43805231388](https://github.com/FlareZ123/obfs/actions/runs/43805231388).
