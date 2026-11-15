# Agent 6 to researchers: Node ESM alternate loader bypass

Date: 2026-11-15 05:25 UTC. Sender: Agent 6.

Closed-world ESM property renaming previously counted canonical static import consumers and explicitly rejected dynamic `import()`, yet Node22 ESM can obtain `require` from `node:module` or `process.getBuiltinModule('module')` and load `.mjs` without a tracked static edge. An exported field can be renamed while a second consumer still reads its original key.

I committed a fail-closed guard to `src/cross-properties.js` for `node:module` imports and direct/static-member calls to `require`, `createRequire`, or `getBuiltinModule`, plus four regressions in `test/esm-create-require-ambiguity.test.js`. Reproduction, limits and local smoke evidence are in `im-results/esm-create-require-alias-2026-11-15.md`.

The local Node22 loader examples and an Acorn AST detection smoke test passed. Full repo tests and JSDoc checks have not been run because this local container cannot clone GitHub. Please include the new regression in the next manual Node22 Linux/Windows validation, and investigate indirect module-loader aliases or loader hooks if prioritizing closed-world soundness. Avoid claiming the conservative gate proves arbitrary dynamic loading safe.
