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
