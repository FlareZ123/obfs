# SCO stateful ratchet: live relay and state-consumption counterfactual

**Agent 41, 2026-11-17. Experimental security candidate adversarial falsifier.** This is a *negative* test on the identical account-bound private stateful HMAC ratchet, not a new obfuscation backend.

## Precommitted question

Given an attacker who possesses one legitimate Account A credential and has unrestricted access to the published SCO RPC facade, can the attacker build an unauthenticated third-party service that forwards requests to the trusted server and thereby clones the *entire stateful A operation*, without recovering source or key? This is expected to succeed despite per-account authorization and replay rejection. A client who can legitimately consume A's next sequence may also cause an honest independent A client to receive stale-sequence refusals. This is an intended threat-model control and a risk of fixed-next-sequence protocols, not an unexpected authorization bypass.

## Protocol and attack rules

Use the same 256-bit server root, independently mutable account ratchets, actual generated `batch` facade, real `createScoHandler` and `createScoKeyedIsolation`, and one HMAC-SHA256 over the same private 8 MiB work buffer per event. The trusted server exposes exactly authorized RPC methods with Account A and B cookies mapped to verified principals.

An attacker-controlled local HTTP server receives anonymous downstream batch calls, attaches only A's valid cookie to an actual trusted-server RPC, and relays the full status and body. It must never see B's cookie, the HMAC key or original state. The defender receives only the actual emitted public facade and its own valid A session. Freeze 32 previously unqueried sequential calls with 1 to 4 inputs per batch, compare every A result with an independent native A reference, compare their B-account equivalents and observe whether A's result ever predicts B's. Check replay denial, direct no-cookie denial, and cross-account noninterference. The untrusted downstream client must succeed 32/32 for A despite having no direct trusted-server credential. Its unapproved direct connection must return 403. Use a separately exercised B-only account as a negative control.

## Workload and rejection criteria

Measure seven paired in-process native, direct A RPC, and two-hop attacker relay sessions on the same 16-event HMAC workload, alternating order and using separate principals to avoid cross-variant state interference. Count every strict observed >2.5× pair and keep whole-session HTTP costs; localhost timings are a lower-bound test of network. Exact emitted source SHA, runnable script and results must be pinned. No assumption that A is kept from relaying A is permissible.

The candidate fails as an anti-functional-cloning architecture if **any** live A relay obtains fresh outputs; the expected result is full same-account live replication. A/B isolation remains a distinct positive property, and no output for B should be derivable from only A responses under these sampled inputs. Any B leakage, replay bypass, or unauthorized state advancement is a security failure. A large speedup in a batch cannot reverse the anti-cloning negative verdict. The policy provides server-controlled audience authorization only, not a guarantee against cooperative account proxying.
