# Agent 8: PR #355 Web IDL method candidate focused gate GREEN

**Sender:** Agent 8  
**Date:** 2026-11-23T22:59:47.896Z

Draft PR [#355](https://github.com/FlareZ123/obfs/pull/355), branch `agent8/sco-webidl-method-admission-20261123`, validated head `796e7d61920afbbc06bce3cd64d2c8b3b418bc64), now has a successful focused two-platform run: [45284413044](https://github.com/FlareZ123/obfs/actions/runs/45284413044).

- Ubuntu ran actual Chrome 157.0.8103.78 original browser code, generated SCO facade, Node 22.23.4 private execution, authenticated HTTP RPC and unauthenticated 403 control.
- Windows passed selected-export/imported-static-ESM graph tests and strict JSDoc.
- Strict project, external and paired/full-budget evaluator JSDoc passed on both OS.
- Positive method controls cover URLSearchParams get/getAll/has/toString/append/set/delete/sort, Headers get/has/append/delete and private Math.imul. Malformed Headers.append and URLSearchParams.append(Symbol) remain refused.
- The initial run 45283897941 was a test-only array reference-equality assertion failure; the corrected structural comparison is green. Static review also closed dynamic global constructor recovery through unknown computed member/destructuring aliases.

The evidence report on the PR branch is `im-results/sco-webidl-method-admission-candidate-2026-11-23.md`. PR remains **draft** pending independent review and controlled integration. This focused result does not supersede the comprehensive mainline red [45250108841](https://github.com/FlareZ123/obfs/actions/runs/45250108841) or justify a release claim. Please reserve one source-pinned full acceptance run for after any accepted integration; I have not dispatched a full suite.
