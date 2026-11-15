# Native-register expression graph: performance-driven revision and public-AST extraction

**Status:** intermediate reproducible engineering evidence, Agent 30, 15 November 2026. A bounded source-to-source transformation with a measured hot-path win after rejecting a slower implementation; no claim of a new trusted security boundary.

## Motivation and emitted program

The [expression VM](expression-vm-graph-2026-11-15.md) runs a JavaScript switch per binary operator and becomes expensive when invoked in a hot loop. The [native graph sample](../examples/native-graph/README.md) translates the same six-operation nested expression into a series of seeded named register assignments and XOR-masked compile-time numeric literals in the original function body. Native JavaScript binary operations preserve the language's ordinary , arithmetic, bitwise and coercion behavior without requiring number-only type assumptions.

The compiler is the explicit **backend: 'native'** option of [virtualizeExpressionGraphs](../src/expression-vm.js), exposed via **experimentalNativeGraph** on [obfuscateFiles](../src/core.js) and **--native-graph relative-file:functionName** on the COO/SNO CLI. It is disabled by default. The same strict grammar, source-observation refusal, and AST shape restrictions as the bytecode backend apply. A function cannot be simultaneously selected for both backends.

Its [before.cjs](../examples/native-graph/before.cjs), [after.cjs](../examples/native-graph/after.cjs) and [build-sample.cjs](../examples/native-graph/build-sample.cjs) are byte-identically verified inside the test suite against the live compiler. The published sample contains six native binary operations and eleven seeded register names. The original function name, arity and exported access remain unchanged.

## Empirical failure drove a compiler rewrite

The initial prototype inserted a separate native helper call from the original function. It was semantically correct in the restricted tests but **violated the 2.5x requirement** on a dense-loop workload of 250,000 calls per timed iteration. The [Ubuntu/Windows CI run 43739468178](https://github.com/FlareZ123/obfs/actions/runs/43739468178) measured median native-helper ratios of **17.873x Ubuntu and 24.918x Windows**; that run's 18 focused tests and typecheck passed. This is direct counterevidence to assuming that native operations guarantee fast execution when an extra cross-function call prevents the optimizer from recovering the baseline.

We replaced the helper with an *inline original-function body*, leaving the source-observable semantics caveat explicit. The [pinned CI run 43739846096](https://github.com/FlareZ123/obfs/actions/runs/43739846096) at **69156bf200e9af8c2444e7827f07cfe0796f595d** succeeded with 18 focused tests, strict JSDoc checks and generated-sample comparison on both operating systems. The same dense-call hot benchmark measured **1.003x on Ubuntu and 0.995x on Windows**, respectively. Each workload uses 250,000 integer calls per timing, seven warmup iterations and fifteen alternating-order samples, reporting the ratio of candidate and native medians. Different JS value types, call sites, JIT tiering, cold startup and browser cost could change the result. These two medians are a performance witness for a specific kernel, rather than a universal guarantee.

## Independent source-only attacker

[The attacker](../sims/native-graph-static-recover.js) uses the public Acorn parser and ordinary def-use traversal of the emitted function. It reads only the published JavaScript and rebuilds its original expression from public register assignments, including XOR-masked numeric literals. It does not import the compiler or possess its seed. The [attack suite](../test/native-graph-static-recovery.test.js) checks the generated sample and 32 independently seeded outputs in each of COO and SNO, through regular identifier/property/string transformations, with held-out semantic re-execution on multiple primitive inputs. All the checked cases were reconstructed.

The result is deliberately adversarial: a generic textual change of local identifier names and folded integer masks does not keep the operation tree confidential when the attacker can inspect every file. This also means the native backend has no demonstrated client-only integrity or authorized-host execution guarantee. In SNO, a filesystem-and-memory-owning attacker can rewrite both program and launcher. In SCO, only server-retained computations and secrets cross a real trust boundary.

## Compatibility and decision

[Native tests](../test/native-graph.test.js) cover 1,800 deterministic numeric inputs, exceptional primitives and coercion order, declines on unknown syntax and detected function-source readers, both programmatic modes, genuine COO ESM and SNO command-line output, plus the dense benchmark. These checks do not prove arbitrary JavaScript equivalence. Error stack frames, indirect source observation and arbitrary external consumers still require caution.

**Decision:** retain native inlining as an experimental, opt-in performance alternative to the interpreted VM. The simple measured hot workload fits the 2.5x budget after inlining. Retain its static reconstruction attacker because source confidentiality remains unproved and the tested program is recoverable. Future work should profile browser cold and hot workloads, increase independent program diversity, and avoid default selection without application-level budget evidence.
