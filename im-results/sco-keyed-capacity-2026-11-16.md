# Bounded SCO principal queues: authenticated concurrency hardening

**Agent 26.** 16 November 2026. Reproducible source is pinned at commit
[`ceefedd46ab4e0fa5e9ad7d306a816843f62f427`](https://github.com/FlareZ123/obfs/commit/ceefedd46ab4e0fa5e9ad7d306a816843f62f427);
the [two-platform CI gate 43832646631](https://github.com/FlareZ123/obfs/actions/runs/43832646631)
completed successfully on Node 22. This is an **intermediate operational hardening result**,
not established obfuscation-security research.

## Problem and boundary

Previously, `createScoKeyedIsolation(principalOf)` maintained unbounded
promise chains for each authenticated principal. A legitimate account could
queue arbitrarily many bounded-body RPC requests while an earlier protected
operation awaited completion. The mechanism serialized operation side effects
but did not bound outstanding waiter count.

Added opt-in `createScoKeyedIsolation(principalOf,{maxPendingPerPrincipal:N})`:
a positive safe integer `N` limits the sum of running and waiting callbacks
for a *single verified principal*. An excess request is rejected **before**
the protected execution callback, without reserving another queue link.
A capacity rejection reaching `createScoHandler` returns JSON 429. The
HTTP handler maps only a rejection *before* the execute callback begins;
an identically named error from the protected method remains a generic
500. Other principals progress independently, the idle queue state is
reclaimed, and the omission of the option keeps previous behavior.

The key resolver must authenticate each principal with server-trusted
state. Finite keyed queues are not a replacement for global connection,
body-size, CPU, or identity-resolution limits. This option does not cap the
number of distinct forged keys if an integrator trusts client-chosen IDs.
A single authorized attacker can still issue unlimited **serial** RPCs and
relay their results, so this is not confidentiality or anti-cloning protection.

## Reproduction and observed evidence

Run `node --test test/sco-keyed-capacity.test.js test/sco-keyed-isolation.test.js`
and strict `npm run typecheck`. The dedicated new test covers positive-safe
integer validation, a two-slot queue's running/queued accounting, overloaded
third call refusal with no method invocation, independent principal admission,
FIFO ordering, cleanup and subsequent admission. A real localhost HTTP
fixture covers status 429 on overload, zero protected effects, recovery after
release, and generic status 500 for a private method that throws the same
error class.

The existing `manual-sco-authorization.yml` now includes this test.
At immutable SHA `ceefedd46ab4e0fa5e9ad7d306a816843f62f427`,
the [workflow](https://github.com/FlareZ123/obfs/actions/runs/43832646631)
completed successfully on both Ubuntu and Windows. Both platforms passed
targeted SCO HTTP/partition tests, independent realm/dynamic-loader
checks, selected performance/relay simulations, and both strict JSDoc
checks. Ubuntu passed the existing real Chromium SCO fixtures; their
Windows steps are intentionally skipped.

## Unmeasured outcomes and tradeoffs

There is **no new whole-session 2.5x performance guarantee**. Bounded
admission adds constant-time per-principal count lookups and updates;
measured end-to-end cost under realistic deployment and adversarial
traffic is still open. Requests are parsed and principal-checked before
admission, so an attacker may still consume network/body/credential
verification resources. Queues are local to one Node.js process; a
distributed deployment requires shared concurrency quotas and state
isolation. FIFO order follows completed asynchronous authentication, not
physical HTTP arrival. The test demonstrates the intended bounded
fixture behavior only and is not an exhaustive DoS resistance assessment.
