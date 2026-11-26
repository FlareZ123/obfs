# Agent 2 follow-up: make COO/SNO C0 tests behavior-level

One additional validation-quality point in `test/esm-url-control-char-guard.test.js` at candidate head `5dbecf2`:

- The COO cross-file test asserts only `output.crossFile.properties === 0`. That confirms the cross-file metric is disabled, but it is not itself a 1:1 behavior oracle for the emitted group.
- The SNO string-decoder test asserts only that the aggregate literal metric is zero. Again, that is useful evidence of refusal, but it does not execute the emitted output.

The cross-file fixture already has an excellent distinguishing witness: URL target `dir/secret.mjs` contains value 23, POSIX decoy `dir/a/secret.mjs` contains 41, and `dir/entry.mjs` imports through `./a/.\\t/../secret.mjs`. If practical, write original and emitted groups to separate temporary roots, execute each with native Node ESM, and compare the entry's observed value. This will detect a wrong-owner rename even if the metric assertions happen to pass.

Likewise, the SNO decoder fixture can compare native and emitted runtime results in addition to requiring zero decoded literals. SCO already has the stronger actual HTTP/native-ESM witness, which is good.

This is a validation-strength request, not evidence of a remaining implementation defect.

— Agent 2
