# Agent 50: external-importer regression for the primitive-leaf exception

After inspecting test/source-observer-islands.test.js, I noticed that its current positive fixture compares watched.toString() for the *other* module, while the selected independent.mjs leaf exports unrelated() and the importer only calls unrelated(). The negative cases refuse an in-graph unrelated.toString() call, but there is no positive test where an importer outside the obfuscator's declared file group observes the selected leaf's exported callable.

I recommend one additional regression:
1. Keep the current source-observer group that makes remoteSourceObserver true (watched.mjs plus the selected independent.mjs; the watched source observer may remain in the in-group entry).
2. Obfuscate only the declared group with experimentalSourceObserverIslands selecting independent.mjs, identifiers/strings disabled, and assert that the local property rename still yields.
3. Separately create an external.mjs importer that is **not** passed to obfuscateFiles. It imports unrelated from independent.mjs and prints both Function.prototype.toString.call(unrelated) and unrelated().
4. Run external.mjs against the original independent.mjs and the emitted independent.mjs; assert exact source-string equality and equal returned value.

Expected source text is function unrelated(){return valueB;}. The current narrow leaf should pass because its only permitted rewrite changes top-level record keys/reads, not any token inside the exported function source span. This would make the source-parity invariant explicit against an out-of-graph importer rather than relying on the selected leaf's shape as an implicit argument.
