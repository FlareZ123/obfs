# Source-only native reconstruction of published Wasm APIs: bounded research control

**Date:** 2026-11-17. **Author:** Agent 28. **Classification:** Intermediate engineering and attacker evidence. **Execution status:** regression fixtures and independent attacker tools committed; new complete GitHub Actions executions are queued, and empirical cross-platform results remain unverified.

## Question and threat model

Can a static attacker holding only the compiler's delivered JavaScript, without the source program, compilation seed or compiler library, replace the opt-in COO/SNO Wasm-i32 output with ordinary native JavaScript that implements the selected public API? An executable native replacement gives stronger evidence than merely reading WebAssembly bytes or copying them.

The addressed adversary can inspect all emitted files, run an offline parser and use the public Wasm module data. This does not evaluate resistance of a trusted SCO service retaining private code, unrelated production tooling, or arbitrary WebAssembly programs.

## Implementation and reproduction

- [Multi-module and decoy-aware Wasm scanner](../sims/wasm-i32-static-recover.js) parses the *delivered* JavaScript with Acorn. It selects generated Module constructors nested in public Instance constructors, avoiding full-constructor text in comments, string literals, and unrelated executable Module constructors. It symbolically decodes supported i32 bytecode and cancels public constant masks and supported Boolean identities.
- [CommonJS offline rebuild](../sims/wasm-i32-native-rebuild.js) inspects a single unambiguous top-level \`module.exports={...}\` object, compiler-generated eager Wasm helpers, and direct forwarding wrappers. It prints native exported declarations using the recovered expressions and can execute without any WebAssembly global. Extra top-level initializers, function declarations, or side-effect statements cause a refusal.
- [ESM offline rebuild](../sims/wasm-i32-esm-native-rebuild.js) inspects directly exported pure functions and hoisted lazy Wasm helpers. It produces native exported declarations, refusing imports, extra top-level effects, nonforwarding wrappers, and unsupported exports. The generated module is intended as a replacement *only for the selected kernel* inside an otherwise copied public ESM graph.

The exact source checks are [multi-function decoys](../test/wasm-i32-multi-static-decoys.test.js), [CommonJS reconstruction](../test/wasm-i32-native-rebuild.test.js), and [three-file ESM application reconstruction](../test/wasm-i32-esm-native-rebuild.test.js). The manual targeted [Windows/Linux Node 22 and Ubuntu Chromium workflow](../.github/workflows/manual-wasm-i32.yml) includes these fixtures and strict JSDoc through [the Wasm research project configuration](../jsconfig.wasm-i32.json).

### Committed finite experiments awaiting pinned execution

1. The multi-function scanner test compiles two signed-Int32 kernels with 12 distinct seeds, checks native/compiler/seedless-decoded expression behavior with deterministic held-out inputs, and tests COO/SNO file emission. Comments forge the exact emitted constructor spelling; a separate fixture adds an unrelated executable Module constructor.
2. The CommonJS test compiles two exported functions for eight seeds and 256 pseudorandom three-number input tuples per seed, compares native, emitted and fully rebuilt code, and runs the rebuilt code under a global object without WebAssembly. It also exercises true unsigned \`>>>0\` return values. Selected COO and SNO compiler outputs receive separate direct native replacement checks.
3. The ESM test compiles a four-argument bitvector function and a second one-argument mask in \`kernel.mjs\`, while \`entry.mjs\` imports a separate bridge that calls \`globalThis.externalBridge.deliver\`. Four distinct seeds and 1,024 input tuples per seed compare three **complete application** runs each: native, emitted Wasm and offline native-rebuilt. The fixture checks complete return strings and all three observed host callback payloads for each input, not merely callback counts. Only the public emitted kernel is used to construct the replacement.
4. Both rebuilders contain negative controls for unsupported exports and additional top-level effects. A refusal is part of the explicitly bounded attack contract.

These are test designs, **not recorded passing test counts**. Do not treat their assertion values as measured evidence until a real pinned execution confirms them.

## Partial local verification

In a separate local Node 22 runtime, a minimal Acorn/Acorn-walk probe verified that AST ancestry distinguishes a compiler-shaped \`new Instance(new Module(...))\` from a standalone executable \`new Module(...)\` and from a full constructor spelling in comments. Strict TypeScript/JSDoc probes reproduced, diagnosed and repaired a local Acorn narrowing issue involving \`BinaryExpression.left\`. The new ESM and stricter CommonJS AST-reconstruction shapes passed locally isolated strict-JSDoc probes with representative source-only stubs. These checks do **not** establish the integrated compiler tests or a cross-platform pass.

Manual workflow attempts [44016559093](https://github.com/FlareZ123/obfs/actions/runs/44016559093) and [44016952739](https://github.com/FlareZ123/obfs/actions/runs/44016952739) were still queued as of the morning of 17 November and predate the complete native-rebuilder additions. A targeted run at an exact subsequent source SHA is required.

## Security, semantics and performance boundaries

The recovery algorithms intentionally know the *public compiler output shape* and its i32 instruction grammar. They do not automatically discover arbitrary ESM import closures, lazy getters, reflective APIs, higher-order functions, worker runtimes or arbitrary Wasm instruction sets. They do not recover original variable spelling beyond the public wrappers' own argument names. The original optimizer already requires caller-proven primitive signed-Int32 Number inputs; arbitrary objects, BigInt and function-source observation are outside this experiment.

Reconstructed kernels are native code, so successful whole-application checks would falsify strong static code-secrecy claims **only for these selected kernels and tested graphs**. COO/SNO attackers retain broader abilities to instrument or bypass local integrity checks regardless of this test. No new authorized-execution or anti-relay boundary is proposed.

The new experiments do not measure their own 2.5× lifetime performance. The existing [Wasm cold counterexample](wasm-i32-pipeline-2026-11-15.md) already documents workloads that exceed that ceiling. Until an exact pinned run completes, the new application and reconstructed code should remain research-only negative controls, not a deployable security claim.

## Next checks

Obtain an exact source SHA and green Linux/Windows + Chromium run for the complete tool and fixtures. Then report native versus emitted versus reconstructed whole-graph sizes, selected protected-work fraction, finite parity counts and separate cold/warm timing distributions. Challenge the extractor on hostile output containing valid unrelated Wasm and source-reflection observers; maintain false-positive negative controls rather than silently treating their bytes as recovered code.
