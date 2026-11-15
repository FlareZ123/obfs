# Opt-in diversified Int32 WebAssembly backend: real pipeline and public binary attack

**Author:** Agent 28. **Date:** 2026-11-15. **Status:** intermediate engineering and adversarial evidence; no established confidentiality or generalized performance bound.

## Construction and generated example

The new `src/wasm-i32.js` exports `lowerWasmI32Functions`, a constrained opt-in compiler from one-argument, top-level, synchronous, return-only JavaScript bitvector functions to independently executable WebAssembly. It directly writes valid Wasm binary sections, without a native toolchain or Binaryen. It accepts signed i32 integer literals, plain parameter references, bitwise `~`, and binary `& | ^ << >> >>>`. Generated code instantiates an embedded Wasm module once and delegates through a named JavaScript function, preserving the JavaScript export shape. Seed-dependent constant XOR masks and up to two Boolean-expression substitutions diversify the Wasm body. The seed is public-build input, not a secret key.

The real generated CommonJS pair is [before.cjs](../examples/wasm-i32/before.cjs) and [after.cjs](../examples/wasm-i32/after.cjs); [build.cjs](../examples/wasm-i32/build.cjs) reproduces it byte-for-byte from seed `agent28-wasm-sample-v1` after LF-normalizing the checked-in fixture for Windows. The pinned generated script is 550 bytes and embeds a 100-byte Wasm module. The generated output uses native `new WebAssembly.Module`/`Instance` calls, and its public byte sequence is readily extractable by a source-only regular-expression parser.

The compiler is exported by `src/index.js`, integrated behind `experimentalWasmI32:{'relative/file.cjs':['functionName']}` in `src/core.js`, and exposed through `--wasm-i32 relative/file.cjs:functionName` in the COO/SNO CLI. It refuses classic script source, combined selected experimental backends for the same function, and the known cross-file source-observer guard. It does not modify the SCO CLI, where execution is server-controlled and private partitioning is the better trust boundary.

## Reproduction and exact-source validation

The exact-source [manual Windows/Linux/Chromium run 43743001056](https://github.com/FlareZ123/obfs/actions/runs/43743001056), source commit `3ec0a3a5f5ec18da0a786d240003a160fb86978b`, succeeded on both OSes under Node.js 22 and Chromium on Ubuntu. It ran four focused Node tests, the pinned generated-sample reconstruction, strict main-library JSDoc typechecks, and real Chromium ESM module import plus page-owned API invocation. The pinned suite compares 5 expression graphs across 24 build seeds each on 164 typed/stateful boundaries and pseudorandom signed-Int32 inputs, totaling **19,680 function result comparisons**. It also exercises ESM, the full SNO library pipeline, CLI parser option, negative/refusal cases, and public-binary executable cloning.

The pinned before/after check separately compares **4,001 signed-Int32 values** against the native source and independently instantiates an attacker clone from only the checked-in generated JS, with matching results on every tested value. The real Chromium page executes the transformed COO ESM module, preserving **4,097** signed-Int32 input results and the page-owned external callback. All these counts are finite observations, rather than general semantic proofs.

### Performance on the pinned workload

| Host | Native 150k-call hot-loop median | Obfuscated median | Ratio | Initialization / module evaluation |
|---|---:|---:|---:|---:|
| Ubuntu Node 22 | 0.936 ms | 1.932 ms | **2.064×** | 0.752 ms |
| Windows Node 22 | 0.787 ms | 1.514 ms | **1.923×** | 0.802 ms |

Real Chromium Ubuntu, one warmed 200k-call sample: native 1.800 ms, Wasm 2.400 ms, observed ratio **1.333×**. The browser measurement is single-order and noisy, so it is diagnostic. The Node benchmark alternates 17 trials after six warmup loops and records medians. All three observed hot ratios are under 2.5× for *this one kernel*. Initialization is reported separately; it must be included in end-to-end COO application cost, and an unused module can violate the budget by paying cold overhead without protected work. These timings do not establish a universal 2.5× guarantee.

The first [Windows run 43742735826](https://github.com/FlareZ123/obfs/actions/runs/43742735826) failed the pinned after-file verifier because Windows checkout CRLF altered a source-derived build seed; its four differential tests passed. Normalizing LF in the fixture verifier before recompilation fixed the reproducibility problem. The successful run and the exact source hash above supersede the earlier run.

## Independent threat dimensions

- **Static reconstruction:** the original JS function syntax is replaced by an embedded Wasm binary. A source-only adversary can extract the binary, reinstantiate its export directly, and inspect its numeric opcodes. The sample's executable function is cloned perfectly for all 4,001 tested values. Static reconstruction of the original source text is unresolved, but public binary copying is a complete functional extraction of this compiled function.
- **Dynamic tracing:** a hostile browser or Node owner can intercept WebAssembly module construction, inspect exports, and instrument the wrapper. The compiler does not attempt to defeat an adversary owning the runtime.
- **Tamper resistance:** no trusted signature, external attestation, or cryptographic integrity check is introduced. An attacker who can edit the output may modify the embedded bytes or replace the export.
- **Authorized execution:** no domain, URL, or trustworthy execution restriction is added; existing COO host checks and SNO launcher hashes have only their previously documented limited guarantees.
- **Behavioral compatibility:** the caller must prove the parameter is a primitive signed Int32 Number; `x ^ 1` on other JS inputs can differ from Wasm parameter conversion, and dynamically patched Wasm intrinsics or strict CSP may break the wrapper. External source observations, stack formatting, top-level cyclical ESM import calls, missing WebAssembly, and arbitrary JS input types are outside the proven contract. The grammar declines side effects, calls, property access, mutable closures, BigInt arithmetic, or general JavaScript operator coercions.
- **Performance:** selected steady-state hot work met 2.5× on the pinned Ubuntu, Windows, and Chromium samples, with unamortized initialization and other workloads unproved.

## Decision and next steps

Keep as an experimental, explicitly typed COO/SNO backend with checked-in generated output and public attacker proof. Avoid selling public Wasm binary lowering or seeded operand masks as encryption, authorization, or tamper protection. A natural next experiment is to compare this grammar's real-world typed call-site coverage and cold-loaded browser workload to direct native-register graphs, then evaluate source-only Wasm disassembly and JIT instrumentation with the same attack budget.

**Reproduce:** run the focused Node test, generated-example builder, strict JSDoc typechecker, and Chromium fixture in the [manual-only workflow](../.github/workflows/manual-wasm-i32.yml). All sampled measurements and success claims are tied to the exact pinned run above.
