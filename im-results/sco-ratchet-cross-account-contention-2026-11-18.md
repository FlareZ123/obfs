# Authenticated A CPU contention invalidates isolated B session budget on synchronous SCO Node server

**Agent 7, 18 November 2026 UTC. Status:** intermediate, bounded cross-account latency attack; precommitted [charter](../workplace/sco-ratchet-cross-account-contention-charter-2026-11-18.md). This is a server-capacity weakness of the tested implementation, independent of public-source obfuscation or private-key extraction.

## Architecture and adversary

The existing [SCO ratchet batch simulator](../sims/sco-ratchet-batch-candidate.js) runs the real `createScoHandler` with `createScoKeyedIsolation` (maximum 16 pending per principal and 32 globally), verified session cookies, exact per-account state sequences and a synchronous server-private HMAC-SHA256 operation processing **8,388,608 bytes per event**. A and B use distinct randomly granted verified principals; a shared 256-bit root key remains server-only. Each private method and HTTP response is checked against a separate native original machine with identical account-specific inputs.

The attacker controls **only its own legitimate Account A** and starts one valid **64-event** operation (512 MiB of server-side HMAC input). In the middle of A's accepted synchronous batch on a single Node event-loop thread, a genuine **independent Node B child process** submits one fully valid Account B **16-event** HTTP batch (128 MiB server-side work). A test-only callback at entry to A's private batch publishes a tiny local file through same-directory write-then-rename. The B child polls for that complete signal before submitting. Two cross-process `process.hrtime.bigint` timestamps check B's actual submission occurred after A private execution started and before it ended. A private-end timestamp is obtained by another test-only observer. The observer callbacks do not authorize operations or alter existing server policies, and default to absent in ordinary simulator runs.

The quiet control sends the same 16-event HTTP workload without A contention both from the ordinary parent and from a separately launched **cold independent B child process** with the same first-fetch path as the loaded B child. The latter isolates child `fetch` startup from server contention. The native comparison separately executes the original 16-event private HMAC sequence in process. Quiet and loaded calls use unique but equivalent account-specific session state, preventing prior-consumption artifacts. Seven trials are run on each platform, with no injected delay or TLS. The test asserts native output parity, 200 responses for every authorized call, exact B submission overlap and **784** executed private events per platform: seven rounds of 16 parent-quiet + 16 cold-child-quiet + 64 A + 16 B.

Executable components: [sims/sco-ratchet-cross-account-contention.js](../sims/sco-ratchet-cross-account-contention.js), [independent child](../sims/sco-ratchet-cross-account-worker.js), test-only hooks in [sims/sco-ratchet-batch-candidate.js](../sims/sco-ratchet-batch-candidate.js). The atomic file is merely a scheduling signal between test processes; it is unrelated to the protected application's storage.

## Pinned Linux and Windows observation

[GitHub Actions 44206143926](https://github.com/FlareZ123/obfs/actions/runs/44206143926) succeeded on Node **v22.23.4** Ubuntu and Windows at exact source SHA `12d8ac0e797bedc9ee8ff5c7596cdb1d0f66985e`, including strict main/external JSDoc, all ratchet compatibility/attacker regressions, TLS, and real Chromium tests. Ubuntu job ID `134472465382`, Windows job ID `134472465510`. Raw output marker: `SCO_CROSS_ACCOUNT_CONTENTION`.

| Metric | Ubuntu | Windows |
| --- | ---: | ---: |
| Verified B-over-A work timing overlap | 7/7 | 7/7 |
| Exact original output parity, authorized HTTP 200 | 7/7 | 7/7 |
| B/native strict ratios over 2.5× under A work | **7/7** | **7/7** |
| Matched cold child B/native strict ratios over 2.5× with no A | **0/7** | **0/7** |
| Median B/native under A load | **5.10363×** | **5.06587×** |
| Maximum B/native under A load | 5.13012× | 5.10784× |
| Median matched quiet child B/native | 1.44098× | 1.54834× |
| Median parent quiet B/native | 1.05428× | 1.04894× |
| A private CPU busy per event batch, typical | ≈376 ms | ≈342 ms |

**All 14/14 loaded B sessions strictly violate 2.5×**, despite passing exact output and account authorization checks. All 14/14 matched quiet cold-child B sessions were below 2.5×. No unauthenticated request was needed. The per-principal FIFO isolates state order but does not preempt CPU-heavy synchronous work on the one shared event loop. A 64-event A batch consumes enough main-thread compute to delay admission and completion of an unrelated authorized B batch.

Complete raw pairs in trial order, each record is `native B ms / matched quiet child B ms / loaded B ms / loaded B:native ratio / A private busy ms`:

| Trial | Ubuntu | Windows |
| ---: | --- | --- |
| 1 | 94.68135 / 136.82477 / 478.81099 / 5.05708× / 376.34953 | 88.32380 / 132.43960 / 425.22510 / 4.81439× / 341.12960 |
| 2 | 93.34057 / 134.39098 / 478.84813 / 5.13012× / 377.64114 | 85.67230 / 132.12760 / 434.91630 / 5.07651× / 342.42450 |
| 3 | 93.17949 / 134.37319 / 477.30641 / 5.12244× / 376.86358 | 85.34030 / 132.69940 / 428.03750 / 5.01565× / 344.14400 |
| 4 | 93.13071 / 134.19992 / 476.65429 / 5.11812× / 376.17705 | 84.98900 / 132.17010 / 434.11060 / 5.10784× / 342.25790 |
| 5 | 93.55038 / 135.44251 / 476.56285 / 5.09418× / 375.67148 | 85.26950 / 132.02590 / 434.85120 / 5.09973× / 341.50640 |
| 6 | 93.05199 / 132.71054 / 474.27247 / 5.09685× / 374.95997 | 85.07280 / 133.38160 / 430.96800 / 5.06587× / 342.05040 |
| 7 | 93.19662 / 132.38497 / 475.64148 / 5.10363× / 376.26713 | 86.83340 / 132.39600 / 434.65010 / 5.00556× / 342.44810 |

The first [red CI 44205757031](https://github.com/FlareZ123/obfs/actions/runs/44205757031) failed at strict JSDoc because Node's optional IPC `process.send` was not narrowed. This was a tooling failure before any contention trial; the corrected green source above includes explicit IPC narrowing plus the separate cold B control. Do not cite the red run as a latency measurement.

## Threat and performance decision

The tested **single-thread, synchronous private-work SCO** architecture lacks cross-account CPU scheduling isolation. Verified A requests can induce **strict B end-to-end compute-budget violations** despite a bounded number of pending requests per principal and correct B authorization. The experiment uses only one legal A operation per trial and verifies B's attempt occurred inside A's private-work interval. It follows that this configuration cannot claim an unconditional per-account 2.5× latency bound under the supplied unlimited legitimate A-request attacker model.

The finding does **not** show Account B key extraction, credential compromise, changed private outputs, access-control bypass, or novel static deobfuscation. It is a resource-contention attack in the server runtime. It uses local HTTP and a deliberately heavy 8 MiB HMAC batch, without realistic WAN/TLS scheduling, distributed gateways, worker pools, CPU scheduling isolation, quota-based admission control or multiple Node processes. Independent worker threads/processes with per-principal service budgets could alter this conclusion and require their own measurements. The ratios are paired observations for this workload, not universal performance bounds. Source-only and hostile-runtime attacks remain independently constrained by their own models.

**Decision:** Unsupported as a strictly <=2.5× B session under adversarial A load in the current synchronous Node server. Preserve the genuine 14/14 negative result and prioritize independent per-tenant CPU isolation or admission-cost quotas in any production-strength SCO release claim. This remains in `im-results/`, not `results/`.

## 18 November 2026 matched conventional-server correction

The original 14/14 B/direct-native >2.5× observation, authorization, source pin and B-inside-A timing witness remain reproducible. **It is a service-latency/capacity observation, not a causal measurement of obfuscation overhead.** A subsequent [independent conventional authenticated Node HTTP control](sco-ratchet-equal-trust-contention-2026-11-18.md), run [44241742989](https://github.com/FlareZ123/obfs/actions/runs/44241742989), performs the same private HMAC original, authenticated 64A/16B work, real independent child client and overlap proof without the generated SCO facade. Both conventional and generated arms showed 14/14 absolute B/direct-original ratios above 2.5×, while paired generated/conventional loaded B medians were **1.00115× Linux / 0.98054× Windows**, with **0/14** incremental ratios above 2.5×. Agent 1 requested precisely this equal-trust loaded control. The data support a generic single-event-loop scheduling limitation of the tested architecture; do not cite the old 5× absolute ratios as compiler-specific penalties. Separate short-RPC native/protected CPU budget failures remain untouched.
