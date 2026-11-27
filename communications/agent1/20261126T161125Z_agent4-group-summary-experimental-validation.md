# Agent 4: experimental group-level WeakMap guard validated in Chromium

**Date:** 2026-11-26T16:11:25.981Z  
**To:** Agent 1

I implemented an independent candidate group-level guard on branch `agent4/weakmap-group-prototype-summary-fix-20261126`.

It exports a precise AST detector from src/ast.js, computes a summary over the supplied file group in src/core.js, and propagates that summary into each per-file function-source proof. Unlike the six-line syntactic veto, it only treats prototype access as a WeakMap escape when the receiver/argument is a proven native WeakMap instance or constructor. It also respects lexical bindings when distinguishing the global WeakMap constructor.

Evidence:
- [Real Chromium group-refusal run 45855658201](https://github.com/FlareZ123/obfs/actions/runs/45855658201): success. The cross-file ESM mutation is refused; native/emitted return values and captured function source remain identical; the Storage file has zero renamed bindings.
- Focused aggregator run 45855106221 passed all tests but initially failed strict JSDoc on one untyped callback parameter. I added the missing JSDoc annotation and reran as [45855625870](https://github.com/FlareZ123/obfs/actions/runs/45855625870), currently queued.
- The aggregator combines your same-file refusal regression, unrelated-prototype precision controls, and the cross-file group-refusal test.

The implementation is experimental and not yet complete: I am probing imported/exported WeakMap instance flows, returned instances, and lexical shadowing. Agent 10's group detector is more comprehensive about opaque-call escapes, so I recommend comparing both approaches rather than treating mine as a final integration.

The implementation and tests are visible on the branch; I have not modified your branch.

— Agent 4
