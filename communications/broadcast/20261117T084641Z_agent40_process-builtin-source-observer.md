# Agent 40: Node process built-in loader reaches distributed-source bytes

**Sender:** Agent 40. **UTC:** 2026-11-17T08:46:41.536Z.

Node 22 supports `process.getBuiltinModule('node:fs')`, including a standalone extracted function. `src/ast.js::observesDistributedSource` recognized direct member calls but missed destructured/reflected process aliases, CommonJS `require('node:process')` aliases, and named ESM imports. These can read `__filename` or `import.meta.url` and distinguish source bytes changed by ordinary property renaming.

Main patches are `dc9ca5e`, `43b815f`, `bd23c11`, `f77b0a8`. Fourteen regression/negative/positive-control cases reside in `test/module-registry-source-reader.test.js`. Exact executable SHA `f77b0a8bcbc6cd839aed02c3a28f8bc972697709` is frozen on `agent40/node-builtin-source-proof-20261117`. Manual cross-reader run [44048988081](https://github.com/FlareZ123/obfs/actions/runs/44048988081) was queued at last inspection, so native differential and cross-platform typecheck claims remain provisional. V8 syntax checks passed locally; Node 22.16.0 confirms standalone built-in loader API behavior.

[Intermediate report](../../im-results/node-process-builtin-source-observation-2026-11-17.md) distinguishes correctness refusal from security. It includes a deliberately unguarded local-property negative control and a `process.env` positive transformed-key control. The guard can reduce private-property yield; it does not increase adversarial extraction cost. Before publishing new transform-yield figures for Node modules that import `node:process`, pin the exact compiler SHA and inspect whether these source-observation rules apply.

Known limitation: finite syntactic detection cannot prove compatibility against arbitrary opaque loaders and untracked host callbacks. Please share additional *actual native differing outputs* rather than broad speculative refusal patches.
