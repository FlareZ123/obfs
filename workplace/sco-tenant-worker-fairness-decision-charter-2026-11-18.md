# Proposed SCO per-tenant worker isolation and rate-budget falsification plan

**Agent 7, 18 November 2026 UTC. Classification:** unimplemented test design and decision contract, not evidence that any mitigation works.

## Why this is now a priority

The [source-pinned cross-account A/B adversarial result](../im-results/sco-ratchet-cross-account-contention-2026-11-18.md) on Node 22 showed a single legal 64-event authenticated Account A private HMAC call delaying an independent 16-event B operation to >5× its native budget, with 14/14 strict 2.5× breaches and 0/14 matched cold B controls breached. The existing per-principal keyed mutex preserved authorization and state sequence but cannot preempt synchronous 8 MiB-per-event HMAC on the Node main event loop. The [equal-trust minified control](../im-results/sco-ratchet-equal-trust-minified-control-2026-11-17.md) independently showed no measured generated-public-facade protection advantage over an ordinary same-trust RPC client. A useful next system investment must therefore address actual execution isolation and a measurable attacker-cost boundary.

## Candidate to test, without presuming success

Keep the same A/B original machines, key, 16-event B positive work, 64-event A adversarial work and same trusted server authentication/policy. Replace *only* the private HMAC execution dispatcher with a prestarted bounded Node worker pool; use per-principal FIFO ordering to prevent concurrent mutation of the same principal state, and a quota-limited fair queue between authenticated principals. Implement stateful key/ratchet storage inside the trusted pool or use a transactional affinity dispatcher, not public worker source or client keys. CPU affinity/fair-share needs evidence: many workers on an oversubscribed host still compete for cores. A work queue that consumes all slots before policy identity resolution may deny B even though HMAC work is off-thread. Define worker startup as eligible trusted server SCO initialization, but count request dispatch, serialization and client latency inside the 2.5× allowance.

## Exact comparison and release veto

Run both the **existing synchronous baseline** and the worker-pool candidate with the same root and private 8MiB/event HMAC for 7 or more independent trials on Ubuntu and Windows Node22. Measure B native, B quiet warm HTTP, B quiet **cold independent child**, B loaded under one A 64-event legal batch, and B loaded under a continued stream of legal A requests. Verify monotonic time overlap and output parity, auth B isolation, one valid A online relay still possible, source-private material not in published ESM, state monotonicity after retries and failed workers.

Include a control where A creates multiple authorized sessions/principals to test saturation of global queue capacity, observing whether B is admitted, delayed or rejected with 429. Declare a quantitative fairness hypothesis before implementation (for example, 0/14 B loaded strict >2.5× under the specified one-A-burst workload, no B HTTP 429, with unchanged native parity). If any supported end-to-end session exceeds the hard 2.5× budget, the supported scope fails even if medians pass. Record all ratios, both platform outcomes, process/worker counts, CPU load, scheduling policy, memory, private root residence and collision rules.

Real TLS/browser network and cold client startup must be sampled separately. Under the supplied unlimited legitimate request model, quotas imply some authorized A requests may be throttled or rejected; define whether that is an acceptable availability contract instead of assuming infinite free service. This could improve B fairness under bounded admission, but it cannot establish universal service against unlimited Sybil identities or prevent a legitimate A from relaying its own private results.

Do not claim the worker-pool mitigation effective until the exact independent A/B attack that falsified the baseline is reproduced unchanged against the candidate. Keep all interim evidence in `im-results/` and do not promote a general source-protection theorem.
