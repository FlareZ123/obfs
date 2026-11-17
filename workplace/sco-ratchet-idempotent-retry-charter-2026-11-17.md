# SCO stateful ratchet: uncertain-response loss and idempotent retry candidate

**Agent 41, 2026-11-17. Precommitted reliability/security experiment.** This is a *new, distinct* protocol design for the trusted-server SCO backend; it preserves the same protected HMAC computation and per-account identity boundary. It does not alter COO/SNO full-control claims or make online forwarding of an A credential impossible.

## Predicted failure of strict next-sequence policy

The current strict ratchet accepts the next contiguous batch exactly once, updates server state, and thereafter returns 403 on an identical replay. If a browser/client loses the first successful **response** after server commit, the authenticated caller cannot safely determine whether the private state changed. Repeating the same request gets 403 even though the server executed it, causing a recovery/observational-parity problem. An attacker-operated proxy can deterministically simulate this by forwarding the first authorized request, reading the complete upstream result, then returning HTTP 502 to its downstream caller. This negative control must demonstrate **exactly one private state update followed by a rejected retry**, without a compromised server.

## Idempotent repair hypothesis

A trusted-server, per-verified-principal cache of the **last completed batch** stores its starting sequence, SHA-256 argument fingerprint and immutable response. On a repeated request with *exactly the same sequence and inputs*, the authorized server returns the cached result with zero additional private HMAC executions. A same-sequence request with modified inputs fails 403; an older request after a later successful batch fails 403. The authorization check, cache comparison and original private batch execution must all run under the already provided principal-specific isolation scope. One principal's cache is never usable by another principal. If concurrent duplicates arrive, exactly one performs the private work and both receive identical successful outputs, with the replay tagged as a cache hit. This is intentional idempotent replay, separate from the strict replay-denial property.

An idempotent retry can improve consistency without increasing the server's authority to authenticate a user. The A credential holder can still replay known A outputs and relay fresh A requests to outsiders; a B credential holder can do the same for B. The root key remains private and the actual published ESM facade remains small.

## Test and performance contract

1. Freeze original generated-source SHA, account-root seed scope, 8 MiB HMAC per private event, and all HTTP error responses.
2. Demonstrate strict original ratchet's lost-response failure through an actual two-hop proxy with a 502 downstream, then 403 retry.
3. Demonstrate repaired one-entry cache with the same proxy: initial downstream 502, exact next retry 200 with original correct result, unchanged private execution count; modified replay 403, no cache cross-account, and one concurrent duplicate batch performs private work only once.
4. Measure seven paired in-process native and idempotent HTTP batch sessions at 1/4/16/64 events and both 0/25 ms per-request delay on Linux/Windows. Report **all** strict >2.5× pairs. Timing an idempotent cache-hit must be separate from HMAC genuine-work timing; reusing a cached response to make the budget look better is prohibited.
5. An attacker with valid A credentials can still fully relay A online. Neither the cache nor a reconnect handshake is an anti-cloning security mechanism.

**Reject:** cache hit for modified args, cross-account response disclosure, extra protected executions on an exact retry, a silent new-state advance after a failed policy, or a claimed universal 2.5× performance bound with any strict violating observed pair. The cache has one-entry retention; delayed retries after further state advancement are unsupported by design. A real network loss is not required for this deterministic proxy-loss negative control, and no deployment claim follows without external transport/browser tests.
