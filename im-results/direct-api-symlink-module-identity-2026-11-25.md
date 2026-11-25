# Direct API symlink module-identity counterexample

**Date:** 2026-11-25  
**Status:** Reproduced on current main; API contract documented; no compiler-source fix.

## Current-main evidence

- Direct API negative-control test: test/direct-api-symlink-module-identity.test.js, added in commit 512987e68c2d1349e218cccc13b1374fb8821b02.
- Focused manual-validation run [45567968492](https://github.com/FlareZ123/obfs/actions/runs/45567968492) checked that exact test on Ubuntu and Windows. Both passed 1/1, plus strict project JSDoc, strict external JSDoc, and paired/complete-suite budget JSDoc.
- CLI input guard test: test/cli-e2e.test.js, added in commit 47bb38eb515fa6bb0e66c10aed633c5f722c464e.
- Focused manual-validation run [45567808998](https://github.com/FlareZ123/obfs/actions/runs/45567808998) passed 4/4 CLI E2E tests on Ubuntu and Windows, plus the same JSDoc checks.
- README contract note: commit 2c073d06b73ceffaa8c262342f825e506ace1684.

## Reproducer

The direct API test supplies three in-memory module entries:

- lib/state.mjs exports state = {secretField:23}.
- app/alias.mjs supplies identical source bytes but is deployed as a symlink to lib/state.mjs.
- main.mjs imports state from both lexical paths and prints both field reads.

The test runs two deployment layouts:

1. Two independent regular files: native output is 23 23 and transformed output is also 23 23.
2. app/alias.mjs remains a symlink to lib/state.mjs: native Node output is 23 23, but transformed output is 23 undefined. The API reports two cross-file property rewrites.

The test asserts the mismatch explicitly and passes on both Linux and Windows. This is a negative-control test documenting an unsupported caller layout, not a claim that the mismatching behavior is correct.

## Mechanism

Current-main source pins at investigation time:

- src/core.js: 8d33996821650de540b87502baff00a9e7ea99c7
- src/cross-properties.js: 7298df722d65f545dcb7b55c81cb6b8e101ce6b7
- src/cli.js: 587398dbd070a809be92098f9df678ec7e5c23d2

The in-memory API validates lexical paths through safePath/registerFilePath. Static relative imports are resolved by lexical path normalization. Cross-file property names are derived from seed/exporterName/exportName/propertyName, so the two lexical exporter paths can receive different names. Node's default ESM loader resolves a symlink alias to its realpath and loads one module record. If the caller then preserves the symlink in the emitted tree, the runtime uses the target module's property spelling for both imports, while main.mjs contains a path-specific spelling for the alias.

The CLI's readSourceTree rejects symlinked source entries before compilation. The new CLI E2E test pins this guard. Therefore this counterexample concerns caller-constructed obfuscateFiles({closedWorld:true}) source groups, not the ordinary CLI input path.

## API contract and remediation options

The README now states that each supplied SourceFile.path is treated as a distinct runtime module identity and that the in-memory API does not inspect filesystem realpaths. It warns callers not to supply both a symlink alias and its target as separate entries if deployment will preserve the symlink. The caller must either emit every supplied path as its own regular file or canonicalize the supplied graph to match the target runtime's module identity.

If future callers need alias-aware graphs, consider explicit caller-supplied module-identity metadata and validate that entries sharing an identity have compatible source bytes. Relative imports should resolve through that identity mapping, and all aliases should receive the same owner mapping. Do not blindly call realpath inside the synchronous in-memory API: paths may be virtual, and the correct identity policy depends on the target runtime/resolver.

This is a demonstrated semantic-compatibility limitation for a specific direct-API deployment pattern, not a demonstrated attack bypass. It does not invalidate the CLI symlink guard. The product release decision remains RELEASE-BLOCKED for the broader security/performance objective.
