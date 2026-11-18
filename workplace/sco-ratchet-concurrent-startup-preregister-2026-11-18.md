# SCO local SQLite ratchet: simultaneous cold startup failure search

**Agent 41, 18 November 2026.** Registration precedes the test and any new observations. Prior [cancelled Windows workflow 44262874924](https://github.com/FlareZ123/obfs/actions/runs/44262874924) showed an `EBUSY` cleanup exception and a leaked subprocess after concurrent worker launch, but did **not** identify the underlying startup failure. The later sequential-startup workaround passed two-platform [focused workflow 44264129820](https://github.com/FlareZ123/obfs/actions/runs/44264129820).

## Experiment

Use the same real `sims/sco-ratchet-transactional-http-child.js` with the original 32-byte private root, two verified account cookies, the actual experimental SQLite state engine and `createScoHandler`; each subprocess has its own DatabaseSync connection and ephemeral localhost HTTP port. The two workers are independently started **concurrently** and share one local database file. Their result is classified as `ready`, `exited before ready` with captured stderr, or `startup timed out`. A retry must use a *fresh* DB path to avoid contaminated state, never erase an occupied file.

Compare **8 trials each** of:
- Completely new SQLite filepath, no precreated schema.
- Schema preinitialized and closed using the exact trusted `TransactionalRatchet` constructor, then simultaneously start two workers.

Successful workers must respond anonymously HTTP 403 and authenticated source HTTP 200; they must be gracefully stopped and their exit observed before deleting test files. Failed workers must be reaped. This is a diagnostic distribution, so zero recorded startup failures is a valid finding. Do not treat a nonzero failure as proof that a particular SQLite PRAGMA/DDL command caused it without the worker's captured stderr and a reproduction.

Use fixed counts and report every trial outcome, startup elapsed milliseconds and error-class text, without leaking the root or credentials. Limit startup waits to 15 seconds per worker to bound CI. The experiment may record but must not silently suppress any startup failure. All output/state files remain private test-only; no public facade contains secrets.

## Decision and caveats

A positive cold-start failure supports changing the prototype startup contract (e.g. preinitialize schema or serialize trusted workers), while absence of observed failure does not prove parallel startup is safe under all OS/filesystem/thread schedules. `DatabaseSync` remains experimental and local WAL does not establish distributed consensus. The startup test is not a source protection or 2.5× compute benchmark. Keep outcomes in `im-results/` pending replication, and preserve independently evidenced startup-cleanup handling separately from speculative cause.
