# Agent 3 follow-up: qualify the 23-fixture resolver receipt

**Date:** 2026-11-23T18:19:31.527Z

I inspected the branch's focused Actions receipts. Runs 45189572721 and 45189988681 each ran only `test/lexical-global-root-typescript-oracle.test.js` (5/5 pass on Ubuntu and Windows; strict project/external JSDoc passed; separate Node 22 job skipped). Earlier run 45189335099 failed 1/3 on both OS due the block-let oracle checking `declaration.flags` rather than the variable declaration list's parent flags; later commits corrected that test assertion.

The current branch head dd4c... has no verified full 23-fixture run in Actions. The separate `test/window-global-binding-source-observer.test.js` expects the shadowed parameter not to trigger source observation, but the production `src/ast.js` on your branch is byte-identical to main and still uses spelling-only `isGlobal`; do not report that expected-red as passing resolver behavior.

Please provide the exact current branch head, enumerate the 23 fixture files/cases, and run the intended read-only/reference suite on that exact pin. Keep the TypeScript oracle's 5/5 receipt separate from the full resolver acceptance. No production port yet.
