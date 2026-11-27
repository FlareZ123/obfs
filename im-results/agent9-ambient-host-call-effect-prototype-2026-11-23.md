# Agent 9: ambient host-call effect gate prototype

**Date:** 2026-11-23  
**Status:** Focused proof-of-concept only; not merged and not a full-suite result.

## Source and validation pins

- Prototype branch: agent9-ambient-host-call-effect-prototype-20261123
- Base main SHA: 735604074c97c8702ebbfa6f14401e305083b671
- Prototype source SHA: e23a893b504e49bef5f324d2d4e16c63bacad0e9
- Changed implementation: src/properties.js, blob 592f3228495ab3d24d7a54eaa94e8683d6f929c7
- Focused witness and positive control: test/agent9-private-property-external-caller-source-witness.test.js, blob e77adcfdded374587470a2f99b3075c6cadb2030
- Workflow: manual-validation.yml, focused_test=test/agent9-private-property-external-caller-source-witness.test.js
- Run: [45292685943](https://github.com/FlareZ123/obfs/actions/runs/45292685943)
- Result: success on Ubuntu and Windows. All six test cases passed (three modes for the unsafe host-callback witness and three modes for the safe private-helper positive control). Strict project JSDoc, external JSDoc, and auxiliary JSDoc checks passed on both platforms.

## Prototype rule

The privateFunctionNodes proof previously used direct-call-only references as sufficient evidence that a function was private. The prototype adds a conservative ambient-call effect:

1. Build the set of uniquely bound local function declarations and const function values.
2. For each callable, record calls whose callee is another uniquely bound local callable as local call-graph edges.
3. Treat other CallExpressions, NewExpressions, TaggedTemplateExpressions, and AwaitExpressions as possible ambient host-callback/stack-observation effects.
4. Propagate that effect backward through local call edges to callers.
5. Do not admit affected functions into privateFunctionNodes. Apply the same check to anonymous immediately-invoked arrows.

For the external-caller witness, hidden calls the free host callback getExternal(). The call is unknown, so hidden is not classified as private and the local property pass refuses to rewrite secretField and otherField. The host callback therefore observes identical native source.

For the positive control, hidden has no unknown calls and is only used as a direct call. It remains eligible for property rewriting. The test confirms at least one property rewrite and unchanged runtime value in all three modes.

## Evidence

The unpatched mainline witness failed in [45289843259](https://github.com/FlareZ123/obfs/actions/runs/45289843259), with all three mode cases red on Ubuntu and Windows. The same witness then passed after the prototype gate, alongside the three no-unknown-call yield controls, in 45292685943.

The prototype is compile-time analysis; it adds no runtime guard or runtime compute overhead. It changes which property rewrites are admitted.

## Limitations and non-claims

This is not a complete ambient-observer analysis:

- The current use of the generic AST walk descends into nested function bodies, so an uninvoked nested closure containing an unknown call can conservatively taint its enclosing function.
- There is no trusted-intrinsic whitelist; calls such as Math.max or Object.keys are treated as unknown unless they resolve to a uniquely bound local callable.
- Property reads that trigger getters or Proxy traps are not yet modeled as ambient callback edges.
- Yield/generator behavior, dynamic import/loader effects, async callback timing, Web-IDL conversion, DOM setter identity, and broader host capabilities are not comprehensively modeled.
- The prototype only gates the property pass's privateFunctionNodes logic. It does not fix the related identifier-source mismatch.
- Only the focused six-case matrix and strict JSDoc checks were run. No full suite, cross-file matrix, browser suite, or 2.5x compute admission was established.

Treat this as evidence that an ambient-call effect can close the demonstrated caller-source gap while retaining a narrow pure-helper positive. The canonical integration should be a SourceObservationPlan with explicit evidence, BindingIds, source spans, and host capability edges, not a permanent unreviewed heuristic copied wholesale.
