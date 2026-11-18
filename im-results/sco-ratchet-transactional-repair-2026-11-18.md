# Trusted SCO ratchet: shared local transaction, real HTTP and killed-worker recovery

**Agent 41, 18 November 2026. Classification: intermediate engineering proof-of-concept, with a strict performance failure in a sampled short-work session.** This implementation repairs the [tested split-brain failure](sco-ratchet-replica-consistency-2026-11-18.md) for independently executing trusted servers sharing **one functioning, local SQLite WAL file**. It does not create stronger public-code source secrecy, prevent authorized same-account online relaying, establish multi-host consensus, or satisfy a universal 2.5× compute limit.

## Precommitted claims and artifacts

Three separate plans were committed *before* executing their respective test additions: [transactional-state repair](../workplace/sco-ratchet-transactional-repair-preregister-2026-11-18.md), [actual SCO HTTP integration](../workplace/sco-ratchet-transactional-http-integration-preregister-2026-11-18.md), and [killed-process SQL-boundary recovery](../workplace/sco-ratchet-sqlite-crash-injection-preregister-2026-11-18.md). Original input is the prior exact 32-byte-root ratchet with an **8,388,608-byte HMAC update per event**. The published client is still the real compiler-generated 539-byte `batch.mjs`, source SHA-256 `44f39484cf0d5c52b38343d702e57050e88baa7eef7df61df715b103c242f326`. No substituted lightweight dummy algorithm is used.

Reproduction sources:
- [`sims/sco-ratchet-transactional-store.js`](../sims/sco-ratchet-transactional-store.js): `TransactionalRatchet` on experimental Node `node:sqlite` `DatabaseSync`, WAL, `synchronous=FULL`, `BEGIN IMMEDIATE`, per-principal ratchet state and last-result cache, private-root SHA-256 startup commitment; one transaction for state check, private HMAC computation, committed result.
- [`sims/sco-ratchet-transactional-repair.js`](../sims/sco-ratchet-transactional-repair.js) with [independent child](../sims/sco-ratchet-transactional-child.js): persistent connection restart, wrong-root refusal, A/B separation and two competing Node child processes on the same database file.
- [`sims/sco-ratchet-transactional-http.js`](../sims/sco-ratchet-transactional-http.js) and [trusted HTTP child](../sims/sco-ratchet-transactional-http-child.js): two actual independent Node processes, each using `createScoHandler`, generated public ESM facade, authorization policy, and `runRpcIsolated`; SQL writer admission begins **before** policy, and private transaction commits **before** the HTTP response.
- [`sims/sco-ratchet-transactional-crash.js`](../sims/sco-ratchet-transactional-crash.js) and [fault worker](../sims/sco-ratchet-transactional-crash-child.js): two independent OS-killed workers, with a trusted test-only callback *after* row upsert but *before* SQL commit, plus another worker killed *after* commit before returning a result.

These scripts are included in strict external JSDoc checking and the manual two-platform ratchet CI; [focused manual transaction workflow](../.github/workflows/manual-sco-transactional.yml) avoids rerunning unrelated security experiments when targeting this boundary.

## Correctness evidence: full prior two-platform integration

The [manual two-platform full ratchet run 44263552971](https://github.com/FlareZ123/obfs/actions/runs/44263552971) passed Ubuntu/Windows Node **22.23.4**, both JSDoc configurations and all existing ratchet/browser steps at source SHA **`4cb0b6ddcbecb0b7f012f9e63c1150fac1d11921`**. Both platforms emitted the same structural correctness conclusions:

| Test | Actual observation | Scope |
| --- | --- | --- |
| Separate SQLite connections, identical A sequence/inputs | `fresh`, `cached` | Two committed HMAC events total, correct original outputs |
| Separate connections, modified already used sequence | `denied` | No new committed A events |
| Next A sequence then old retry | `fresh`, `denied` | A committed count four |
| Close every connection and reopen same path/root | Latest `cached`, old `denied` | Committed count remains four; wrong root rejected |
| Two separately launched child processes, same pending inputs | One `fresh`, one `cached` | Two total committed events |
| Two child processes, different competing inputs | One `fresh`, one `denied` | Two total committed events, winner matches original |
| Two independent **real SCO HTTP server processes**, concurrent identical A batches | HTTP **200, 200** | Only two HMAC events committed |
| Same HTTP processes, concurrent different A batches | HTTP **200, 403** | A total committed state reaches four |
| Stale requests through either HTTP process | HTTP **403, 403** | No new committed events |
| Exact current retry on other HTTP process | HTTP **200** | Cached original output, no extra protected work |
| Distinct verified B account | HTTP **200** | Independent two-event state and original B output |
| Gracefully stop both HTTP processes and start a third | Latest retry HTTP **200**, old retry HTTP **403** | Four A events remain committed |
| Missing session, A forging a B policy argument | HTTP **403** | No authorization bypass measured |
| Killed worker after SQLite upsert but before `COMMIT` | Reopen: zero preexisting committed events; original retry `fresh` | Uncommitted data rolled back |
| Killed worker after `COMMIT` but before reporting result | Reopen: two committed events; exact retry `cached`, modified retry `denied` | No new HMAC work on cached retry |

The public facade remained identical across HTTP workers, with native HMAC output parity. This is concrete improvement over the independent in-memory handlers, which had accepted the same A sequence twice and diverged across replicas. It does not demonstrate a server being compromised or an attacker forging another account.

## CPU and wall-clock samples for the local storage engine

The same run measured **seven fresh original-HMAC pairs per batch size per operating system**, count 1, 16 and 64. Each ratio below compares the new local SQLite state-engine batch against the exact original in-process HMAC, without HTTP browser, startup or network cost. The code alternates native/stored sample order across trials. An exact cache hit is **not** used for these timed fresh-computation samples.

| New private events | Ubuntu median CPU / valid | Ubuntu median wall / strict >2.5× pairs | Windows median CPU / valid | Windows median wall / strict >2.5× pairs |
| ---: | ---: | ---: | ---: | ---: |
| 1 | **1.05223×, 7/7** | **1.12399×, 0/7** | **inconclusive, 0/7 valid** | **1.92069×, 1/7** |
| 16 | **1.01298×, 7/7** | **1.01921×, 0/7** | **1.01282×, 7/7** | **1.04981×, 0/7** |
| 64 | **1.00331×, 7/7** | **0.99970×, 0/7** | **1.00000×, 7/7** | **1.01584×, 0/7** |

The Windows one-event wall-clock sample reached **2.56319×** (a *strict* observed breach), despite the lower median. Windows `process.cpuUsage()` quantized one-event native and/or candidate values to zero, so the revised report records **null CPU ratios, zero valid CPU pairs**, and an **inconclusive CPU budget** for that specific short-work category. The previous version erroneously treated division by zero as infinity and reported three apparent CPU breaches; this was corrected in `sims/sco-ratchet-transactional-repair.js`. **Zero observed CPU breaches among zero valid CPU samples is not a pass.** The browser/RPC/client CPU and realistic network costs are unmeasured for this storage implementation. A single wall breach is an operational performance veto for the sampled one-event Windows workload, and the universal compute limit remains unproved.

The storage engine holds a **global SQLite writer lock** while performing each private HMAC batch. This serializes otherwise unrelated A and B writes and may produce cross-account head-of-line blocking or denial under unlimited legitimate A submissions. A more expensive transaction may satisfy a compute ratio while exceeding an interactive service-latency requirement. Neither can be hidden by reporting only large-batch medians.

## Windows startup observation and provenance boundary

An earlier integrated source [run 44262874924](https://github.com/FlareZ123/obfs/actions/runs/44262874924) passed the Ubuntu new HTTP stage but was **cancelled** after its Windows HTTP step emitted `EBUSY` unlinking the SQLite file during cleanup, leaving a child process active. This is a test/deployment startup-and-cleanup failure distinct from the demonstrated transactional policy. That version launched both schema-initializing workers concurrently and registered them for cleanup only after `Promise.all` resolved. The worker launcher was changed to start and register each trusted HTTP worker sequentially in [commit `285e45497a015ade51ff15e33ee2c7ecfff2b025`](https://github.com/FlareZ123/obfs/commit/285e45497a015ade51ff15e33ee2c7ecfff2b025). The source-pinned green run above predates this reliability adjustment; subsequent integrated validation must establish it separately. Do not treat the cancelled Windows result as success or infer the exact low-level cause of the worker startup failure from the cleanup exception alone.

## Security and deployment decision

The added boundary is a **trusted single-host transactional database** and account verification. The HMAC root and private source remain server-resident under SCO assumptions. The legitimate A credential holder still has an online oracle for all authorized A outputs; session theft/cooperation permits equivalent B access. A disk/root compromise, multi-host split brain, SQLite corruption or database unavailability lies outside these tests. `DatabaseSync` is experimental Node 22 API; synchronous busy waiting can block the Node event loop. The lock isolates state under the shared file, yet it is not a scalable multi-tenant throughput/fairness solution. The fault injection kills actual Node child processes, while **machine-level power loss and nontransactional external effects remain untested**.

**Result:** retain this as a validated protocol-correctness prototype with explicit strict performance failures and operational unknowns in `im-results/`. **Do not promote to `results/`** or declare the primary obfuscator release ready without a same-trust, source-pinned adversarial and whole-session evaluation. The fix is generic server transactional design, not an independently demonstrated obfuscation-strength advantage.
