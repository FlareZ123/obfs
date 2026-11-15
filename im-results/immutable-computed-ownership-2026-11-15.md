# Immutable computed ownership across local and ESM graphs (2026-11-15)

**Agent 1, intermediate compiler evidence.** The implementation is a bounded additional property-renaming proof rather than a novel confidentiality boundary. The pinned code for the generated ESM sample and semantic gate is [`000c6ca6`](https://github.com/FlareZ123/obfs/commit/000c6ca6ed46e8ffb92ff66020c52251e020b891), validated by [manual CI run 43771008894](https://github.com/FlareZ123/obfs/actions/runs/43771008894) on Ubuntu and Windows. The source-level method and exact emitted artifacts are in the linked repo paths below. Broader fuzz evidence is tracked separately if/when a pinned run succeeds.

## Problem and soundness boundary

Prior to this change, the conservative `proveLocalObject` rejected any `owner[key]` where `key` was an Identifier, even for `const key='field'`. This disabled all private-own-field renaming for that owner and restricted obfuscation coverage. The object may be captured in aliases, functions and modules, and an identically spelled key may have an external contract elsewhere.

The new local proof in [`src/properties.js`](../src/properties.js) resolves `const` string-valued key expressions only when the key binding is unique and its initializer is earlier than the candidate private owner's own initializer in the **same sequential lexical Program or BlockStatement**. A SwitchStatement cannot be treated as sequential because a case jump can skip the key's initialization; unknown or mutable keys, disparate lexical scopes, and owner-first order remain refused. This constraint ensures the key has initialized whenever the proven owner can be reached. It does not assume all computed accesses are safe.

The `proveLocalObject` return now carries a `memberNames` map keyed by AST member nodes. [`src/properties.js`](../src/properties.js), [`src/cross-properties.js`](../src/cross-properties.js), and [`src/symbol-properties.js`](../src/symbol-properties.js) consume the same proven names when checking own-field coverage and emitting replacement edits. The exact computed expression, such as `owner[key]`, becomes `owner["_p..."]` while unrelated `globalThis[key]` remains unchanged.

For closed-world ESM, [`src/cross-properties.js`](../src/cross-properties.js) separately summarizes direct, unique, named string-valued `export const` bindings, maps corresponding imports, and admits a computed key only if the key export is initialized **before** its associated own-literal `export const owner`. Since an imported owner binding is unavailable before initialization, its preceding immutable key must be initialized whenever the owner can be accessed, including through ESM cycles. Imports from unrelated modules and owner-first/key-later cases remain refused. This is a specialized intermodule proof, not arbitrary cross-module dataflow analysis.

[`src/ast.js`](../src/ast.js) accepts an optional provenance-verified imported-string map in its `observesFunctionSource` guard. Without it, any imported binding could be a function and `bag[key]` would conservatively count as a potentially source-observing computed `toString` key. The graph verifier now identifies known literal imports, retaining the refusal for actual `toString`, `stack`, unknown functions, dynamic keys and opaque computation. The AST observation cache is bypassed when a provenance map is supplied so opaque and verified interpretations cannot share a stale result.

## Reproducible native compiler artifacts

- [Single-file original](../examples/owned-constant-key/before.cjs), [real emitted SNO output](../examples/owned-constant-key/after.cjs), [byte-identity builder](../examples/owned-constant-key/build-sample.cjs), and [explanatory README](../examples/owned-constant-key/README.md).
- [Two-file COO original](../examples/imported-constant-key/before), [real emitted ESM output](../examples/imported-constant-key/after), [byte-identity builder](../examples/imported-constant-key/build-sample.cjs), and [explanatory README](../examples/imported-constant-key/README.md).

The ESM artifact transforms two private owned keys across module boundaries, keeps exported binding names and relative module imports, and preserves the original global property accessed through the same imported string. Both snapshots have explicit LF Git attributes for byte-stable source-offset-derived identifiers across Windows and Linux.

## Behavior and refusal evidence

[`test/owned-constant-computed-key.test.js`](../test/owned-constant-computed-key.test.js) covers local positive, owner-first/TDZ, mutable/unknown computed keys, reflection, source observers, SwitchStatement case skipping, opt-in Symbol integration and multi-file ESM. [`test/imported-constant-computed-key.test.js`](../test/imported-constant-computed-key.test.js) covers imported aliases, const-string expressions, intermodule identity forwarding, unrelated import origins, reflection, mutable keys, function-source `toString`, Error `stack` and opaque function keys, using real child Node ESM processes.

[`test/owned-constant-key-sample.test.js`](../test/owned-constant-key-sample.test.js) and [`test/imported-constant-key-sample.test.js`](../test/imported-constant-key-sample.test.js) require exact emitted bytes, native semantic equivalence and `neutralizeHashedNames` recovery. [`sims/imported-constant-key-fuzz.js`](../sims/imported-constant-key-fuzz.js) is a deterministic seed `0x153f04a9` fixture generator for 32 cross-module positive/negative scenarios, with native Node process execution and seedless normalization. Its dedicated CI status should be cited separately before claiming success.

The [manual 43771008894 run](https://github.com/FlareZ123/obfs/actions/runs/43771008894) passed its Windows and Ubuntu gates at the cited SHA. Earlier [43769893851](https://github.com/FlareZ123/obfs/actions/runs/43769893851) failed all six new imported-key positives because the owner proof conservatively marked all imported keys opaque; [43770491216](https://github.com/FlareZ123/obfs/actions/runs/43770491216) showed imported-key source recognition working but `proveLocalObject` still called its own unqualified global observer check. The later proof passes the verified imported-string facts through that guard, and the succeeding run validates the correction. Failed development runs are deliberately preserved as evidence.

## Performance and adversarial evidence

[`sims/owned-constant-key-profile.js`](../sims/owned-constant-key-profile.js) makes 1,200,000 calls per warm measurement, with eight warmups and 12 alternating comparisons, comparing the exact SNO before/after sample.

| CI OS | Native median ms | Emitted median ms | Ratio |
| --- | ---: | ---: | ---: |
| Ubuntu Node 22 | 6.3523565 | 6.3437765 | 0.99865× |
| Windows Node 22 | 6.3985000 | 6.3884000 | 0.99842× |

These are small JIT-optimized hot samples, susceptible to host/JIT variance. They establish no universal worst-case 2.5× bound or browser performance claim. For the tested samples, static source-only [`neutralizeHashedNames`](../sims/offline-normalize.js) converts both owned hash labels to sequential names without knowing the seed or original source, and the reconstructed program executes identically. The compiler changes source spellings but does not hide native value/control flow from a full-control attacker or introduce integrity, authorization or anti-debugging primitives.

## Scope and next questions

The exact 1:1 semantic contract is tested within the enumerated fixtures and real Node module executions. It remains unproven for arbitrary JavaScript, true browser global/DOM host APIs, reflective techniques beyond the guarded subset, sophisticated runtime instrumentation, or multi-environment performance. Additional coverage should use real browser ESM/Web APIs, adversarial cyclic imports and native error-string fixtures. Upstream [`results/README.md`](../results/README.md) should retain established findings only; these compiler and attack observations belong in `im-results/` until independently reproduced and generalized.
