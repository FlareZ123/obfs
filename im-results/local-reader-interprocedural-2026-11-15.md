# Immutable local readers and nested identity flow: property-renaming coverage

**Researcher:** Agent 19. **Date:** 2026-11-15. **Status:** intermediate engineering result, not a security publication.

## Problem and implementation

The source compiler already proves ownership of literal-valued private objects through direct references and immutable local identity functions. A private object passed to an immutable arrow or function-expression helper such as `const read = value => value.secretField` previously lost its direct-call ownership proof because the helper was not classified as a read-only consumer. As a result, even fully visible calls of the form `read(root)` caused the compiler to decline safe private-property rewrites.

The updated `proveLocalObject` in [`src/properties.js`](../src/properties.js) admits only immutable, uniquely bound local helper functions with ordinary identifier parameters and a single return expression that directly reads a statically known property of one formal parameter. This covers concise and block arrow bodies, function expressions, computed string-literal keys and existing function-declaration readers. Readers are explicitly registered with no owner-return index. The preexisting alias-usage proof still checks each call's argument ownership, refuses helper escape, rejects dynamic property expressions and unknown owners, and verifies that every rewritten member reads a proven own property.

The same proof now admits nested direct calls such as `read(identity(root))` only if the inner identity expression is proven and the receiving formal is already a tracked owner alias. The `forwardedCalls` set records the proven owner-returning call expressions for a separate closed-world ESM verifier. The ESM pass in [`src/cross-properties.js`](../src/cross-properties.js) can use these expressions at imported read-only reader call sites. Its separately imposed source-graph closure, importer visibility, escape and ambiguous-call guards remain required.

These changes improve *which keys can safely be renamed*. They do not change the hash-like property-label scheme, add a cryptographic key, hide executable JavaScript from an adversarial client, or authorize execution.

## Executable before and after

[`examples/local-reader/before.cjs`](../examples/local-reader/before.cjs) contains an object with two literal private fields and two independent immutable readers. [`examples/local-reader/after.cjs`](../examples/local-reader/after.cjs) is the real checked-in compiler output. It replaces both keys and every proven member access with seeded `_p<10 hex digits>` labels, preserving observed output. [`build-sample.cjs`](../examples/local-reader/build-sample.cjs) recreates the output deterministically with `--check`. The sample disables unrelated string and variable renaming so the transformation can be inspected.

The [local differential and attack suite](../test/local-reader-helper.test.js) includes positive reader shapes, composition, both COO and SNO modes, and negative ambiguous-owner, dynamic-key, mutable-helper, exported-helper and source-introspection controls. The independent, seedless [offline normalizer](../sims/offline-normalize.js) is also exercised on transformed reader output: it replaces the two recognizable hash labels and executes the neutralized program with the original result. This is **negative evidence for source-only reverse-engineering resistance**, even though the original private key spellings are not recovered.

The [real-node ESM reader suite](../test/cross-file-reader-flow.test.js) runs native and transformed file graphs under Node's ESM loader, including imported readers and imported/local identity forwarding. These checks establish the tested graph behavior only. The broader meaning of `closedWorld:true` remains an integrator trust promise, and unlisted external consumers are not proven safe.

## Pinned Linux and Windows observations

The first cross-platform full validation for the base reader proof was [run 43725758586](https://github.com/FlareZ123/obfs/actions/runs/43725758586), exact code commit `dcef8c4c1935b619326e99679c916c8eaaab0e52`. Both matrix jobs passed their complete behavioral suite, JSDoc checkers, predefined runtime benchmark and Ubuntu headless Chromium. Prior runs at `f21f70f` and `989feaa` failed only new proof-coverage assertions with duplicate formal parameter spellings or an unsupported directly nested call. The duplicate binding cases were corrected by using globally unique formals, preserving the conservative proof. The nested-call failure led to an explicit new ownership check rather than broadening an unsafe fallback.

The subsequent [full run 43726043120](https://github.com/FlareZ123/obfs/actions/runs/43726043120), exact source `bda9f5ded933834095f56ccbd1f83c6faf30333c`, passed **842/843 tests with one skip on both Ubuntu and Windows**, both strict JSDoc checkers, sampled performance, and Chromium integration on Linux. Its additional isolated interprocedural-reader benchmark compiled a CJS numeric loop with two renamed own keys and timed the original and transformed `run(1_000_000)` after 15 equivalence probes and nine timed samples. Median runtime ratios were **1.002× Ubuntu** (0.82 ms each, rounded) and **1.026× Windows** (0.62 vs 0.63 ms, rounded). These pass the required 2.5× bound *for that workload*; they do not establish a universal performance guarantee.

The newer nested **cross-file** extension and five new positive/negative ESM graph cases passed the [full run 43726429542](https://github.com/FlareZ123/obfs/actions/runs/43726429542), exact commit `70ee8057e2b4aee5965d8321474ea0ee02d54007`. Both Node 22 matrix jobs completed **847/848 tests with one skip**, both strict JSDoc checks and performance samples; Ubuntu's live Chromium integration also passed. The hot local reader ratio was **0.999× on both Ubuntu and Windows** for that pinned run (rounded benchmark medians 0.63 ms/0.63 ms and 0.62 ms/0.62 ms respectively). This is compatibility and sampled runtime evidence for the cross-file extension, with no static security inference.

## Independent security dimensions

- **Static reconstruction:** The established seedless label-normalization adversary recognizes and neutralizes the current randomized field spellings. This work extends proof coverage, with no measured increase in reconstruction resistance.
- **Dynamic analysis:** Generated code still executes as ordinary JavaScript and can be inspected with the attacker's instrumented Node/browser runtime. No meaningful dynamic-extraction defense was introduced.
- **Integrity and unauthorized modification:** COO and SNO outputs carry no new trusted integrity authority. A full-control attacker can modify the delivered code. No change was made to the authenticated SCO server boundary.
- **Authorized environment:** Client-side hostname checks and server-only launcher hashes are unchanged. Execution authorization still depends on the architecture and external trust assumptions.
- **Compatibility and performance:** The proof retains conservative refusal on the tested negative classes and passes native behavior on admitted fixtures. The sampled hot benchmark fits the 2.5× constraint. Reflection, arbitrary host APIs, unlisted consumers and every possible JavaScript state remain outside a general proof.

## Next research

Extend held-out ESM object-identity graphs to quantify added eligible-property coverage, then run an independent source-only label normalizer on that exact held-out output. Add alternate property-key and reflection probes before widening the proof grammar beyond plain, statically named reads. Compare with the separate TypeScript-checker compiler on the same graphs. For SCO, useful adversarial progress still depends on withholding genuinely private source/entropy and measuring attacker functional reconstruction under unlimited authorized queries.
