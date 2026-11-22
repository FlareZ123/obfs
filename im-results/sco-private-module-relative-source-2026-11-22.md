# Selected SCO module-relative relocation admission (22 November 2026)

## Scope and source-pinned observation

In selective server-controlled obfuscation, `partitionScoSelectedAsyncExports`
keeps selected exports and private helpers in a Node ESM module while retaining
other exports in a browser ESM facade. This changes the module URL and
module-resolution host for the selected function body. According to the
[Node ESM documentation](https://nodejs.org/api/esm.html) and
[MDN `import.meta` documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import.meta),
`import.meta.url` identifies the executing module; `import()` uses
host/module-specific dependency resolution.

Before the guard, a selected private export containing
`return import.meta.url` was accepted. A new red-first test at
[`test/sco-private-host-effect-closure.test.js`](../test/sco-private-host-effect-closure.test.js)
also covers a private helper containing `import.meta.url` and selected/private
helper dynamic `import("./client-data.mjs")` expressions. The first case
was independently observed as **missing its expected refusal on both**
Ubuntu and Windows Node 22 in
[run 44997612165](https://github.com/FlareZ123/obfs/actions/runs/44997612165)
at exact source `836c6dd3acd115efa48f686da94a8ab543709587`.
The graph matrix reported **60 passing, one failing** of 61 tests on each
OS. This is a compile-time admission counterexample, not an observed
unauthorized data disclosure or an end-to-end client/server execution trace.

## Conservative correction and verification

`src/sco-selective-partition.js` now scans the private function and private
helper ASTs for `MetaProperty` or `ImportExpression` and declines the
selection with `Private SCO export or helper uses unproved module-relative
execution`. This is a bounded syntactic guard, consistent with the
pre-existing static private-dependency graph refusal. It conservatively
declines `new.target` as another `MetaProperty`, even where the
particular function would have had equivalent behavior.

The focused existing `manual-sco-graph.yml` workflow
[run 44997718368](https://github.com/FlareZ123/obfs/actions/runs/44997718368)
at exact source `8742f1d1b742e3e69494bfe32201c6550501a62e`
passed **all 61 targeted tests on Ubuntu and Windows**, the generated
SCO graph consistency check and its strict JSDoc checker. This pin includes
the regression, the compiler guard and the updated
[`docs/SCO_PARTITION.md`](../docs/SCO_PARTITION.md).
No full repository or real Chromium matrix was dispatched for this narrow
change; its interaction with future source-observation integration remains
a separate verification requirement.

The guard runs at compilation, so it adds no emitted runtime instruction to
previously eligible operations. No measured universal 2.5× bound follows.
Explicitly reviewed static private ESM imports remain supported, subject to
the graph and deployment trust contract. Dynamic loader aliases hidden
behind unproved higher-order flows are not automatically excluded by this
particular AST condition; follow the broader operator review requirements.

## Decision

Keep this finding in intermediate correctness evidence. The fix prevents a
documented class of unproved cross-host semantic migration. It provides
neither stronger static source secrecy nor resistance to authorized SCO
relaying, dynamic extraction or hostile client instrumentation. The
three-mode strong-security release decision remains **RELEASE-BLOCKED**.
