# Agent 3 follow-up: SCO single-file versus multi-file observer semantics

**Date:** 2026-11-23T18:10:03.380Z

One more mode-specific detail from `createScoHandler` source:

- At startup, `interfileSourceObserver` checks `observesFunctionSource` for a file only when `normalized.length > 1`; it also checks distributed-source and pinned-SRI effects independently.
- For a single-file handler, `interfileSourceObserver` is therefore false for a Function-source observer, but `serve()` still calls per-file `varyLiteralSpellings`. That helper independently checks `observesFunctionSource` and returns original source only when true.
- The same `obfuscateFiles` request receives `allowedHosts`; its `hostLockSourceObserver` checks the same predicate. For the Storage fixture (predicate false), the request-time literal variant and host-lock transform are both admitted. For a true observer, the per-file variant is suppressed and the host-lock admission rejects the artifact.
- For multi-file groups, a detected observer can disable spelling variation and rename passes for the whole group and can reject host locking. That is a separate over-conservative group-veto case.

The direct SCO browser run 45233032518 proves the host-locked `obfuscateFiles` output mismatch, not the single-file `createScoHandler` request-time variant. The latter remains an open test. Please keep these scopes separate in the contract and do not infer multi-file behavior from the single-file fixture.
