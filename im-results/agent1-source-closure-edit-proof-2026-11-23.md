# Exact callable source and lexical closure edit constraint prototype

**Date:** 23 November 2026 UTC. **Author:** Agent 1. **Status:** intermediate; intentionally outside all production pipelines and security claims.

## Narrow question

When a function's own source is observed through `Function.prototype.toString`, is merely protecting its raw source interval sufficient to preserve lexical closure semantics under an otherwise opaque sequence of compiler edits? No: renaming an outer captured binding declaration while keeping the observed function text unchanged can break the preserved callable's reference. The source protection plan needs to guard the *captured outer lexical binding identity*, plus the selected callable's exact source interval. This is a source-local necessary constraint, not an overall JavaScript equivalence proof.

A concrete example:

```js
const secret = 40;
function observed() { return secret + 2; }
// Renaming only the external 'secret' declaration leaves observed.toString()
// unchanged but makes observed() throw or resolve a different binding.
```

The source is preserved only as JS UTF-16 source-text intervals, and all tests separately execute original/emitted code where appropriate.

## Implementation

- `workplace/agent1-source-closure-edit-proof.js`: JSDoc CommonJS module consuming the existing Acorn parser, edit validator and the newly validated read-only lexical resolver. Caller explicitly selects exactly one named `FunctionDeclaration`. Its `planObservedFunctionSource` returns a protected exact function source span plus declaration/reference identifier spans of each locally resolved binding used inside the function, including external closure captures. It declines if selected binding identity is ambiguous or any observed source identifier is not a proven local binding.
- `applyObservedFunctionEdits` is an experiment-specific **necessary gate**. It rejects edits that intersect protected spans, refuses prefix edits when preserving frame positions, and refuses all edits for whole-file bytes. It uses the repository's original UTF-16 range edit validator, reparses the result, maps original-to-emitted offsets, requires the exact callable source substring to survive, then re-resolves each observed identifier to its source-mapped declaration in the new AST. This detects a new outer shadow introduced outside the function while retaining the function's source bytes.
- `test/agent1-source-closure-edit-proof.test.js`: six Node tests for unchanged executable source under unrelated local renaming, protected external capture declaration, same-spelling sibling independence, adversarial insertion that changes a captured binding, frame/bytes effect-strength distinctions, refusal of unproven ambient roots, and a UTF-16 surrogate-prefix case.

**Deliberate limits:** The source-visible function must be identified explicitly; no automatic `toString` dispatch/observer detection, method/accessor parsing, cross-file import-binding correspondence, properties, function names/length inference, dynamic host/DOM dispatch, direct-eval semantic effects, global runtime changes, or arbitrary compiler equivalence are proved. The selected exact-source fragment is rechecked under a simple UTF-16 offset map; this does not authorize source-observed class methods, bound callables, Web IDL conversions, observed stack frames or arbitrary AST rewrites.

## CI and reproducibility

The two research files were included in `jsconfig.external.json` at source commit `4ea774a31a66d4c6873f50051f1567b0b0843007`.

- First [run 45242543769](https://github.com/FlareZ123/obfs/actions/runs/45242543769) passed the six runtime Node tests but failed strict JSDoc on both OS for an un-narrowed union `Resolution.bindingId` in the new proof; fixes `3cfc565d2fe3ba5319e24b8c3b47a6089b9d626f` and `76af16cba72fd0bb861b80385557b13844d55fa7` address both original and output binding branches. The second [run 45242788770](https://github.com/FlareZ123/obfs/actions/runs/45242788770) was still red for the original-binding callback union, then fixed.
- **Final source pin `76af16cba72fd0bb861b80385557b13844d55fa7`: [focused manual run 45243013528](https://github.com/FlareZ123/obfs/actions/runs/45243013528) passed on Ubuntu and Windows Node 22.23.4. Ubuntu reported six Node tests, six passes, zero failures; Windows focused job passed. The jobs also passed existing strict project/external/paired-budget TypeScript JSDoc gates. The full Node 22 job was skipped by focused-test mode. This is a focused source-local validation, not a complete application or browser CI gate.

## Integration boundary

The production obfuscator is unchanged. This candidate is a possible research building block for Agent 3's source-observer plan, whose canonical intake remains `workplace/agent3-source-observer-decoder-intake-2026-11-22.md` and **NO-GO**. A direct port would be unsafe without full source-observer receiver identity, callable metadata and actual Web IDL dispatch, all transformations consuming a protection manifest, and cross-file/cross-reparse binding correspondence. The repository's primary release remains **RELEASE-BLOCKED**.

Source-local exactness and lexical dependency preservation are valuable *necessary constraints*. They have not independently established tamper resistance, static/dynamic reconstruction resistance, environmental locking, or the universal 2.5× runtime bound.


## Subsequent source-map and ESM controls, final focused pin at 18:59 UTC

The earlier six-test receipt remains a valid, source-pinned historical result. Four additional Node test groups were added to `test/agent1-source-closure-edit-proof.test.js`, exercising:
1. An unrelated local rename *preceding* the observed function, including an earlier UTF-16 surrogate pair, which shifts the observed function's source offsets while the emitted exact source fragment and captured declaration links remain stable.
2. Rejecting zero-length insertions exactly at the start/end boundary of the observed function, rather than treating those as safe range-adjacent edits.
3. Executing a **real Node ESM module** loaded from a `data:text/javascript` URL before and after an unrelated local rename, verifying both value and exact native `Function.prototype.toString`.
4. Executing an ESM consumer importing a captured `secret` from a separately loaded **fixed provider** module, then verifying value and native function source after an unrelated consumer-local rename. This is a one-provider unchanged dependency control. It does not prove the multi-file property/interface graph is safe for coordinated obfuscation.

**Latest source pin:** `7257b78efbbd64f99047c4b5361084438ae4c834`, [focused GitHub Actions run 45243943915](https://github.com/FlareZ123/obfs/actions/runs/45243943915). Ubuntu **10/10 Node tests pass** and Windows focused job **pass**, strict project/external/budget JSDoc checks pass on both. Full main Node suite still skipped by focused-test mode. Previous [45243620856](https://github.com/FlareZ123/obfs/actions/runs/45243620856) also passed after the two prefix/boundary tests; [45243749812](https://github.com/FlareZ123/obfs/actions/runs/45243749812) passed after the real ESM module test.

**Interpretation unchanged:** a necessary source/lexical-dependency edit constraint for an explicitly selected observed function in narrowly modelled settings. No automatic observer identification, no independent provider mutation, no complete cross-file proof, no source-visible method/accessor semantics, and no main compiler integration.


## Explicit falsifiers for overclaiming source-local safety, source pin 19:02 UTC

Two deliberately **negative** controls were added, proving that accepted edits under this lexical/source constraint may still be semantically invalid. They are regression **passes** because the tests assert the documented non-guarantee:

1. **Property flow:** `const data={value:40};function observed(){return data.value+2;}`. The gate accepts changing `value` to `other` in the external object literal, because `data`'s lexical declaration and the function's exact source remain untouched. `observed.toString()` is still identical, while `observed()` changes from **42** to `NaN`. A complete obfuscator needs a proved property-alias/shape/reflective-use analysis; a captured lexical binding cannot certify properties reached through it.
2. **Provider graph:** An ESM consumer imports `secret` from a `data:` provider, and `function observed(){return secret+2;}` has its exact source and imported binding name preserved. The gate accepts a change to the import module specifier pointing to a second provider with `secret=1` instead of `secret=40`, so runtime value changes **42 → 3** with byte-identical `observed.toString()`. A lexical reference has preserved its import binding identity only *within the consumer*; the provider export and dependency graph are unproved.

Both are counterexamples to interpreting `applyObservedFunctionEdits` as a full JavaScript semantic-equivalence check. The function is explicitly scoped as a **necessary source/lexical constraint** only, so the candidate's documented contract is consistent with these counterexamples. The main compiler is unchanged.

**Pinned validation:** source `2790b042ad1f33b92349bf4f13b8e9812ebc82d7`, [GitHub Actions manual focused run 45244412163](https://github.com/FlareZ123/obfs/actions/runs/45244412163). Ubuntu **12/12 Node tests PASS**, Windows focused job **PASS**, strict project/external/budget JSDoc steps **PASS**. Full Node 22 job skipped by focused input. Two independently verified counterexamples and ten prior positive/boundary tests constitute the new scoped suite.

**Required next full-proof dependencies:** cross-file import/export graph and remote source authorization, interprocedural alias/property/reflective-use consistency, actual Web IDL method selection and coercion, callable metadata and stack-frame effects, persistent old-to-new source range correspondence across all enabled backends. None were established by this test.


## Post-catch-var-resolver integration control, 19:12 UTC

The experimental source-closure proof depends on the read-only lexical resolver, which was changed to conservatively handle simple catch-parameter/same-name-hoisted-`var` aliasing. A clean focused regression on the **updated main source** `0a163e140d15f42e671de77ab2b6d6b27425f459`, [run 45246077574](https://github.com/FlareZ123/obfs/actions/runs/45246077574), completed successfully on Ubuntu and Windows Node 22.23.4 with strict project/external/budget JSDoc passes. The full Node 22 job remained skipped by focused mode. This confirms the twelve source-closure controls remain green after the catch/var BindingId admission change. It does not broaden their semantic proof scope or change the production compiler.
