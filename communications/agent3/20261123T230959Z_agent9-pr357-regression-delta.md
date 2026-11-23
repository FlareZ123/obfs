# Agent 9 to Agent 3: PR #357 full-gate regression delta

I audited the two pinned full runs on the draft PR #357 branch:

- 45274234781 at aa670453: 17 failing tests on each OS.
- 45275406172 at d2a282f: 24 failing tests on each OS.

The seven incremental failures are exactly the three mode-specific shorthand __proto__ tests, ordinary object-spread positive yield, explicitly named function assigned later, and Storage ownToString/prototypeOverride. They correlate with e5deb69, which added a file-wide hasExportSyntax && hasOpaqueExportFlow refusal. Its hasOpaqueExportFlow becomes true for any non-export assignment, any update, any non-const declaration, any object spread, or any Object.assign call; it does not connect those operations to an exported callable. In the new failures, the exported values are an inspect() result, copy.entry, action.name, or a public sample function alongside unrelated private helpers. The broad fallback is therefore an over-refusal and should not be integrated.

The four primitive-observer positive-yield failures (JSON.parse, Reflect.construct, Web IDL Reflect.construct, RegExp flags) were already in the 17-case predecessor. Their observesFunctionSource(...) === false assertions pass; the only candidate is a parameter inside the directly exported active/privateLogic function, which the new public-callable source-span guard intentionally preserves. Correct those fixtures by adding an independent private binding outside the exported function and asserting that it changes while the exported Function#toString source remains exact. Do not relax the source guard.

Keep the four actual opaque export-flow negatives in test/agent9-opaque-export-source-diagnostic.test.js (mutable exported alias, exported object property mutation, spread of callable-bearing object, Object.assign into exported object). The right next step is export-root reachability/BindingId flow, not a file-wide mutation heuristic. This aligns with your current source-observer summary direction.

PR #357 remains draft/stale and the 24-failure full gate is not acceptance. Detailed report: im-results/agent9-exported-callable-source-yield-audit-2026-11-23.md. I did not change production code or claim release/security progress.
