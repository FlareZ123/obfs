# UTF-16 edit-map reference prototype

**Date:** 23 November 2026  
**Status:** Intermediate research / reusable simulation, not production code.

## Question

The current compiler's shared `src/ast.js:62` `applyEdits` validates and applies edits but returns only the rewritten string. A future selective source-protection plan needs a way to carry protected source spans through sequential transformations without confusing UTF-16 code-unit offsets with Unicode code points.

## Prototype

- `sims/utf16-edit-map-reference.js` exports `applyEditsWithMap(source, edits)`.
- It validates in-range, non-overlapping edits and rejects ambiguous multiple edits at one source offset.
- Offsets and replacement lengths use JavaScript string `length` and `slice`, i.e. UTF-16 code units consistent with Acorn node offsets.
- `mapOffset` maps original offsets to output offsets. An offset strictly inside replaced source maps to `null`; zero-width insertions use explicit left/right boundary bias.
- `preservesSpan` and `mapSpan` operate on half-open spans. An edit inside a span invalidates it; insertions at the start/end boundaries are treated as outside the span, with start-right/end-left mapping.
- Maps compose across passes by mapping a span through each pass's returned map in sequence.

## Reproduction

Run:

```sh
node --test sims/utf16-edit-map-reference.test.js
```

Environment: Node.js v22.16.0.

<badge color="success">10/10 tests passed</badge>

The tests cover replacement and deletion before/after a protected span, edits intersecting a span, insertion boundary semantics, explicit offset bias, astral characters, sequential composition, no-op edits, and overlapping/ambiguous edits. The map filters exact no-op edits (including empty insertions) so they do not invalidate unchanged protected spans. A deterministic LCG property check used seed `0x51f15e`, 2,000 samples, up to six non-overlapping edits per sample and 20 spans per sample: **40,000 span checks passed**. The run is deterministic and requires no external packages.

The first focused run on the original nine-test version was [45237538184](https://github.com/FlareZ123/obfs/actions/runs/45237538184). After adding explicit no-op edit filtering and its regression test, the current ten-test version was rerun on main at source pin `4e248fb0f1d592c17d4b57ecc3ba8aa855828c7b` in [manual validation run 45239298079](https://github.com/FlareZ123/obfs/actions/runs/45239298079), using Node.js v22.23.4 on Ubuntu and Windows. Both focused jobs passed all 10 tests, strict project JSDoc, strict external JSDoc, and the paired-budget JSDoc check. The separate full `node22` job was skipped because the workflow was intentionally dispatched with a focused-test input; this is not a full repository gate.

## Limitations

This prototype proves only the offset-mapping helper's stated behavior. It does **not**:
- identify AST nodes or lexical `BindingId`s across reparses;
- compute source-observer effects, callable identity, or source-reachable closure;
- discover which declarations/properties must be protected outside an observed function span;
- ensure all compiler passes emit complete edit lists;
- integrate with `src/ast.js`, identifier/string/property transforms, VM/control-flow/Wasm/affine passes, or SCO request-time mutation;
- establish semantic equivalence, source parity, performance, or security.

A future candidate must either recompute the full binding/effect/protection plan after every pass or integrate a composable map into every affected transform. Mapping the outer function span alone is insufficient when free binding names or owner-property references outside that span must also remain unchanged.

## Disposition

Keep this as a reusable reference under `sims/`. It is a supporting primitive for the canonical source-observer/decoder no-go, **not** a compiler candidate and not a reason to reopen PR #299. The overall release decision remains **RELEASE-BLOCKED**.
