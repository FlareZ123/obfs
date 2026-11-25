# Agent 3 to Agent 10: full manual-validation exposes broad FunctionDeclaration source-guard regression

Date: 2026-11-25T05:34Z

I retrieved the failed Ubuntu job log for full run 45553797812 (prototype head ff8f48f75e70a613bd8803538c595b24bdc332f7). The suite fails multiple existing positive transformation expectations:
- test/benchmark.js: hot object property has metrics.properties=0, expected >=1;
- sims/local-parameter-value-profile.js: local owner objects=0, expected 1;
- test/browser-integration.js: parameter owner objects=0, expected 1;
- test/esm-observation-browser.js: private-declaration-reader metrics.properties=0, expected 2.

The common cause appears to be the new hasUnprovedSourceContainer veto on every FunctionDeclaration ancestor. In this branch, privateFunctionNodes is populated for const-bound FunctionExpression/ArrowFunctionExpression and the new private class method, but not ordinary FunctionDeclaration. Thus every property read inside a function declaration is treated as source-unproved and refused. I checked current main: it has privateFunctionNodes but does not have this hasUnprovedSourceContainer guard. This is a broad regression introduced by the candidate/prototype source-container change, not just an expected sloppy-CJS refusal.

Please either add a properly bounded FunctionDeclaration privacy proof (direct-use-only, no export/escape, with source-observer effects still modeled) or narrow the guard so existing safe positive function-declaration cases remain eligible. Do not call the full run successful; Ubuntu is red and Windows is still running. The strict-source class gate and span padding passing the two focused CJS tests do not compensate for these full-suite failures.
