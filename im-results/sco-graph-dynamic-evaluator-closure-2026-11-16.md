# Closed SCO graph and dynamically manufactured ESM imports

**Status:** intermediate syntactic admission hardening and a concrete runtime counterexample. **Exact tested source:** `a401dd90c4de8187f0625c84638b1f0fbe70c55e`. **Targeted Linux/Windows Node 22:** [manual SCO graph workflow 43922733144](https://github.com/FlareZ123/obfs/actions/runs/43922733144), both jobs successful with 13/13 graph tests per platform, checked generated facades and strict `jsconfig.sco-graph.json` JSDoc.

## Defect in the static-closure assumption

The graph compiler examines literal ESM import declarations and `ImportExpression` AST nodes, while its native private module may execute arbitrary JavaScript. A string supplied to `eval` or `Function` can contain a valid runtime import with no `ImportExpression` node in the source AST. For example, a file whose body contains `eval('import("./hidden.mjs")')` may load `hidden.mjs` during execution, despite the graph manifest containing only `api.mjs`. The original implementation allowed that file through `partitionScoAsyncGraph` because it saw no import expression.

The [reproducible native Node 22 test](../test/sco-graph-private-path-policy.test.js) writes `api.mjs`, an alternative `alias.mjs`, and an intentionally unlisted `hidden.mjs` into a fresh temporary directory. Both ESM originals dynamically import `hidden.mjs` and return the actual hidden export value **137**. The alias example obtains `Function` through a direct local binding before calling it. This demonstrates real execution of an unlisted source dependency; it is not merely theoretical string matching.

Since the compiler's path-specific `privateSourceDigests` are built only for supplied source files, this class of runtime import may escape deployment verification. It does not automatically leak the dependency through the composed HTTP handler, which still publishes only generated facades. If the operator serves the same private directory through an unrelated route, however, the digest and publication manifest cannot certify the unlisted runtime module.

## Narrow refusal implemented

`partitionScoAsyncGraph` now declines direct `eval` and `Function` evaluation, immediate constructor calls, direct global references and simple aliases formed by identifier assignment, static global-member extraction, or global object destructuring. This is a source-admission restriction, not a transform. A graph containing one of those visible forms fails before compiling public facades or opening HTTP routes.

The test `test/sco-graph.test.js` supplies nine dynamic-loader variants among its refused fixtures, covering direct evaluation, constructor calls, simple alias use, and global destructuring. The native-runtime regression independently verifies the actual hidden-module execution and the new fail-closed compiler result. Legitimate private modules that require these dynamic-code facilities must be handled outside the narrowly audited closed-graph API.

An earlier targeted [workflow 43922472885](https://github.com/FlareZ123/obfs/actions/runs/43922472885) at `1697fee26eb67000b2fda3d9710c36fed25ffdda` passed 13/13 tests on both platforms but failed strict JSDoc due an implicit callback type and a comment no longer attached to its function declaration. The subsequent patch moved the JSDoc to the correct function and typed the property iterator. The corrected source passed all steps in workflow `43922733144`.

## Important remaining limits

The guard does not prove the absence of arbitrary indirect dynamic code: prototype `constructor` chains, `Reflect.get`, opaque callbacks, host-passed function objects, Node loader APIs and more complex computed aliases may still manufacture imports. Refusing every arbitrary dynamically produced import from general JavaScript would require additional assumptions or a runtime sandbox/allowlist outside the obfuscator. This narrow check should not be advertised as a complete static closure proof.

It adds AST source preflight work during trusted SCO server construction and has no per-client RPC execution cost. The observed success concerns semantic source admission under the restricted examples. No whole-application 2.5× proof, universal source confidentiality, or authenticated-client anti-relay claim follows.

**Source:** [src/sco-graph.js](../src/sco-graph.js), [negative admission tests](../test/sco-graph.test.js), [native runtime counterexample](../test/sco-graph-private-path-policy.test.js), [deployment guidance](../docs/SCO_PARTITION.md).
