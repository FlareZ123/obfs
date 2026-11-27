# Native Node Web Storage strict SNO source-parity acceptance (27 November 2026)

## Scope and evidence status

The preexisting `test/sno-storage-source-parity.test.js` contains a useful **negative diagnostic**: its native Storage named-property setter fixture expects `native.stored !== emitted.stored` and logs `namedSetterSourceParity:false`, yet passes. A passing expected-mismatch diagnostic must not be interpreted as observable behavior parity.

Agent 16 added a separate opt-in **strict acceptance** assertion and a source-pinned two-platform manual workflow. Neither changes the production compiler. This report is intermediate compatibility evidence, not an academically established obfuscation-security result.

- Source commit: `c8684d2e50d519bd0859feb13952e65e66cc2754` (contains strict test and manual workflow).
- Workflow: [manual two-OS run 46080463665](https://github.com/FlareZ123/obfs/actions/runs/46080463665), with required exact `candidate_sha` checked by `git rev-parse HEAD`.
- Command: `OBFS_STRICT_STORAGE_PARITY=1 node --test test/sno-storage-source-parity.test.js` under Node.js 22.
- Test: `strict SNO native Storage named-setter source parity with independent yield`, appended to the existing Node Web Storage suite.
- Harness uses `runSnoDifferential`: compiles `entry.cjs` in SNO mode, builds native and obfuscated one-entry SNO launcher packages using `createSnoLauncher`, runs child Node with `--experimental-webstorage` and independent storage files.

## Positive controls and strict requirement

The fixture defines `inspect(){const privateLocal=71;return privateLocal;}` and `independent(){const independentLocal=13;return independentLocal;}`. It stores `inspect` using `localStorage.namedCallable=inspect`, reads back via `getItem`, executes both functions, and compares native vs emitted results. It requires numeric equality and independent helper renaming (nonzero rewrite yield), then requires the native and emitted captured source strings to match **exactly**.

## Observed Linux result

Ubuntu Node 22 job failed at the intended strict assertion, after passing its source pin, npm install, and the 12 other tests in this suite. The log reports **12 passed, one failed, zero skipped**. The mismatch was:

```text
native:  function inspect(){const privateLocal=71;return privateLocal;}
emitted: function inspect(){const _vc83d60134de7=71;return _vc83d60134de7;}
```

The error was `ERR_ASSERTION` at the exact source-equality check, not an installation or syntax error. The preceding controls verifying functional return values, nonzero rename yield, and independent helper transformation ran without failure before this comparison.

## Implication

For this specific native Node Web Storage path and source SHA, SNO transformed output is observably different even though ordinary function results match. This is a **compatibility counterexample**, not an attack on server authorization or a proof about all programs. A production fix should preserve source parity and unrelated transform yield without assuming all source-observer paths are statically transparent. Re-run this opt-in gate at the exact intended integration candidate on Linux/Windows before any parity claim.

The workflow also dispatched a Windows job; its final status should be independently checked and appended rather than inferred from Linux.
