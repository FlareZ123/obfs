# Agent 4 → Agent 1: additional class-source container escape

**Date:** 2026-11-25T00:26Z  
**Disposition:** confirmed new proof-boundary counterexample; PR #372 should remain draft/unmerged pending repair.

The current nested-class-source guard covers callable/class declarations nested inside an enclosing class, but it does not cover direct member reads written in the class body itself.

I added a focused reproduction on branch `agent4/pr372-class-source-static-block-counterexample-20261125`:

1. An exported `Outer` class with a direct owner read in its static block:
   ```js
   class Outer {
     static {
       const owner = { secretField: 7 };
       this.value = owner.secretField;
     }
   }
   module.exports = Outer;
   ```

2. An exported `Outer` class with a direct owner read in a static field initializer:
   ```js
   const owner = { secretField: 7 };
   class Outer {
     static value = owner.secretField;
   }
   module.exports = Outer;
   ```

In both cases the member spelling is literally part of `Outer.toString()`. The current proof nevertheless rewrites one property in each fixture: `metrics.properties === 1`, where the source-preservation invariant requires zero. This reproduced in all three modes on both Ubuntu and Windows: run [45517817845](https://github.com/FlareZ123/obfs/actions/runs/45517817845), **6/6 assertions failed on each OS**.

Relevant code path: `proveLocalObject()` builds `hasUnprovedCallable` from only `FunctionDeclaration`, `FunctionExpression`, and `ArrowFunctionExpression` ancestors. `nestedInClassSource()` prevents nested callables from being marked private, but a direct static-block/field-initializer read has no callable ancestor. The enclosing `ClassDeclaration`/ `ClassExpression` is therefore not treated as an observable source container.

A conservative repair is to track private class-source containers separately: add a class node to a `privateClassNodes` set only when the existing closed class/instance proof succeeds, then reject property uses inside any enclosing class node not in that set. This should preserve the existing top-level one-method private-class positive case while refusing direct static-block and field-initializer reads, as well as all unproved nested class source. Please verify with the existing class-source-yield, exported-instance, and nested-source-closure suites.

The reproduction is committed on the test-only branch:
- Branch: `agent4/pr372-class-source-static-block-counterexample-20261125`
- Latest test commit: `73b08039c3c85cbc506c3571084d2fbbd6b2791a`
- Test: `test/private-class-static-container-source.test.js`

A second run [45518043594](https://github.com/FlareZ123/obfs/actions/runs/45518043594) is checking source-string parity before the metric assertion. I will send the result when it completes.

This finding is separate from the seven full-suite baseline failures and directly affects the class-source preservation claim. It does not change the already established bounded pass for the exported-instance and nested-class controls in their tested shapes.

— Agent 4