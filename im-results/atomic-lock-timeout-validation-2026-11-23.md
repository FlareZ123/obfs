# Invalid publication lock timeout produces nonexpiring deadline: bounded fix

**Agent 7, 23 November 2026. Intermediate build reliability result.**
This adds a runtime option-contract check to the repository's cross-process
atomic publication utility. It does not establish obfuscator confidentiality,
tamper resistance, runtime parity for general JS, or its 2.5× compute ceiling.

## Counterexample

`src/atomic.js::withLock` previously computed
`deadline=performance.now()+(options.timeoutMs??5000)` and, while an
exclusive `wx` lock was held by another process, retried until
`performance.now()>=deadline`. Supplying
`{timeoutMs:NaN}` makes that comparison **always false**, so a publisher
can wait forever under contention. `Infinity` has the same practical
unbounded-wait effect, while negative values have an unstated immediate-error
behavior only if a lock exists.

The red-first test `test/atomic-timeout-validation.test.js` checks
`NaN`, `Infinity`, `-Infinity`, and `-1` in
`atomicWrite` and `withDirectoryLock`, requiring `TypeError`
without writing output or running a protected action. It also creates an
actual lock owned by the parent process, starts a child publisher with
`NaN` deadline and requires it to reject promptly. Without a fix,
the child instead exceeds a 1.8-second maximum, proving a concrete
contended-publisher liveness failure.

Source `1d4eaad0df8a7e4b439d51ced4302b83be4a9924`,
[focused run 45282706267](https://github.com/FlareZ123/obfs/actions/runs/45282706267):
both Node22 Ubuntu and Windows reported **both new cases red**.
The first errored with Missing expected `TypeError`; the second killed the
child with `ETIMEDOUT` after approximately 1.8 seconds.

## Fix and bounded verification

`withLock` now reads `timeoutMs` once, requires a finite
nonnegative number, throws `TypeError` before lock I/O for invalid
values and reuses that validated value for the existing monotonic
`performance.now()` deadline. The exclusive-file open, retry delay,
atomic temporary write and cleanup rules remain unchanged.

Candidate `af92d815bf110fa42b960adfd7b194f8aed0e173`,
[focused run 45282855801](https://github.com/FlareZ123/obfs/actions/runs/45282855801),
passed both test cases and all project/external/paired-budget strict JSDoc
checks on Ubuntu and Windows. [PR #365](https://github.com/FlareZ123/obfs/pull/365)
squash-merged as `485536c66478d7c90f27a3bf96ecfff0fb98563f`.

The earlier frozen-wall-clock regression at
`im-results/atomic-lock-monotonic-timeout-2026-11-23.md`
demonstrates a separate timing hazard, addressed by monotonic time.
Together they prove bounded timeout behavior under the two
**specific** invalid-clock/configuration witnesses, not under arbitrary
filesystem failures, malicious lock-file deletion, process suspension,
or other user-supplied pathological configurations. No broad full-suite
acceptance is inferred from these focused checks.
