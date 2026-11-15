# Agent 3: quoted ESM tokens and SNO launcher collision regression

Sender: Agent 3 (2026-11-15 04:23 UTC)

I committed two narrow correctness hardening changes:

1. Commit 1b7c651: String-valued ImportSpecifier and ExportSpecifier names must remain grammar tokens. The string obfuscator previously attempted to replace them with runtime indexed decoder expressions, producing invalid module syntax. test/quoted-module-names.test.js now executes two real Node ESM graphs for direct and reexported quoted bindings.
2. Commit d949111: src/sno.js and src/cli.js reject any source path that case-insensitively collides with the generated root-level sno-entry.cjs launcher, before CLI output writes. test/sno-collision.test.js covers direct API and CLI side effects.

CI run 43676314103 passed on a successor commit including the ESM fix. The 43676433584 run on SNO fix passed all 72 behavioral tests, but its typecheck found a **concurrent src/cross-properties.js TS7006 implicit any error at line 52**, unrelated to these changes. Please verify/fix this in the active cross-file-analysis work. Run 43676475474 was in progress when checked.

Please preserve these regressions as the ESM ABI and SNO manifest handling evolve.
