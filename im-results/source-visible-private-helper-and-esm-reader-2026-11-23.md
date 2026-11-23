# Source-visible private helper escapes and cross-file exported-reader field mutation

**Date:** 23 November 2026. **Status:** independently reproduced correctness hazards; partial bounded mitigations under CI; not universal source secrecy.

## 1. Private direct-call helper source can escape without any direct exported reference

A nonexported CommonJS function is used only as `privateReader()`; its body reads `owner.secretField+owner.otherField`. The module exports `run()` and `getCaptured()`, not `privateReader`. Nonetheless, each of the following sloppy-runtime routes can put the currently executing helper function object into `captured`, which a **separate external observer** later examines through native `Function.prototype.toString.call()`:

1. A nested function `capture()` evaluates `capture.caller`, revealing its caller `privateReader`.
2. The helper itself evaluates `arguments.callee`, revealing itself.
3. A `const privateReader=function selfNamed(){...}` references the internal named FunctionExpression self-binding `selfNamed`, which is separate from the outer `privateReader` alias tracked by the direct-call inventory.

All three preserve the numeric return **43** while changing the externally observable function source from `owner.secretField+owner.otherField` to generated `owner._p...` labels. Thus **a direct-call-only lexical use count is not sufficient proof of source privacy** in non-strict JavaScript.

- **Red source SHA:** `61903caa7ed08b4ba0fa5e4ee51ca7a3eb58006b`, test-only branch `agent10/private-helper-caller-red-20261123`, [Linux/Windows focused run 45111048587](https://github.com/FlareZ123/obfs/actions/runs/45111048587) failed.
- **Green bounded candidate SHA:** `fa6670427a4ea814f8111b8cc02038e8382948d0`, branch `agent10/private-helper-caller-fix-20261123`, [Linux/Windows focused run 45111141418](https://github.com/FlareZ123/obfs/actions/runs/45111141418) passed including strict JSDoc.
- Candidate: `src/ast.js` treats recognized callable `.caller` reads and `arguments.callee` as a function-source observation signal; `src/properties.js` disqualifies a named FunctionExpression with an internal self-reference from direct-call privacy. A **positive control** with ordinary data property `metadata.caller` still retains nonzero private property rewrite yield.
- Limitations: nonliteral computed `.caller`, imported functions and host-preinstalled sloppy callbacks can escape source through paths this simple bounded classifier does not necessarily find. Denying the declared witness is not a general attacker runtime extraction guarantee. Existing host privileges make full SNO source confidentiality impossible, as separately documented.

## 2. Exported ESM reader may retain callable source outside declared closed graph

**Scope caveat—closedWorld opt-in matters.** The reproducer explicitly compiles with `closedWorld:true`, but the observing `external-host.mjs` is **not** in its declared input file set. The existing compiler only enables the cross-file property pass under this opt-in, which permits property-shape changes when every relevant consumer is declared. Thus the red test proves *an outside-declared-graph source change*, not necessarily a breach of the user-authorized closed-world behavior contract. To claim a correctness violation, the integrator must treat that undeclared importer as part of the promised public API (contradicting the strict closed-world premise); otherwise the original transform may be valid and stronger. The per-field source-preserving branch is a **defense-in-depth candidate with a measurable lost rename**, not a justified default until this tradeoff and input contract are decided. Do not merge solely on the out-of-contract test.


ESM source files included `state.mjs` with `export const state={secretValue:29,otherValue:12}` and `export const peek=value=>value.secretValue`, and `entry.mjs` imported `peek` to compute `output=41`. An **undeclared** but legitimate external named importer was able to obtain exported `peek` and call `Function.prototype.toString`.

- **Red source SHA:** `052ca879f3cc8f68a015cbbd968d13983f6244c7`, [focused Linux/Windows run 45111287708](https://github.com/FlareZ123/obfs/actions/runs/45111287708) failed. Both returned numeric `output=41`, while source changed from `value=>value.secretValue` to `value=>value._pe1b39e3c617f`.
- Bounded correction branch `agent10/crossfile-reader-source-fix-20261123`: the cross-file owner-field map now **excludes field names appearing in publicly exported direct readers**, but can still rename `otherValue`. Prevents exposing changed `peek` source while retaining one unrelated private rewrite in the fixture. The first executable correction held external parity but initially emitted an undefined key for unmapped fields, since the definition-edit loop assumed a total mapping; this was caught and fixed. The next CI surfaced JSDoc nullable-key errors which were corrected. Full source-pinned validation remains separate; do not treat a focused execution pass as the same as green strict typechecks.

## Integration and significance

These tests are precise counterexamples to **observable behavior** preservation, not measurements of attacker deobfuscation cost. Their repair must not be claimed to improve SCO domain locking, COO trace-hardness, SNO host control, or the global 2.5× runtime limit. The merged `PR #322` remains 58 failures against a premerge 4,977-case suite; see [integration inventory](./pr322-full-suite-integration-gap-2026-11-23.md). The global strong-protection release remains **RELEASE-BLOCKED**.
