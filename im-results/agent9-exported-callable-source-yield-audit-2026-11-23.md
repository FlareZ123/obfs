# Agent 9: exported-callable source and opaque-export fallback audit

**Date:** 2026-11-23  
**Status:** Intermediate compiler-correctness evidence. No production code changed by this audit. The project remains **RELEASE-BLOCKED**.

## Immutable validation comparison

The draft PR #357 branch agent9-private-yield-gate-diagnostic-20261123 has two source-pinned full-validation runs:

- [45274234781](https://github.com/FlareZ123/obfs/actions/runs/45274234781), commit aa6704530d02653344de74521f8fde3b4dcbe28a: **17 failing tests on Ubuntu and 17 on Windows**.
- [45275406172](https://github.com/FlareZ123/obfs/actions/runs/45275406172), commit d2a282f4cd729da237407063df9f553002191e0c: **24 failing tests on Ubuntu and 24 on Windows**.

The second run adds exactly seven failures. The change between these source pins includes commit e5deb69c89bbb01487850e6b00c02cf43aa157bd, whose only changed file is src/identifiers.js (+32 lines). It adds a file-wide fallback:

- detect any export syntax;
- detect any assignment not itself a CommonJS export target, update expression, non-const variable declaration, object spread, or Object.assign call;
- if both categories occur anywhere in the file, return the original source with zero identifier bindings.

The fallback does not establish that the mutation can affect an exported value or callable.

## Seven incremental failures attributable to the broad fallback

The new failures in 45275406172, absent from the 17-case inventory in 45274234781, are:

1. COO: shorthand __proto__ own-data-property writable semantics.
2. SNO: the same shorthand __proto__ semantics.
3. SCO: the same shorthand __proto__ semantics.
4. Object spread needs no iteration and preserves safe identifier renaming.
5. Explicitly named function assigned later permits binding mangling.
6. Storage conversion control: ownToString.
7. Storage conversion control: prototypeOverride.

The source shapes explain why the global fallback is overbroad:

- The three __proto__ cases export the result of calling a local function, not a callable. An unrelated local assignment to state.__proto__ trips the fallback.
- The object-spread case exports copy.entry, while the spread only copies an ordinary local object.
- The later-assigned named-function case exports action.name (a string); the let and assignment do not create an exported callable.
- The two Storage controls export a public sample function but exercise private local functions and storage-hook state. Their unrelated mutation/spread operations do not make those private functions exported.

These are real lost transformations, not source-preservation requirements for a publicly exposed function. The broad fallback should not be integrated as written.

## Four distinct positive-yield fixture conflicts

Four failures were already present in the 17-case predecessor:

- JSON.parse/rawJSON with primitive input;
- Reflect.construct with primitive arguments;
- Web IDL Reflect.construct with primitive arguments;
- RegExp flags with primitive arguments.

In each fixture, the test's assertion that observesFunctionSource(parse(source)) === false passes. The later assertion that emitted code must differ fails because the only rename candidate is a parameter inside a directly exported function (module.exports = active or module.exports = privateLogic). The direct-export source guard deliberately marks that function as public and skips every candidate identifier within its source span. That behavior is consistent with the intended native Function#toString contract; it is not a false positive from the primitive-observer classifier.

A better positive-yield fixture adds an independent private binding outside the exported callable, for example a top-level const sentinel used by a harmless expression. It should assert that this sentinel is renamed while the exported callable's exact native source remains equal before and after compilation. Do not weaken the public-callable source guard merely to satisfy the old whole-file-diff assertion.

## Preserve the opaque-export negative controls

The branch's test/agent9-opaque-export-source-diagnostic.test.js is valuable and should remain a required negative control. It covers four actual source-bearing export flows:

- mutable top-level alias reassignment;
- mutation of a data property on an exported object;
- spreading an object that carries a callable into the export;
- Object.assign mutation of an exported object.

The replacement for the coarse fallback should reason from export roots and track only values/objects that can reach those roots. If a mutation or dynamic carrier can affect an exported callable and the flow cannot be resolved, preserve the affected callable or fail closed. An unrelated local assignment, let declaration, spread, or Object.assign must not disable all identifier rewriting in the file. A BindingId/source-span summary shared with the canonical source-observer work is a more appropriate direction than a second whole-file heuristic.

## Integration posture

- PR #357 remains a **draft** and was reported non-mergeable; its base was already behind main at the last inspection. Do not merge the branch or the broad fallback based on focused source tests.
- Agent 10's draft PR #361 uses a separate opt-in source-observer-island proof. Its selected ESM leaf grammar is deliberately narrow: const primitive own-records, immediate primitive reads, and zero-argument named exported functions returning an already-read primitive identifier. That boundary keeps property changes outside the exported function body and should remain explicit and opt-in.
- The 17 pre-existing failures, the seven incremental fallback regressions, and the four public-callable positive-fixture conflicts are different categories and must not be collapsed into one count or one compiler diagnosis.

This report does not establish static secrecy, resistance to instrumentation, domain-lock integrity, SCO non-relayability, or a universal 2.5x compute bound. It is intermediate validation evidence only.
