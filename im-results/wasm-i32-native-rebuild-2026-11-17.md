# Source-only native reconstruction of published Wasm APIs: bounded research control

**Date:** 2026-11-17. **Author:** Agent 28. **Classification:** Intermediate engineering and attacker evidence. **Execution status:** regression fixtures and independent attacker tools committed; new complete GitHub Actions executions are queued, and empirical cross-platform results remain unverified.

## Question and threat model

Can a static attacker holding only the compiler's delivered JavaScript, without the source program, compilation seed or compiler library, replace the opt-in COO/SNO Wasm-i32 output with ordinary native JavaScript that implements the selected public API? An executable native replacement gives stronger evidence than merely reading WebAssembly bytes or copying them.

The addressed adversary can inspect all emitted files, run an offline parser and use the public Wasm module data. This does not evaluate resistance of a trusted SCO service retaining private code, unrelated production tooling, or arbitrary WebAssembly programs.

## Implementation and reproduction

- [Multi-module and decoy-aware Wasm scanner](../sims/wasm-i32-static-recover.js) parses the *delivered* JavaScript with Acorn. It selects generated Module constructors nested in public Instance constructors, avoiding full-constructor text in comments, string literals, and unrelated executable Module constructors. It symbolically decodes supported i32 bytecode and cancels public constant masks and supported Boolean identities.
- [CommonJS offline rebuild](../sims/wasm-i32-native-rebuild.js) inspects a single unambiguous top-level \`module.exports={...}\` object, compiler-generated eager Wasm helpers, and direct forwarding wrappers. It prints native exported declarations using the recovered expressions and can execute without any WebAssembly global. Extra top-level initializers, function declarations, or side-effect statements cause a refusal.
- [ESM offline rebuild](../sims/wasm-i32-esm-native-rebuild.js) inspects directly exported pure functions and hoisted lazy Wasm helpers. It retains public static import declarations in their original order, produces native exported declarations, and refuses other unproved top-level effects, nonforwarding wrappers, and unsupported exports. The generated module is intended as a replacement *only for the selected kernel* inside an otherwise copied public ESM graph.

The exact source checks are [multi-function decoys](../test/wasm-i32-multi-static-decoys.test.js), [CommonJS reconstruction](../test/wasm-i32-native-rebuild.test.js), and [three-file ESM application reconstruction](../test/wasm-i32-esm-native-rebuild.test.js). The manual targeted [Windows/Linux Node 22 and Ubuntu Chromium workflow](../.github/workflows/manual-wasm-i32.yml) includes these fixtures and strict JSDoc through [the Wasm research project configuration](../jsconfig.wasm-i32.json).

### Committed finite experiments awaiting pinned execution

1. The multi-function scanner test compiles two signed-Int32 kernels with 12 distinct seeds, checks native/compiler/seedless-decoded expression behavior with deterministic held-out inputs, and tests COO/SNO file emission. Comments forge the exact emitted constructor spelling; a separate fixture adds an unrelated executable Module constructor.
2. The CommonJS test compiles two exported functions for eight seeds and 256 pseudorandom three-number input tuples per seed, compares native, emitted and fully rebuilt code, and runs the rebuilt code under a global object without WebAssembly. It also exercises true unsigned \`>>>0\` return values. Selected COO and SNO compiler outputs receive separate direct native replacement checks.
3. The ESM test compiles a four-argument bitvector function and a second one-argument mask in \`kernel.mjs\`, while \`entry.mjs\` imports a separate bridge that calls \`globalThis.externalBridge.deliver\`. Four distinct seeds and 1,024 input tuples per seed compare three **complete application** runs each: native, emitted Wasm and offline native-rebuilt. The fixture checks complete return strings and all three observed host callback payloads for each input, not merely callback counts. Only the public emitted kernel is used to construct the replacement.
4. A separate cyclic ESM fixture imports the public peer module and calls the exported function before its owner's body executes; the compiler and the native replacement are compared with the same early and late results. Static import declarations are copied verbatim in original order so their dependency effects are retained.
5. Both rebuilders contain negative controls for unsupported exports and additional top-level effects. A refusal is part of the explicitly bounded attack contract.

These are test designs, **not recorded passing test counts**. Do not treat their assertion values as measured evidence until a real pinned execution confirms them.

## Partial local verification

In a separate local Node 22 runtime, a minimal Acorn/Acorn-walk probe verified that AST ancestry distinguishes a compiler-shaped \`new Instance(new Module(...))\` from a standalone executable \`new Module(...)\` and from a full constructor spelling in comments. Strict TypeScript/JSDoc probes reproduced, diagnosed and repaired a local Acorn narrowing issue involving \`BinaryExpression.left\`. The new ESM and stricter CommonJS AST-reconstruction shapes passed locally isolated strict-JSDoc probes with representative source-only stubs. These checks do **not** establish the integrated compiler tests or a cross-platform pass.

Manual workflow attempts [44016559093](https://github.com/FlareZ123/obfs/actions/runs/44016559093) and [44016952739](https://github.com/FlareZ123/obfs/actions/runs/44016952739) were still queued as of the morning of 17 November and predate the complete native-rebuilder additions. A targeted run at an exact subsequent source SHA is required.

## First pinned cross-platform execution and later extensions

The initial multi-function fixture was actually run at exact commit [a4e0bbd70076a801234f2e531594d8e9adb01c9d](https://github.com/FlareZ123/obfs/commit/a4e0bbd70076a801234f2e531594d8e9adb01c9d) by [manual run 44016559093](https://github.com/FlareZ123/obfs/actions/runs/44016559093), using Node v22.23.4 on both Ubuntu and Windows. **Both operating systems passed all 48 behavior tests, zero failures**, including the new two-Wasm-module reconstruction with misleading comment. The regular project TypeScript project also passed. The workflow was nevertheless **red on both operating systems** because the *separate strict Wasm research JSDoc check* failed at test/wasm-i32-multi-static-decoys.test.js line 53: generic Uint8Array<ArrayBufferLike> was not assignable to the DOM BufferSource type. Commit be1b34179c1e75154b46eb0c192feeb0938a98e1 copies the input through Uint8Array.from before WebAssembly.validate; a local strict TypeScript probe confirmed that spelling compiles. The repair and all later native reconstruction work require a new pinned successful run.

That same initial run executed the existing standalone Wasm cold counterexample. It measured **one-call protected/native median ratios 17.03 on Ubuntu and 23.67 on Windows**, and **150,000-call ratios 2.20 on Ubuntu and 2.26 on Windows**. At 65,536 calls Ubuntu measured 2.37 and Windows 2.53, straddling the 2.5 budget. These figures describe that existing narrow microbenchmark and runner environment, not the new multi-file ESM graph. They reinforce that the Wasm backend cannot be treated as an unqualified COO runtime-budget win.

Later changes beyond this pin include a stricter exact AST proof of emitted Instance-to-export initializer shape, helper-body side-effect refusals, positive cyclic ESM import replay with early importer calls, a two-function ternary and signed-boundary application, and opt-in identifier-mangling variants. See the linked code and tests; all remain pending full pinned execution.

The [whole ESM application profile](../sims/wasm-i32-esm-rebuild-profile.js) now prepares an identical two-kernel three-file application with a real external callback bridge, then measures native, published Wasm and offline native-reconstructed distributions. It uses nine within-trial triplets with rotated execution order at 1, 50, 1,000 and 10,000 calls, compares complete output and callback digests, includes fresh ESM graph import time, and applies the independent one-sided paired median-ratio bound in [paired-budget-bound.js](../sims/paired-budget-bound.js). The profile intentionally excludes build/attack computation, filesystem materialization and Node process startup. **No results from this new profile have yet been recorded.** Report these timing-scope limits next to any eventual ratio.

## Cross-file source-observation red control and fixture repair

A separate **actual full Windows integration run** at SHA `9f2472244da4afab9d3bda7b39b2827bdbe66f30` reported the original three-file ESM reconstruction fixture failing before compilation with `Wasm i32 requires a module/CommonJS without cross-file source observation`. Agent 6 located the reason: the entry module concatenated an unconstrained `label` with `mask(a)`. In JavaScript, `label` could be a function, making its original/transformed `Function.prototype.toString` observable through implicit conversion. This is a correct conservative rejection, not a parser failure. The revised graph passes both typed kernels through a bitwise expression and forwards the label unchanged to the external bridge. The input harness documents `label:string`, and host-side callback conversion is outside the closed-world static proof. The repaired source must still pass a fresh pinned integration test before any success claim.

## Security, semantics and performance boundaries

The recovery algorithms intentionally know the *public compiler output shape* and its i32 instruction grammar. They do not automatically discover arbitrary ESM import closures, lazy getters, reflective APIs, higher-order functions, worker runtimes or arbitrary Wasm instruction sets. They do not recover original variable spelling beyond the public wrappers' own argument names. The original optimizer already requires caller-proven primitive signed-Int32 Number inputs; arbitrary objects, BigInt and function-source observation are outside this experiment.

Reconstructed kernels are native code, so successful whole-application checks would falsify strong static code-secrecy claims **only for these selected kernels and tested graphs**. COO/SNO attackers retain broader abilities to instrument or bypass local integrity checks regardless of this test. No new authorized-execution or anti-relay boundary is proposed.

The new experiments do not measure their own 2.5× lifetime performance. The existing [Wasm cold counterexample](wasm-i32-pipeline-2026-11-15.md) already documents workloads that exceed that ceiling. Until an exact pinned run completes, the new application and reconstructed code should remain research-only negative controls, not a deployable security claim.

## Next checks

Obtain an exact source SHA and green Linux/Windows + Chromium run for the complete tool and fixtures. Then report native versus emitted versus reconstructed whole-graph sizes, selected protected-work fraction, finite parity counts and separate cold/warm timing distributions. Challenge the extractor on hostile output containing valid unrelated Wasm and source-reflection observers; maintain false-positive negative controls rather than silently treating their bytes as recovered code.
