# Two-path, native polyvariant affine obfuscation

This directory contains a **real checked-in before-and-after pair** built by the production research compiler. The implementation is explicitly experimental and opt-in.

| Artifact | Purpose |
| --- | --- |
| [original.cjs](original.cjs) | Readable reference implementation with ten signed-int32-normalized addition/subtraction steps |
| [obfuscated.cjs](obfuscated.cjs) | Seeded, deterministic output containing two distinct native-JavaScript integer-path bodies |
| [build.js](build.js) | Exact-output verifier; the write option re-creates the generated output using locked atomic replacement |
| [compiler](../../src/affine-native.js) | lowerPolyvariantAffine backend with 2, 4 or 8 congruence classes |
| [attacker](../../sims/polyvariant-affine-static-recover.js) | Independent seedless Acorn-AST interpreter and function-recovery proof |
| [evaluation](../../sims/polyvariant-affine-benchmark.js) | Warmed, original-vs-transformed dense-call and mixed-work measurements |
| [tests](../../test/polyvariant-affine.test.js) | Differential inputs, ESM/COO/SNO integration and exact reconstruction |

The compiler requires a return-only one-parameter function whose expression is a left-associative series of at least eight literal byte-sized additions/subtractions, bounded to 64 steps, with input integer coercion at the beginning and at the end. Unproven syntax, dynamic scope, known function-source observers and overlapping experimental selections are declined.

At runtime the generated code first performs the original ToInt32 conversion **exactly once**. It dispatches the low 1, 2 or 3 bits to exactly one seed-shuffled case, reconstructs the corresponding input using native shifts and bitwise OR, and applies an independently seed-diversified affine encoding to that case's arithmetic. Each case is valid only for its own congruence class; there is no full-domain fallback. Native integer arithmetic avoids per-instruction VM dispatch. The selected class does introduce a switch, and generated source size scales with class count.

**Security boundary:** All case bodies, arithmetic constants, state labels and inverses ship to the runtime. The attacker can inspect them and feed the interpreter every admitted class. The included source-only reconstruction script executes no distributed program and still recovers a simpler equivalent signed-int32 function from the public output. Thus this candidate diversifies syntax and traces, but **does not establish confidentiality, strong tamper resistance, host enforcement or a hardness guarantee** under COO or SNO's full-control adversary.

The common API is require('./src').lowerPolyvariantAffine. The file/directory COO and SNO APIs also support experimentalPolyvariantAffine mapping from filenames to function names, with experimentalPolyvariantCount 2, 4 or 8. The CLIs accept --polyvariant-affine entry.cjs:guardedTotal --polyvariant-count 2. The SCO CLI deliberately rejects local experimental backends; trusted-server private partitioning is a different feature.

For independent execution from the repository root:

- node examples/polyvariant-affine/build.js verifies checked-in output byte-for-byte after cross-platform line-ending normalization.
- node --test test/polyvariant-affine.test.js runs differential checks.
- node sims/polyvariant-affine-static-recover.js runs the source-only negative security control.
- node sims/polyvariant-affine-benchmark.js measures per-workload protected-compute ratios.

No general 2.5× guarantee follows from a finite benchmark. Cold load, output size, JIT behavior, target application distribution and realistic complete-session cost must each be assessed before opting in.
