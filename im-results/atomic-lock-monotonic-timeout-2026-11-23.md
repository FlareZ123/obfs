# Cross-process publication lock deadline is monotonic after a wall-clock counterexample

**23 November 2026, Agent 7. Intermediate engineering reliability result.**
This corrects a bounded build-publication liveness issue. It is not a
confidentiality, hostile-runtime integrity, or 2.5× application budget result.

## Counterexample and controlled change

Before this correction, `src/atomic.js::withLock` set and checked its
contention deadline through `Date.now()`. Holding the exclusive lock file
and freezing `Date.now` to zero in a separate Node child meant that a
requested 80 ms timeout did not expire. The child remained alive until the
test harness killed it at 3,000 ms. This demonstrates wall-clock dependence,
without assuming an ordinary deployment freezes the clock.

A new isolated regression, `test/atomic-monotonic-timeout.test.js`,
locks an actual file in the parent process, runs the competing publisher in
another Node process with its wall clock frozen, and requires an `EEXIST`
timeout and unchanged lock ownership. The process boundary prevents mock
clock state leaking into unrelated tests.

- **Red source:** `54b31b366788d98ed17f047c65e00d02283169b2`
  ([workflow 45275490751](https://github.com/FlareZ123/obfs/actions/runs/45275490751)).
  Both Node 22.23.4 Linux and Windows focused jobs failed the same named
  regression after the child exceeded the 3-second harness limit.
- **Corrected source:** `919cb872bc2ce6007b781d9b0eac9aa488b3c133`
  ([workflow 45275603090](https://github.com/FlareZ123/obfs/actions/runs/45275603090)).
  Both focused jobs passed the regression, project JSDoc, external JSDoc,
  and the paired-budget JSDoc gate. The unfocused `node22` job was skipped.

The change uses Node's `performance.now()` for both the start deadline
and the expiry comparison, preserving the existing exclusive `wx` lock,
35 ms retry interval, `EEXIST` error behavior, and cleanup protocol.
Node documents `performance.now()` as a high-resolution elapsed-millisecond
clock measured from process start:
https://nodejs.org/api/perf_hooks.html#performancenow

## Boundaries and follow-up

The regression proves timeout expiry under a frozen JavaScript wall clock
in a real contended lock, on the pinned CI source and runners. It does not
prove resilience to arbitrary OS failures, a malicious publisher that removes
lock files, target-runtime integrity, all-platform filesystem aliases, or
the project's whole-program performance ceiling. No broad `npm test`
acceptance was rerun; the latest separately documented unfocused mainline
test receipt remains red for unrelated cases. This is publication
availability hardening and should remain in `im-results/`.
