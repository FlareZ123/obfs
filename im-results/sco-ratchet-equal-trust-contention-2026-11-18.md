# Equal-trust original-HTTP control revises the meaning of SCO cross-account CPU contention

## Stronger alternating-order, same-key follow-up: current preferred evidence

[Two-platform CI run 44242830530](https://github.com/FlareZ123/obfs/actions/runs/44242830530) passed on **Ubuntu and Windows Node v22.23.4** with both strict JSDoc gates, exact 200/native output and 7/7 B-submits-during-A proofs **in each server arm on each OS**, at immutable SHA `bfb38c074302396496c4cc2ffec92a68103c7545`. Ubuntu job `134594575468`; Windows job `134594575162`.

This run improves the first measurement: it executes **seven one-trial conventional/generated pairs with alternating arm order** (conventional-first trials 1,3,5,7; generated-first trials 2,4,6). Each pair uses the **same newly random 256-bit private root** for both arms, and each arm gets a fresh server, independent verified A/B principals, an idle cold B child, and a real A-overlapped cold B child. Total original private work is unchanged at **784 HMAC events per arm per platform**. Direct-original and quiet controls are retained. The first run's fixed-order samples remain preserved below as historical evidence; the current executable implements this crossover instead.

| Current crossover measure | Ubuntu | Windows |
| --- | ---: | ---: |
| Conventional loaded B/direct-original median | **5.10495×** | **4.88923×** |
| Generated SCO loaded B/direct-original median | **5.09785×** | **5.11984×** |
| Strict loaded/direct-original >2.5×, conventional | 7/7 | 7/7 |
| Strict loaded/direct-original >2.5×, generated SCO | 7/7 | 7/7 |
| Matched quiet child B/direct-original strict >2.5× | 0/7 in both arms | 0/7 in both arms |
| Actual A/B monotonic timing overlap and exact outputs | 7/7 in both arms | 7/7 in both arms |
| **Generated loaded B / conventional loaded B median** | **0.99993×** | **1.00362×** |
| Strict incremental generated/conventional >2.5× | **0/7** | **0/7** |

Raw paired incremental generated/conventional loaded B ratios, in order (further digits are available in CI log marker `SCO_EQUAL_TRUST_CONTENTION`):

| Trial | Ubuntu | Windows |
| ---: | ---: | ---: |
| 1 | 0.99903× | 0.89932× |
| 2 | 0.98785× | 1.00362× |
| 3 | 1.00399× | 1.05546× |
| 4 | 0.99678× | 1.02617× |
| 5 | 1.00642× | 0.99551× |
| 6 | 1.00155× | 0.98888× |
| 7 | 0.99993× | 1.09962× |

**Current conclusion:** the observed roughly fivefold *loaded service / unloaded direct original* slowdown arises on both equally trusted implementations. Under actual A load, there is **no measured strict >2.5× incremental generated SCO / conventional service** breach in 14 cross-platform pairs. The matched crossover is stronger evidence against attributing the absolute queueing penalty to obfuscation than the first non-counterbalanced run. It is still a limited localhost single-event-loop experiment; notably Windows paired ratios range from 0.89932× to 1.09962×, so no sub-percent difference should be interpreted as an advantage. No generalized service fairness, transport parity for arbitrary input, or release-ready compute guarantee follows.

---

### Historical original fixed-order measurement (superseded by crossover above)


**Agent 7, 18 November 2026 UTC. Evidence class:** bounded adversarial two-platform differential, reproducible and **not** an academically established obfuscation defense. The previous 14/14 A-contended B/quiet-native strict 2.5× violations remain genuine observations. This test adds the missing **equally loaded unobfuscated HTTP server** control before attributing the delay to the compiler.

## Reproduction and source pin

- [GitHub Actions run 44241742989](https://github.com/FlareZ123/obfs/actions/runs/44241742989) **passed both Linux and Windows jobs** at exact executable SHA `e61237a2a4e85f76339368416c0776a645bcf069` with Node **v22.23.4** and strict main/external JSDoc. Job IDs: Ubuntu `134591046375`, Windows `134591046096`.
- Run `node sims/sco-ratchet-equal-trust-contention.js` against installed repository dependencies. The independent B process remains `sims/sco-ratchet-cross-account-worker.js`; both arms share `sims/sco-ratchet-boundary.js`'s **actual original private machine**, 8 MiB HMAC per event.
- New workflow `.github/workflows/manual-sco-equal-trust-contention.yml` pins the source through checkout. Output marker: `SCO_EQUAL_TRUST_CONTENTION`, with 14 complete raw trial objects for each OS.

## Matching design

The **conventional** arm is a separately implemented bare `node:http` JSON RPC service, with a private server-resident 256-bit root and the same session-cookie format, private machine, per-principal state progression, input verification, message shape, 64-event Account A request, and 16-event Account B request. The **generated** arm calls the production `createScoHandler` and keyed isolation through `makeServer` with identical original HMAC work. Neither publishes the private key/source to the B or A client; A and B have independent valid random credentials. No artificial network delay is added.

Each arm performs seven trials, each with a direct native in-process 16-event B timing, a quiet **independent cold B process** performing real HTTP, and a freshly launched independent B process whose HTTP attempt is triggered by a private work-entry marker while A processes 64 events. A and B responses are individually validated against new exact original-machine values; requests must return HTTP 200 and the B process's monotonic request time must fall strictly inside A's private start/end timestamps. Exactly 784 real private events are executed per arm, per platform. Both arms use localhost Node HTTP, the same child request program and the same HMAC algorithm.

This is a *same-trust, same-work and same-load* control for **incremental SCO overhead**. The direct B/original ratio compares a loaded service to an unloaded in-process computation and consequently measures broader resource contention; the same metric can fail in ordinary Node.

## Pinned observations

| Measure | Ubuntu | Windows |
| --- | ---: | ---: |
| Conventional B/direct original median | 5.09520× | 5.06207× |
| Generated SCO B/direct original median | 5.11405× | 4.94844× |
| Conventional B/direct original strict >2.5× | 7/7 | 7/7 |
| Generated SCO B/direct original strict >2.5× | 7/7 | 7/7 |
| A/B real-clock overlap, conventional | 7/7 | 7/7 |
| A/B real-clock overlap, generated | 7/7 | 7/7 |
| **Generated loaded B / conventional loaded B median** | **1.00115×** | **0.98054×** |
| Generated/conventional strict >2.5× | 0/7 | 0/7 |
| Median conventional loaded B elapsed | 369.57370 ms | 378.50540 ms |
| Median generated loaded B elapsed | 369.57692 ms | 369.60830 ms |

All 28 protected-or-conventional loaded B/original measurements are over 2.5× across the two OSes, with complete original output parity and verified A/B overlap. The new incremental generated-versus-conventional measured ratios are near 1× and none of the 14 pairs exceeds 2.5×. The actual loaded B delays are therefore **not observed to be caused by the compiler or generated facade** in this matched model.

Full independent paired trial ratios:

| Trial | Ubuntu generated/conventional loaded B | Windows generated/conventional loaded B |
| ---: | ---: | ---: |
| 1 | 1.00308× | 0.98054× |
| 2 | 1.00582× | 0.99016× |
| 3 | 1.00115× | 0.99260× |
| 4 | 1.00177× | 0.97043× |
| 5 | 1.00066× | 1.03953× |
| 6 | 0.98622× | 0.97235× |
| 7 | 0.99808× | 0.96550× |

## Decision, scope and limitations

The previous [ratchet contention witness](sco-ratchet-cross-account-contention-2026-11-18.md) is correct **as a denial of per-principal latency isolation in an overloaded single-threaded deployment**. Its strict B/native original runtime threshold should **not** be interpreted as proof that obfuscation itself adds fivefold runtime. The conventional equal-trust service experiences the same legal-A event-loop stall. This repairs the causal claim that was not identified by the earlier quiet-child control, as [Agent 1's matched-native request](../communications/agent7/20261118T0113Z_agent1_matched-native-contended-control.md) highlighted.

This experiment is limited: the seven conventional trials precede seven generated trials rather than using an alternating crossover order; both modes are freshly initialized in the same test process; TLS/WAN, multi-worker serving, CPU throttling, cold server launch, large populations and request-serialization parity across arbitrary JSON are unmeasured. Some body parser/policy implementation details differ even though all valid sampled requests have identical syntax and output. A literal 2.5× universal compute-time guarantee remains unsupported by short SCO calls, and an equally trusted conventional server provides no stronger online anti-relay protection than generated SCO.

**Refined decision:** mark the synchronous ratchet service as *capacity/fairness-limited under an authenticated A burst*. Treat this as a runtime deployment risk shared with a conventional service, independent of obfuscation-specific compute-overhead assessment. The paired ratio evidence supports **no measured incremental SCO client/server slowdown over the same loaded conventional service** for this precise 64A/16B HMAC population. A future worker isolation claim requires a same-load conventional control and an independent A/B challenger, rather than interpreting absolute latency as a compiler penalty.
