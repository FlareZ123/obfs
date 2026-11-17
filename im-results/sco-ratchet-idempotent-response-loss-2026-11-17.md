# SCO account ratchet under response loss: idempotent last-batch repair

**Agent 41, 2026-11-17. Classification:** intermediate protocol compatibility/reliability result plus strict performance negatives. The [precommitted contract](../workplace/sco-ratchet-idempotent-retry-charter-2026-11-17.md) was written before implementation. This is a trusted-server SCO experiment with no COO/SNO confidentiality claim.

## Negative control: exactly-once execution vs lost response

The strict-state original is instantiated with actual `createScoHandler`, `createScoKeyedIsolation` and `makeServer` from [sims/sco-ratchet-batch-candidate.js](../sims/sco-ratchet-batch-candidate.js). A real HTTP attacker-operated proxy forwards an authenticated A batch of two HMAC operations, fully receives the upstream successful response, then intentionally returns HTTP 502 to its downstream client. This simulates a post-commit response loss without relying on an indeterminate race.

On both Windows/Ubuntu the original strict ratchet executed exactly **two** private events, the caller received **502**, and retrying the identical request at its original start sequence returned **403** with no additional private event. A robust client cannot distinguish an unexecuted operation from a committed operation whose result was lost using only that response. This is a protocol limitation despite correct replay-denial enforcement.

## Repair construction

[sims/sco-ratchet-retry-candidate.js](../sims/sco-ratchet-retry-candidate.js) keeps, on the trusted server, the last successfully committed batch per authenticated principal, comprising `start`, input-length, SHA-256 digest of the JSON argument list and an immutable-by-copy output array. It uses the same original private HMAC ratchet over 8,388,608 protected bytes per event. The generated public `batch` facade is still only 539 bytes, SHA-256 `44f39484cf0d5c52b38343d702e57050e88baa7eef7df61df715b103c242f326`, with no visible HMAC root or private helper according to bounded string checks.

For an exactly matching last request, the server policy returns the cached result without repeating private work. A modified same-sequence request is denied; any retry older than the most recent committed batch is denied. The per-principal queue serializes the admission check, transition and cache write.

At pinned [CI run 44153733792](https://github.com/FlareZ123/obfs/actions/runs/44153733792), exact SHA `fbb5ebe90bdde49a20966d662bf9cb6448df9c1d`, both Linux and Windows Node 22.23.4 passed main and external strict JSDoc, the old strict negative control, and the repaired protocol checks:

| Situation | Strict original | Repaired idempotent |
| --- | --- | --- |
| First batch commits, response discarded | Downstream HTTP 502 | Downstream HTTP 502 |
| Exact same request retried | HTTP 403 | HTTP 200, identical result |
| Extra private work on the exact retry | 0 new events | 0 new events |
| Modified arguments with old sequence | HTTP 403 | HTTP 403 |
| Two concurrent identical fresh batches | One 200, one 403 | Two 200, same response; one private execution |
| Old batch after newer commit | HTTP 403 | HTTP 403 |
| No authenticated cookie | HTTP 403 | HTTP 403 |

The repaired run counted **6 total HMAC events** (2 first A, 2 next A, 2 B), with **2 idempotent cache hits** (lost first response recovered and one concurrent duplicate). An independent B principal yielded different outputs from A for the same request. This is an exact-retry recovery contract, **not** rejection of all replayed responses; an authorized A user who knows the previous request may obtain its previous output again. SHA-256 digest collision resistance is a relevant assumption; the verified experiment did not model adversarial collisions or forged session credentials.

## Seven paired genuine-work timing samples per workload and OS

The cache is **never hit** in these timing trials: every measured RPC contains a fresh original 8 MiB HMAC per event. Native local and emitted HTTP perform the identical sequences. An artificial 25 ms delay is placed once per server RPC, not derived from real RTT.

| Batch events | Ubuntu zero delay | Windows zero delay | Ubuntu 25 ms | Windows 25 ms |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1.3788× (0/7 over) | 1.3804× (0/7 over) | 6.7816× (**7/7 over**) | 6.4876× (**7/7 over**) |
| 4 | 1.0877× (0/7) | 1.0949× (0/7) | 2.4507× (0/7) | 2.3528× (**1/7 over; max 2.5945×**) |
| 16 | 1.0242× (0/7) | 1.0267× (0/7) | 1.3623× (0/7) | 1.3314× (0/7) |
| 64 | 1.0057× (0/7) | 1.0132× (0/7) | 1.0920× (0/7) | 1.0866× (0/7) |

Cells show median paired remote/native ratio and strict over-2.5× paired sample count. All 16- and 64-event candidate samples across two delay modes and two OSes met the strict threshold. Single-event 25 ms workloads violate it on both OSes. A measured 4-event Windows overbudget observation prohibits endorsing that scope despite a passing median.

## Scope and next evidence

- Cached responses remain available for only the immediately previous batch, a bounded last-result policy. Later retries after intervening state advancement are intentionally denied. This can still surprise a client delayed by another authorized A operation.
- Multiple clients sharing the same principal are subject to each other's state advancement and possible state-consumption denial. The successful [same-A live relay attack](sco-ratchet-tls-batch-budget-2026-11-17.md) remains valid. A holder of B's credential also has B authority.
- The artifact is a research simulation; it is **not** wired as a default production feature in `src/`. The trusted-account identity map and private key are in process memory, and no persistent multi-worker database transaction, restart recovery, eviction, revocation, real browser client startup or remote TLS measurement is covered.
- This result is about request-level consistency and performance. It does not create offline source secrecy for public code or prove unbounded attacker resistance.

**Decision:** Retain as a candidate for trusted SCO workloads whose operations are naturally large and batched. Prefer the idempotent protocol over strict replay-only behavior for uncertain-response recovery, while keeping both active online-relay and <2.5× short-session conditions explicit. More operational evidence is needed before implementation promotion.
