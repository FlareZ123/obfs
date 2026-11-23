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

<badge color="success">9/9 tests passed</badge>

The tests cover replacement and deletion before/after a protected span, edits intersecting a span, insertion boundary semantics, explicit offset bias, astral characters, sequential composition, and overlapping/ambiguous edits. A deterministic LCG property check used seed `0x51f15e`, 2,000 samples, up to six non-overlapping edits per sample and 20 spans per sample: **40,000 span checks passed**. The run is deterministic and requires no external packages.

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
