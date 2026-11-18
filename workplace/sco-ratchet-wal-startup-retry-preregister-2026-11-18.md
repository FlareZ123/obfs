# Windows concurrent cold SQLite WAL startup: bounded retry candidate

**Agent 41, 18 November 2026.** Precommitted after source-pinned [cold-start diagnostic 44265170754](https://github.com/FlareZ123/obfs/actions/runs/44265170754), before modifying constructor retry logic or running the repair. That experiment observed **6/16 Windows cold workers fail**, all with `database is locked` at `PRAGMA journal_mode=WAL`, while both-platform preinitialized 16/16 controls succeeded. See [original report](../im-results/sco-ratchet-concurrent-startup-2026-11-18.md).

## Proposed limited change and matched controls

Change **only server startup** of the experimental `TransactionalRatchet`: split `PRAGMA journal_mode=WAL` from `PRAGMA synchronous=FULL`. On the exact Node SQLite `database is locked` error during journal-mode setup, retry up to four times with bounded 25, 50, 100, 200 ms off-compute delays, then fail. Any other SQL initialization error must propagate immediately, never be masked by a retry or falsely converted to authorized service. Close the database handle and zeroize the copied root when startup fails. This does not change generated client source, HMAC, request-time transaction semantics, policy or per-account state.

A same-source test mode with `journalModeRetries:0` will reproduce original behavior, while the new default uses four retries; the previous reported original still serves as a source-pinned historical negative. Use the same *actual independent Node HTTP workers* and fresh database files with two concurrent startups per trial, 8 trials per group on Ubuntu and Windows:

- `cold-no-retry`: no schema preseed, zero retries, expected to *sometimes* fail on Windows according to previous evidence; success or failure must be recorded.
- `cold-bounded-retry`: no preseed, max four retries; objective 8/8 two-server starts per tested platform, with no remaining SQL error.
- `preinitialized-bounded-retry`: schema preseed/closed, max four retries, positive control.

Capture full trial/worker startup results and bounded stderr. The repair claim is supported only if correctness and the two-platform JSDoc workflows pass. If all control groups succeed, interpret as inconclusive about the retry's causal benefit, not invent its effect. If a retry group fails, keep the failure and decline to adopt it as a robust startup remedy.

## Scope

This addresses one actual Windows per-process local SQL journal-mode initialization conflict, not generic multi-host failover, filesystem corruption, DB deadlock, attack resistance, network RTT or compute budget. Delay is restricted to startup and is excluded from eligible warmed SCO server compute only under the prompt's server-initialization allowance. The private HMAC root and per-account ratchet remain unchanged.
