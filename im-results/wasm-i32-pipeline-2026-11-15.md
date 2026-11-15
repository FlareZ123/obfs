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

## Seedless static expression recovery (later extension)

An independent attacker `sims/wasm-i32-static-recover.js` consumes **only the
delivered JavaScript and public embedded WebAssembly bytes**. It implements
separate Wasm binary-section and signed/unsigned LEB128 parsing, symbolically
interprets the exported i32 stack program, folds constant XOR masks,
recognizes repeated pure-operand Boolean identities, and reconstructs a
native JavaScript expression without importing compiler implementation
code, the original source, or the build seed.

`test/wasm-i32-static-recovery.test.js` exercised all **120/120 generated
expressions** across five independent source graphs and 24 independent seeds
each. The recovered native expression ASTs were structurally identical
to the canonical original arithmetic/bitvector trees; every one also matched
the original and the transformed program on 256 fresh signed-Int32 inputs
(**30,720** comparisons). The attack additionally rejects an unrelated
script and malformed public Wasm arrays. This is a **strong negative static
resistance result for the tested grammar**, beyond the earlier executable
binary clone. It does not recover arbitrary WebAssembly programs or all
possible future lowering strategies. The focused manual Windows/Linux
run [43743685816](https://github.com/FlareZ123/obfs/actions/runs/43743685816)
passed the expanded attack and real Chromium fixture at source commit
`a08c5a8e9064cdb10e0ffc9d95a82571d39ba6ab`.

## Independent threat dimensions

- **Static reconstruction:** the original JS function syntax is replaced by an embedded Wasm binary. A source-only adversary can extract the binary, reinstantiate its export directly, and inspect its numeric opcodes. The sample's executable function is cloned perfectly for all 4,001 tested values. An independent source-only stack interpreter also reconstructed all 120 tested original bitvector ASTs across diversified builds. Binary copying alone is already a complete functional extraction of the compiled function.
- **Dynamic tracing:** a hostile Node owner intercepted WebAssembly module construction and cloned the exported function. The same harness substituted its own instance export, changing output 3970 to 7331 without changing delivered JS. It cannot defeat an adversary owning the runtime.
- **Tamper resistance:** no trusted signature, external attestation, or cryptographic integrity check is introduced. A hostile runtime replaced the exported function without editing any published source, proving an integrity bypass under the stated model.
- **Authorized execution:** no domain, URL, or trustworthy execution restriction is added; existing COO host checks and SNO launcher hashes have only their previously documented limited guarantees.
- **Behavioral compatibility:** the caller must prove the parameter is a primitive signed Int32 Number; `x ^ 1` on other JS inputs can differ from Wasm parameter conversion, and dynamically patched Wasm intrinsics or strict CSP may break the wrapper. External source observations, stack formatting, missing WebAssembly, and arbitrary JS input types are outside the proven contract. A two-module cyclic ESM graph is now covered by an explicit hoisted-initializer regression, with broader ESM linking and runtime environments unproved. The grammar declines side effects, calls, property access, mutable closures, BigInt arithmetic, or general JavaScript operator coercions.
- **Performance:** selected steady-state hot work met 2.5× on the pinned Ubuntu, Windows, and Chromium samples, with unamortized initialization and other workloads unproved. A separate pinned whole-session counterexample above exceeds 2.5× for many small invocation counts.

## Pinned cold-to-hot crossover: budget counterexample

An additional self-contained experiment [sims/wasm-i32-cold-counterexample.js](../sims/wasm-i32-cold-counterexample.js) initializes a fresh CommonJS-style module and immediately invokes its protected function a selected number of times. The JavaScript wrappers are precompiled outside the timed interval, so the experiment isolates module execution/initialization plus signed-Int32 computations; it is a bounded startup-cost experiment rather than a full browser download/parse workload. It alternates 101 paired measurements for each call count after 20 correctness-checked warmups.

The [green Windows/Linux run 43744533933](https://github.com/FlareZ123/obfs/actions/runs/43744533933), pinned to commit `e76b1fd1e34a69df442f9bfe99ee4f0a0cd7879a`, measured:

| Calls in one module lifetime | Ubuntu total ratio | Windows total ratio | Within 2.5× on both? |
|---:|---:|---:|:---:|
| 1 | 15.691× | 30.000× | No |
| 16 | 6.064× | 11.750× | No |
| 1,024 | 14.059× | 21.848× | No |
| 8,192 | 3.617× | 4.905× | No |
| 65,536 | 2.156× | 2.608× | No |
| 150,000 | 2.007× | 2.347× | Yes |

These readings include initialization and reveal a concrete failure of the 2.5× budget for short-lived COO use; ratios for tiny microsecond-scale originals are sensitive to host clock resolution, JIT tiering and local CPU state, so the experiment is a counterexample rather than a portable threshold guarantee. On the Windows runner, 65,536 calls still exceeded 2.5×. An automatic compile-time decision based only on AST size cannot guarantee an application-level runtime ratio.

### Cyclic ESM module initialization

A separate agent found and repaired a genuine cyclic-import compatibility bug. The old ESM wrapper called an eager generated top-level const, which could still be in TDZ when a cyclic importer calls the hoisted exported function. Agent 23's [two-module witness and repair](wasm-i32-esm-cycle-2026-11-15.md) replaces the ESM const with a hoisted, self-replacing function initializer. Early calls compile on demand, and later calls use the cached Wasm export. CommonJS retains eager initialization and the pinned before/after file remains unchanged. Agent 23's real native Node cyclic-import fixture was included in [the green run 43744533933](https://github.com/FlareZ123/obfs/actions/runs/43744533933) alongside the source-only reconstruction attacker, strict JSDoc checks, and real Chromium ESM host API. As usual, the ESM first-call compilation cost remains part of the COO budget.

## Hostile runtime interception and real-browser CSP compatibility

The independent [hostile-runtime harness](../sims/wasm-i32-runtime-extraction.js) does not patch the distributed source text. It executes the generated COO and SNO CommonJS outputs under a replacement `globalThis.WebAssembly.Module` constructor, captures the bytes supplied to the legitimate Wasm compiler, and separately reinstantiates the captured export. Both generated modes returned the original value **3970** on the selected probe. A second hostile runtime supplies a replacement `WebAssembly.Instance` object whose export returns **7331**, and both generated outputs compute that attacker-selected result. This is a concrete dynamic extraction/integrity-bypass witness under the prompt's full-runtime-control threat model. It does not rely on the original source, private compile seed, or rewriting the delivered JS.

The [real-browser CSP fixture](../test/wasm-i32-csp-browser.js) serves the *same* generated COO ESM module under two policies in Chromium. With `Content-Security-Policy: script-src 'self'; object-src 'none'`, the native ESM module runs normally and the Wasm backend fails on the first call with **CompileError**. With the targeted `script-src 'self' 'wasm-unsafe-eval'` allowance, the transformed module executes and matches native result **3970**. These observations agree with [MDN's CSP specification notes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src): WebAssembly compilation is blocked by restrictive `script-src` without a corresponding allowance. The selected browser fixture also confirms that ESM's hoisted lazy helper delays compilation until invocation.

All four independent dimensions, including 120/120 seedless static AST reconstruction, the hostile-runtime export replacement, cold-start budget profile, and Chromium CSP behavior, passed on the [green cross-platform run 43745924597](https://github.com/FlareZ123/obfs/actions/runs/43745924597), pinned to commit `12d921c77a1e5485d1250e68ee33c72654b64218`. The small terminal experiment output shows public module byte lengths of 100 and 83 depending on seed.

## Decision and next steps

Keep as an experimental, explicitly typed COO/SNO backend with checked-in generated output and public attacker proof. Avoid selling public Wasm binary lowering or seeded operand masks as encryption, authorization, or tamper protection. A natural next experiment is to compare this grammar's real-world typed call-site coverage and cold-loaded browser workload to direct native-register graphs, then evaluate source-only Wasm disassembly and JIT instrumentation with the same attack budget.

**Reproduce:** run the focused Node test, generated-example builder, strict JSDoc typechecker, and Chromium fixture in the [manual-only workflow](../.github/workflows/manual-wasm-i32.yml). All sampled measurements and success claims are tied to the exact pinned run above.
