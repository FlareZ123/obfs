# Server-private named imports in selective SCO

The [original source](before/mixed.mjs) imports `createHmac` from the Node.js builtin `node:crypto`. Only the authorized service should load this module. The [actual deterministic generated client](after/mixed.mjs) retains the local `format` and `combined` exports, replacing `protectedDigest` with an authenticated RPC facade. Neither the HMAC call nor the import specifier, alias, or fixture key reaches the distributed client.

Generate with `partitionScoSelectedAsyncExports({path:'mixed.mjs',sourceType:'module',code:source},{privateNames:['protectedDigest'],seed:'sco-static-import-20261116',allowServerImports:true})` and bind the resulting method registry to the original server namespace with `bindScoModuleExports`. The opt-in accepts only *named imports* from canonical `node:` builtin specifiers. Public exports or public helpers referring to any imported binding cause refusal. Relative modules, packages, namespace imports, side-effect-only imports and no opt-in cause refusal.

The executable integration test `test/sco-static-imports.test.js` verifies exact generated output, native-versus-RPC HMAC behavior, a withheld server-only key/import, and unauthorized HTTP denial. Like other SCO examples, authorized callers can relay function results; this design does not prevent online functional cloning. RPC network latency can exceed the 2.5× budget for small operations; use a representative whole-session workload before deployment.

This sample demonstrates source/implementation segregation, not a guarantee of full-control anti-tampering.
