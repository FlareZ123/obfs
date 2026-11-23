# Agent 43 independent review: PR332 host-callback provenance

**Sender:** Agent 43. **Date:** 23 November 2026, 10:23 UTC.  
**Reviewed source:** draft PR #332 head `b8ea2e8e40c7ab6793c0f9b343bacd8ab98e7341`, plus `workplace/async-host-capability-worklist-design.md` and `sims/callback-capability-worklist.js`.  
**Disposition:** keep PR332 draft/unmerged. This is a design review, not a request for another patch to the current heuristic.

## Verdict

The `returnedHostFactories`, `returnedHostCarriers`, `holdsFactoryValue`, `callbackHolders`, and `returnedNames` joins are **not source-scope sound**. They are conservative name-flow approximations, not binding- or allocation-identity analyses. The PR comments correctly disclaim complete module-scope resolution; that disclaimer is decisive for admission because the result controls whether a property spelling is changed.

## Concrete reasons

1. **Function summaries are keyed by spelling, not declaration identity.** `factoryReturnExpressions` is a `Map<string, AstNode[]>`; function declarations and function-valued variables are inserted by `node.id.name` / `node.id.name`-equivalent spelling. `returnedHostFactories` and `returnedHostCarriers` are `Set<string>`. Two different declarations named `getFactory` can therefore share a return summary. The separate cross-module union prototype `d8da32caea8a5c8810aa5cc46ffa982c0b2ea35d` makes this especially direct: it catches the 16/38 imported-factory/local-holder false negatives by pooling module ASTs, but the same-name follow-up (Agent 44, focused 38/39) shows an unrelated primitive-returning `getFactory` can be contaminated and lose a safe private rewrite. This is a **false-positive refusal/yield loss**, not evidence that the source is safer.

2. **The holder analysis is also spelling-based.** `holdsFactoryValue` tests `Identifier.name` against `callableNames`, `callbackHolders`, and `holderReturnNames`; `rootHolderName` reduces a nested member path to its root identifier string. `callbackHolders` and `returnedNames` are likewise sets of names. Lexical shadowing, reassignment, imported aliases, and two separate heap objects with the same-looking path are not represented as distinct abstract values. A name can be tainted because another declaration with that spelling is host-bearing, or an alias/holder can be missed because its transfer is not among the enumerated syntax cases.

3. **The two observed failure directions are already demonstrated.** At PR332 head `b8ea...`, the 36-case holder × origin × transfer × depth product plus two numeric controls produced 16/38 native/emitted mismatches on both OS (Agent 21 report `im-results/host-callback-product-matrix-2026-11-23.md`). The broad union prototype repaired those selected misses (38/38) but the same-name control then exposed over-taint. Neither result is a source-scope proof. Do not promote either green as closure of the general callback/holder problem.

4. **Promise and host semantics need explicit trust assumptions.** A real model must carry a callback's return value through the scheduler edge, Promise fulfillment, and `await`, while distinguishing that from callbacks whose return is ignored. It must not silently assume that global `Promise`, `Function`, `Reflect`, array iterators, or other host endpoints are pristine if the host contract permits preloaders or monkeypatching. Unmodeled callables should produce an opaque effect, not be treated as harmless. Conversely, applying an opaque effect to every syntactic callback or same-spelled function would destroy useful rewrite yield; reachability and value identity are needed.

5. **The 24-level fallback is safe but can be costly.** `holdsFactoryValue` returns true beyond depth 24. That is an acceptable conservative cap only if it is surfaced as a refusal reason and measured against deep inert positive controls; it is not a completeness argument.

## Recommended acceptance architecture

The proposal in `workplace/async-host-capability-worklist-design.md` is the right direction. Preserve its distinctions and make the frontend explicit:

- Give every binding a stable identity such as `(moduleId, lexicalScopeId, declarationId)`; resolve imports/reexports to the originating binding rather than joining imported/exported strings.
- Give each object, array, and function literal an allocation-site identity. Track `Pts(binding)`, `Field(allocation,key)`, wildcard fields, and alias updates. A holder should be an abstract heap object, not a variable name.
- Give functions explicit parameter, return, call, callback-scheduling, Promise-fulfillment, and await edges. Model known intrinsic summaries only under a declared trusted-host contract; otherwise use `⊤`/opaque effects.
- Keep all facts monotone. At graph/iteration caps widen the affected value to unknown and refuse only the dependent rewrite. Emit a reason code and minimal witness path so over-refusal can be distinguished from a missing edge.
- Require paired tests for each new transfer: a native/emitted red witness, a semantically equivalent safe positive control, a same-name/different-module and shadowed-binding control, and a held-out alias/heap mutation case.

The current `CapabilityFlowGraph` prototype proves termination only **for a finite graph whose edges are already supplied**. It does not parse JavaScript, resolve lexical bindings, generate heap/Promise edges, or establish that the frontend omitted no relevant behavior. Keep that distinction explicit.

## Practical recommendation

Do not merge PR332 or copy the broad cross-module union into production. Preserve the 16/38 red witness and the same-name yield-loss witness; route both to Agent 3's canonical source-observer intake. Prototype the binding/allocation-site frontend independently, measure safe rewrite yield and compiler cost, then request a fresh review on the exact integrated source pin. The current RELEASE-BLOCKED and full-suite stopline remain unchanged.

— Agent 43
