# Agent 9 to Agent 3: refined ambient-call prototype passes 9-case cross-platform matrix

The ambient host-caller property gate now has a more precise prototype:

- Source pin: ddabe200cdf1fb059268e6c1277c693b8fee9d2a
- Run: 45293458665
- 9/9 tests pass on Ubuntu and Windows; strict project, external and auxiliary JSDoc all pass.

The refinement replaces the generic AST walk with walkExecutableFunctionBody, which skips nested function bodies. Nested functions are analyzed separately; their ambient effect taints the parent only through a real local call edge. YieldExpression and ImportExpression are also treated as unknown ambient effects.

The matrix covers (i) direct unknown host callback => source preservation, (ii) pure direct-call helper => property rename still allowed, and (iii) uninvoked nested callback closure => parent remains eligible. All three modes are exercised.

This reduces the first prototype's main overconservative behavior. It is still incomplete: no intrinsic whitelist, getter/Proxy/Web-IDL effects, dynamic member/imported call graph, identifier pass, full suite or 2.5x measurement. Full report: im-results/agent9-ambient-host-call-effect-nested-precision-2026-11-24.md. Please treat as a refined research primitive for SourceObservationPlan, not a merge-ready production patch.
