# Proposed source-exposure preflight for externally reachable JavaScript callables

**Author:** Agent 8  
**Date:** 22 November 2026 UTC  
**Status:** Design proposal for review; not an implementation or established result.

## Problem boundary

The compiler currently detects many explicit source observers inside the supplied source group. That does not establish that a public ESM export is source-private: an importer outside the supplied group can obtain the export and call `Function.prototype.toString.call(value)`. A callable may be reachable indirectly through an exported object/array, a private class instance, a getter, or a function return. The 22 November red-first tests demonstrate that ordinary execution can remain equal while source text changes.

The contract should be stated independently of mode. COO, SCO and SNO must preserve the same JavaScript-observable source contract unless a mode-specific API explicitly narrows it. `closedWorld:true` bounds the supplied module graph; it does not prove that public exports have no external consumers.

## Proposed preflight output

Build one immutable analysis result from the original, untransformed `prepared` files, before any cross-file or per-file rewrite:

```js
{
  exposedCallablesByFile: Map<path, Set<AstNode>>,
  exposedClassesByFile: Map<path, Set<AstNode>>,
  frozenBindingsByFile: Map<path, Set<BindingId>>,
  frozenPropertiesByFile: Map<path, Set<PropertyId>>,
  uncertainExportRootsByFile: Map<path, Set<AstNode>>
}
```

The concrete representation can evolve; the key requirement is that every pass consumes the same source-pinned exposure decision rather than independently guessing what is public.

## Reachability construction

1. Parse every supplied JavaScript file once and build module-local binding tables plus a supplied-module import/export graph. Include named/default exports, local export aliases, re-exports, `export *`, namespace exports, and static relative imports.
2. Seed a worklist with each exported value. Resolve unique local identifiers and immutable aliases before traversing values.
3. Traverse statically represented aggregates:
   - object property values, shorthand members, methods, getters and setters;
   - array elements;
   - default-exported object/array/class/function expressions;
   - class declarations/expressions and their methods, accessors, static fields and static blocks.
4. Resolve `new LocalClass()` when the constructor is a unique local class binding. An exported instance exposes its constructor and reachable methods through `instance.constructor`, prototype access, and direct member reads.
5. For exported functions and getters, inspect statically bounded return expressions. If a return value resolves to a local function, arrow, class, object or array, enqueue it. A returned inline function is already within the outer source range, but a returned identifier points to a separate source range and must be followed.
6. Resolve static member reads only when the base value and key are proven. For unresolved factories, dynamic mutation, computed exports, or opaque escapes, conservatively freeze the containing export root or all source-bearing declarations in that module. Do not claim a proof for a path that was not analyzed.

The worklist must be cycle-safe. Keep the provenance edge that explains why a callable is exposed (export alias, aggregate property, constructor instance, getter result, return value, or re-export), so failures are diagnosable.

## Source and dependency closure

For each exposed function/method, freeze its complete source range. An enclosing callable's source contains nested functions, so nested ranges must also be covered. A class constructor is itself a callable source value: `Class.toString()` exposes class source, while `instance.method.toString()` exposes method source. Treat class nodes as source-bearing values, not only their method functions.

Freezing a source range alone is insufficient. For each exposed callable, close over the dependencies that can be rewritten outside that range:

- lexical bindings referenced inside the callable (declaration and all references);
- own-property definitions and reads that correspond to member expressions inside the callable;
- imported aliases and property-name aliases that supply those dependencies;
- any outer source fragment whose rewrite changes the callable's source or execution.

For example, leaving `owner.secretField` inside an exposed function untouched while renaming the `secretField` initializer key outside it breaks behavior. Both the source read and its matching definition must be protected.

## Cross-pass contract

Compute the exposure result once, before `renameCrossFileProperties` and before per-file transformations. Pass it to all source-mutating passes:

- local and cross-file property renaming;
- identifier renaming;
- string encoding;
- symbol-key lowering;
- register/expression/native/branch/statement-flow/wasm/polyvariant backends;
- any later transform that changes source bytes or a function/class source span.

A pass must decline a candidate if its edits overlap an exposed source range or a frozen binding/property dependency. Whole-function backends must decline an exposed callable as a unit. This is stronger than checking only for an explicit in-module `.toString()` call.

The existing global `remoteSourceObserver` guard and explicit source-observer islands remain separate evidence. Public export exposure should not be silently conflated with a declared observer inside the supplied graph.

## Precision and positive yield

Conservative refusal is a valid correctness outcome for externally observable callables. It is not evidence of strong obfuscation. Measure yield separately:

- private direct-call-only function remains eligible;
- private class and instance that never escape remain eligible when no source observer can reach them;
- local property owner used only by a private reader can still be renamed;
- exported aggregate alias, exported instance, returned callable and getter-returned callable preserve exact source;
- unknown factory or dynamic mutation refuses rather than guessing.

Do not use a global “disable all class/function rewrites” rule as a substitute for reachability. It may pass the public tests while destroying private transformation yield. Record both source parity and rewrite counts.

## Acceptance matrix

Run one source-pinned gate across COO/SCO/SNO and Node/Chromium where applicable. Include:

1. direct named export and `export {local as alias}`;
2. default function/arrow alias;
3. exported object method and inline array function;
4. object/array member that references a separate local function identifier;
5. object member that references an alias chain;
6. method on a private class instance exported by `new Class()`;
7. function returned by an exported function;
8. function returned by an exported getter;
9. named re-export and barrel re-export;
10. exported class constructor source and class static field/static block source;
11. declared source-observer control that forces refusal;
12. genuinely private function/class/property controls that demonstrate positive rewrite yield.

For each public callable, compare exact source text and ordinary behavior using an importer absent from compiler inputs. Record per-case rewrite counts. Test property-only, identifier-only, string-only and selected-backend paths independently, then test the composed pipeline.

## Current evidence and limits

- Mainline aggregate witness: `test/esm-exported-callable-aggregate-reachability.test.js`, run [44984346437](https://github.com/FlareZ123/obfs/actions/runs/44984346437), 18/18 public callable source mismatches across modes on both OSes; 3/3 private-helper controls passed.
- Candidate cross-check: [run 44984544117](https://github.com/FlareZ123/obfs/actions/runs/44984544117), where Agent 48's direct-export matrix passed but the aggregate matrix still had 15/18 mismatches; private-class instance was refused by a broad class-ancestor veto.
- These are semantic compatibility results only. They do not demonstrate source secrecy, resistance to runtime extraction, tamper resistance, domain locking, or compliance with the 2.5× runtime budget.

## Preserve the proven primitive-leaf island exception

Do not translate the source-exposure graph into a blanket “freeze every exported callable” rule. The current `purePrimitiveLeafExports` envelope is intentionally narrower: immutable primitive own records, immediate primitive reads, and a zero-argument named function declaration whose body is exactly one return of an already-read primitive identifier. The permitted property rename occurs at module top level, outside the exported function's source span and outside any member access/captured property dependency inside that function.

An external importer can still call `Function.prototype.toString.call(unrelated)`; exact source remains equal while the primitive record key is genuinely renamed. This was reproduced in `test/source-observer-islands-external-callable-source.test.js` across COO/SCO/SNO on Ubuntu/Windows and on both the mainline and ESM candidate branches.

Keep this exception only while its grammar remains exact. The proof should continue rejecting parameters, nested callables, object/array/function-valued returns, getters, member-expression returns, arbitrary calls, and mutable/opaque record flows. Add a regression that simultaneously asserts:
- exact external callable source equality;
- ordinary result equality;
- at least one actual local property rewrite;
- no cross-file, identifier or string rewrite.

This gives a concrete source-safe positive-yield lane without weakening the general public-callable contract.
