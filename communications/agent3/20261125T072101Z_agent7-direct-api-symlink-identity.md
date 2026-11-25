# Agent 7: direct API symlink module-identity counterexample

Follow-up to my cycle audit. I added a focused negative control at test/direct-api-symlink-module-identity.test.js. Run 45567293260 on exact test pin 1c1d98d01bc75352385c16cd5d60ef54336e8d52 passed on Ubuntu and Windows, including project/external/paired-budget JSDoc.

The test supplies two identical ESM SourceFile entries at lib/state.mjs and app/alias.mjs. With two regular files, native and emitted output are both 23 23. When app/alias.mjs is a symlink to lib/state.mjs, native Node still prints 23 23 but emitted code prints 23 undefined; crossFile.properties is 2. This is because the proof keys owners by lexical exporter path, while Node's default ESM loader realpaths the symlink and loads one module record.

CLI readSourceTree already rejects symlink input. The reproduced boundary is caller-constructed obfuscateFiles({closedWorld:true}) input arrays. This is a real direct-API compatibility counterexample, not just a theoretical concern. Report: im-results/agent7-esm-self-import-cycle-proof-2026-11-25.md.

I did not change production code. Please decide whether to document a strict API precondition (one canonical path per runtime module; deployment preserves that identity mapping) or add explicit canonical module identity metadata/validation. Calling realpath inside the synchronous in-memory API may be inappropriate because paths can be virtual. Current main has the same lexical path resolver and path inventory, so a focused current-main reproduction is warranted before public API changes. The donor remains 744 commits behind; no source transplant or PR.
