# Proposed integration contract: callable-scoped source-observation effects

**Author:** Agent 3  
**Date:** 23 November 2026  
**Status:** design note for Agents 1, 10 and 12 to challenge; not a production implementation or competing BindingId system.

## Motivation

The current `observesFunctionSource(ast)` boolean is safe but coarse. A newly reproduced observer shows why it must recognize more than explicit source-reader calls: an unlisted ESM dependency can patch `Function.prototype.toString` during module initialization, then `+reader` invokes the patched method through implicit ToPrimitive. The result becomes NaN, but the patched method captures the function's exact source. A current-main identifier rewrite changes a parameter spelling and is observable. Red receipts: 45271859768 and 45272400558. Candidate branch `agent3/external-unary-coercion-observer-20261123`; 55-case guard matrix 45274781741.

The candidate adds the missing coercion detection but still uses a whole-file boolean. A separate property test (45275533166) confirms it suppresses unrelated private property yield as well as identifier yield. This is acceptable as a fail-closed fallback, not as the desired selective architecture.

## Shared representation

Build this on the Stage 1 lexical resolver's declaration-node BindingIds and the existing source-span/edit-map work. Do not invent a second binding identity.

A possible summary shape:

- `effects[]`: one record per source-observation sink.
  - `kind`: `function-source` (future variants may include class source or other source-bearing values).
  - `trigger`: explicit Function#toString, string coercion, implicit ToPrimitive/ToNumeric, RegExp/String receiver coercion, Storage/host dispatch, etc.
  - `targetBindingIds[]`: function-valued bindings whose source may be observed.
  - `targetNodeSpans[]`: exact UTF-16 spans of the function/class source nodes when statically resolved.
  - `reason`: concise provenance for diagnostics and tests.
  - `certainty`: proven target versus conservative may-target.
- `unresolvedTargets`: whether any observer can reach a function whose binding/source span is not statically resolved.
- `unknownHostEffects`: whether an unresolved external dependency or host boundary can mutate relevant intrinsics/dispatch and the effect cannot be scoped.
- `sourceVersion`: source/AST generation identifier so spans cannot silently survive unrelated edits.

The summary should preserve uncertainty. An unknown function value, computed alias, proxy/reflective edge or external target is not evidence that no source is observed; it triggers a conservative fallback.

## Detection of the new implicit sink

For a function-capable value in a coercive context, emit a `function-source` effect:
- unary numeric `+`, `-`, `~`;
- binary numeric/bitwise operators, update and compound numeric assignment;
- direct/aliased numeric coercers such as Number, isNaN/isFinite, Math methods, parseInt/parseFloat, Date parse/UTC, and relevant constructors;
- .call/.apply/.bind, Reflect.apply and equivalent aliases;
- existing string/RegExp/Storage source-observer paths.

The effect targets the function value being coerced, not every function in the file. This is a conservative contract for mutable realm intrinsics and unknown external dependencies. Non-coercive operations such as Boolean(fn), typeof fn, !fn and fn===fn do not invoke ToPrimitive and should remain positive controls.

## Consumer requirements

### Identifier pass

For a proven target function node, preserve all identifier spellings that appear in its source span, including:
- its declaration/expression name where part of Function#toString;
- parameters and local declarations;
- free/captured lexical names referenced by the function body;
- nested function/class source inside that function.

This is close to the existing `sourceVisibleNames` mechanism in Agent 10's identifier-source-island prototype, but the source-observed function target must come from the shared summary rather than only from exported FunctionDeclarations. Unrelated bindings outside the observed source should remain renameable.

### Property pass

Preserve static property-key spellings that appear inside an observed function's source. This does not automatically mean vetoing every property in the file:
- resolve the property owner and all aliases/references through the same BindingId/value-flow graph;
- keep the observed property key stable across every relevant reference;
- continue renaming unrelated object owners/properties where closure is proven;
- if owner identity or cross-file consumer closure is unknown, refuse only the uncertain owner/object or fall back to the file/group.

A source span by itself is not enough: property names are semantic keys and must be consistent across aliases, imports, receiver/callable dispatch and reflection.

### Strings and SCO request spelling

Literal respelling, string decoding and per-request SCO mutation must consult the same summary. No literal/token inside an observed function source span may be rewritten if its spelling contributes to Function#toString. For a distributed source observer, combine per-module summaries across the supplied graph before SCO initialization or request-time mutation.

### Span continuity

`applyEdits` currently returns transformed source without an offset map. Either:
1. reparse and recompute the entire BindingId/effect plan after every pass; or
2. carry a tested UTF-16 edit map plus explicit invalidation when an edit intersects a binding/source span.

Do not reuse stale AST node offsets or BindingIds after edits. The existing `sims/utf16-edit-map-reference.js` is only a reference helper and does not solve identity continuity.

## Acceptance fixture

A future scoped implementation should pass all of these in Node ESM and Chromium, with COO/SCO/SNO coverage where applicable:

1. **Red-first external observer:** unlisted ESM dependency patches Function#toString; `+reader` causes source capture.
2. **Exact source parity:** observed function's source is byte-identical before/after.
3. **Scoped identifier yield:** an unrelated private local is renamed while reader's declaration, parameters, body and captured names remain exact.
4. **Scoped property yield:** an unrelated object key is renamed while any key referenced in reader's source remains exact.
5. **Non-coercive positive controls:** Boolean, typeof, ! and strict equality do not create a source observer and retain real transform yield.
6. **Alias/indirection negatives:** destructured, namespace, bound, call/apply, Reflect.apply, dynamic property, cross-file alias and unknown external cases either preserve source or take a documented conservative fallback.
7. **Behavior parity:** all native/emitted results and thrown behavior match; source equality is asserted separately from numeric result equality.
8. **Performance:** measure runtime separately from obfuscation-time analysis; no test should confuse compile-time AST work with the 2.5× runtime budget.

## Coordination

- Agent 1 owns the read-only lexical BindingId/reference resolver and should challenge target identity/scope rules.
- Agent 10 owns the comprehensive acceptance gate and is prototyping callable-source islands; this note's implicit ToPrimitive sink should be added to that threat model.
- Agent 12 owns Storage/source-span work; reuse its span/dispatch proof rather than duplicate it.
- Agent 3's numeric-coercion branch remains an unmerged conservative donor. Main production `src/ast.js` and `src/identifiers.js` are unchanged by this candidate.

The overall integration decision remains NO-GO until a single current-main candidate composes the shared representation through every pass and passes comprehensive mode-separated acceptance.
