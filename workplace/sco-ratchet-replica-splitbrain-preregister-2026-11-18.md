# SCO stateful ratchet: replica and restart admission preregistration

**Agent 41, 18 November 2026.** This protocol experiment is registered before implementing the test and examining its results. It targets the existing trusted-server SCO 8 MiB HMAC ratchet, in particular the strict per-principal state in `sims/sco-ratchet-batch-candidate.js` and the one-result retry cache in `sims/sco-ratchet-retry-candidate.js`. This is an availability/replay-admission investigation, not a new obfuscation algorithm or a universal security claim.

## Fixed threat and architecture

A single attacker controls an **authenticated A cookie** and can send unlimited HTTP requests to different legitimate replicas. Both trusted servers hold the **same private 32-byte root** and map the same A cookie to the same verified principal, as can happen after load balancing or authenticated server restart. The attacker cannot read the root or B's cookie and cannot modify the trusted server. Only the replica-local process state differs.

The experiment must compare a one-handler baseline with two completely independently instantiated trusted handlers, preserving the public facade and original private HMAC work. A is allowed to select its own valid challenge inputs. No artificial network delay, cross-account credential forgery, production TLS or database is assumed.

## Precommitted falsifiable predictions

1. **Single strict handler:** fresh batch `seq=0` succeeds, next `seq=2` succeeds, stale `seq=0` returns HTTP 403. Exactly four private HMAC events execute.
2. **Two strict handlers:** A sends `seq=0` to replica 1. Sending the next `seq=2` directly to untouched replica 2 is denied; repeating the *already committed* `seq=0` on replica 2 succeeds and repeats the same protected output because this replica's counter was never advanced. Both replicas perform the two HMAC events, whereas replica 1 rejects the stale request. A subsequent different `seq=2` on each replica is separately accepted, creating divergent per-replica state. Same root/principal are essential controls.
3. **One idempotent handler:** exact `seq=0` retry returns HTTP 200 with zero additional private events and one cache hit. After a later completed batch, old `seq=0` becomes invalid.
4. **Two idempotent handlers:** after replica 1 executes `seq=0`, the same exact request to replica 2 returns 200 but **executes** two additional HMAC events. Its cache cannot know about replica 1. A local retry to replica 1 still returns its own cached result without extra computation.
5. **Restart equivalent:** after a trusted process retires and a new handler instantiates with the same root and restored authenticated identity mapping, the previously committed `seq=0` request is re-admitted. This is a process-state failure, not loss of the private root.
6. Unauthorized missing-cookie requests must remain 403 everywhere. The public generated module must be retrievable only with a valid account and must not contain the private HMAC algorithm or root according to the same bounded source checks as the baseline.

The test must explicitly report each HTTP status, output parity, *per replica* private execution counts and retry cache hits. It must throw when any precommitted assertion is violated. A one-process passing result cannot establish shared cross-replica consistency.

## Disposition

A demonstrated split-brain rules out promoting this in-process ratchet/retry cache as a multi-replica or restart-safe replay defense. Recovery requires an authenticated, durable and linearizable per-principal state transition, ideally a transactional store paired with idempotent outputs; merely sharing the root or distributing a stable cookie is insufficient. This recommendation remains architectural until a separately validated design provides exact-once transitions across crashes and concurrent nodes. Preserve a strict distinction between HTTP service waiting and the prompt's 2.5x **compute** overhead.
