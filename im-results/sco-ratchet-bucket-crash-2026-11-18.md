# Fixed eight-bucket SCO SQLite WAL crash boundaries: cross-bucket state survives process kills

**Agent 41, 18 November 2026. Intermediate operational durability evidence.** [Preregistered hypotheses and stop criteria](../workplace/sco-ratchet-bucket-crash-preregister-2026-11-18.md), source pin **`0875dc83f22d455cafbd20cb98daea2bdc9ca38b`**. [Targeted Ubuntu/Windows Node22 + external strict JSDoc CI 44282872001](https://github.com/FlareZ123/obfs/actions/runs/44282872001) passed both OSes. Reproducer: [`sims/sco-ratchet-bucket-crash.js`](../sims/sco-ratchet-bucket-crash.js); exact pre/post-commit process-kill barrier from existing [trusted SQLite fault harness](../sims/sco-ratchet-transactional-crash.js) and [worker](../sims/sco-ratchet-transactional-crash-child.js).

## Setup

Eight separate SQLite WAL files were preinitialized and account file assignments determined by `HMAC-SHA256(root,"sco-bucket-v1\0" || trusted-principal)[0] & 7`. The trusted 32-byte root was sampled with bounded retry so **two distinct A test principals share a file** while an independent verified B principal maps to a **different** file. Root selection counts were preserved, with no claim of random multi-account collision frequencies. Real original 8 MiB/event HMAC inputs and outputs were compared with the original `createPrivateMachine`; one B two-event transition was committed before the injected failures.

The test launched two independent Node processes, killed each with an actual OS `SIGKILL` precisely when the child announced:

1. **Precommit barrier:** A-pre has written SQL row changes within its open transaction and finished protected HMAC work; it has **not COMMITted**. A fresh trusted connection after the kill must observe no A-pre committed event. Independent B's earlier committed transaction in another bucket must still be intact. A-pre may then legitimately retry and commit the exact original outputs.
2. **Postcommit barrier:** A-post's own two-event SQL transaction has been durably committed before its response is returned. A fresh trusted connection after the kill must recover its result as a **cached** retry, with **zero** additional private HMAC operations; altered retry inputs must be denied. B and A-pre data remain undisturbed.

Both A test principals intentionally map into the same bucket; B maps to another. The test uses precisely eight stored SQLite database files throughout. No host-controlled output of the private root or source is required.

## Actual Linux/Windows evidence

| Observation | Ubuntu Node v22.23.4 | Windows Node v22.23.4 |
| --- | --- | --- |
| Random roots sampled to get the fixture | 18 | 10 |
| A-pre bucket / A-post bucket / B bucket | 7 / 7 / 6 | 0 / 0 / 1 |
| Independent child killed at precommit barrier | Yes | Yes |
| A-pre state immediately after kill | seq 0, committed 0 | seq 0, committed 0 |
| B state after A-pre kill | seq 2, committed 2 | seq 2, committed 2 |
| A-pre replay after rollback | fresh, 2 original HMAC events | fresh, 2 original HMAC events |
| Independent child killed after A-post commit | Yes | Yes |
| A-post state recovered after kill | seq 2, committed 2 | seq 2, committed 2 |
| A-post exact retry | cached, **0** HMAC reexecutions | cached, **0** HMAC reexecutions |
| A-post modified replay | denied | denied |
| B final exact retry and state | cached, 0 executions, seq 2 | cached, 0 executions, seq 2 |
| Original HMAC output parity | All matched | All matched |

The injected OS process termination did not preserve a partially written SQL transaction, did preserve the postcommit cached outcome, and did not disturb the separately committed B WAL file in these source-pinned trials.

## Scope and decision

**Supported:** The already-tested SQLite transaction state engine retains its expected rollback-after-precommit-kill and durable cached-replay-after-postcommit-kill semantics when deployed in independent fixed account buckets, with B stored in another bucket. This is stronger *durability evidence for the multi-file topology* than a clean, graceful process restart alone.

**Not established:** An actual host power loss, torn sector/fsync hardware fault, concurrent process init of uninitialized WAL files, malicious symlink/file permissions, malicious server administrator with filesystem/root access, multi-host distributed durability, external transaction side effects or the universal 2.5× CPU budget. Under the SNO threat model the attacker owns the filesystem and memory, so these crash checks are no anti-tamper boundary. Account A still has an authorized online server oracle and the bucket topology does not prevent it from forwarding outputs to third parties. This report belongs in intermediate evidence, and the [primary release remains blocked](../results/README.md).
