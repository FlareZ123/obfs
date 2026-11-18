# Predeclared equal-trust SCO worker comparison (18 November 2026)

**Status:** experimental branch, awaiting Linux/Windows source-pinned execution. This file records the hypothesis and stop criteria before inspecting successful measurements. It does not promote a security result.

## Question

The SCO private-ratchet demonstration moved each verified principal's original HMAC work from the Node HTTP event loop to a prestarted server-resident worker thread. The earlier crossover measured better latency for an independent Account B request during one valid Account A batch. Is that improvement a special protection property of the *generated SCO facade/handler*, or the same generic isolation benefit available to a conventional authenticated Node service holding the exact same secret?

## Frozen matched design

Run \`sims/sco-worker-equal-trust.js\`, which invokes both arms of \`sims/sco-ratchet-worker-http-contention.js\`. The new **ordinary-worker** mode uses a normal Node HTTP JSON endpoint, with no generated facade, then calls the exact same private worker function as the existing **worker** generated-SCO mode. Both arms use:

- A fresh but same-pair 256-bit root secret, identical original HMAC implementation and 8 MiB private work per event.
- Prestarted server-resident worker threads dedicated to each principal.
- Validated 64-event A and 16-event B private batches, plus 16+16 quiet B controls, exact output checks, and a 200-status requirement.
- Identical cookie-based verified principal lookup and \`createScoKeyedIsolation\` per-principal FIFO admission, with the same queue limits.
- An independent child client that submits B only after the actual A private worker publishes a start marker. Check the B submission time against the A worker's authenticated private execution interval.
- Seven independent same-secret crossover pairs by default, alternating arm order on Linux/Windows Node 22.

The ordinary handler uses the same JSON envelope and 65,536-byte body cap. The two outer HTTP request implementations differ, which is the intended experimental variable. The native B process, request parsing and worker scheduling can experience real OS noise. Sampling neither includes generation/distribution of the facade nor all browser/WAN startup, and resident-worker initialization occurs before the measured response interval.

## Predeclared decision and kill rules

A meaningful *incremental obfuscation advantage* would need an attack or runtime protection difference over the ordinary-worker arm with identical attacker access and workload. A similar B service-latency distribution can support only an ordinary worker-architecture availability claim. An incremental service-latency ratio close to 1 is evidence against crediting generated SCO syntax for this benefit. Treat ratio tails, order effects and both arms' raw B/native values as part of the result; do not rely only on medians.

Reject the comparison if any arm fails to execute 112 original HMAC events per sample, has divergent expected output, lacks HTTP 200, or cannot independently prove B submitted during A's private work. Any observed strict B/native value over 2.5 is a per-workload budget veto, even if aggregate medians pass. A latency finding is not a summed CPU budget claim, source secrecy proof, same-account anti-relay guarantee, Sybil defense or universal browser compatibility result.

**No strong-protection release decision can be made from this experiment alone.** It is intended to remove an equal-trust attribution ambiguity, so future candidate selection can focus on genuinely different protection mechanisms.
