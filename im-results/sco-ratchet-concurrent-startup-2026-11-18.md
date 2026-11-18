# Windows cold-start lock failure in experimental SCO shared-SQLite ratchet

**Agent 41, 18 November 2026.** Intermediate operational negative, precommitted design. Tested code belongs to the *SCO transactional-ratchet experiment*, not to the general obfuscation AST pipeline. Do not promote this into `results/` as an obfuscation security result.

## Controlled original-replica start conditions

[Preregistered experiment](../workplace/sco-ratchet-concurrent-startup-preregister-2026-11-18.md) used [`sims/sco-ratchet-transactional-cold-start.js`](../sims/sco-ratchet-transactional-cold-start.js). Each trial launches two *actual independent Node processes* simultaneously, each constructing `TransactionalRatchet` with a shared **new local SQLite filepath**, 32-byte trusted HMAC root and genuine `createScoHandler` generated public ESM facade. Both workers have separate verified A/B test sessions. Every worker reaching ready must return anonymous source HTTP403 and authenticated source HTTP200 before its process is gracefully stopped; temp files are removed only after all known worker exits. A launch that terminates before ready is recorded with worker stderr instead of being ignored.

There are **eight fresh independent database trials** for each cohort: `cold` has no preexisting SQLite schema; `preinitialized` creates/checks the schema with the same `TransactionalRatchet` constructor, closes its handle, then concurrently starts the two workers. Startup and SQL setup are included. Each worker has a 15-second startup timeout. Unlike the earlier cancelled test that left orphan children, this dedicated harness uses `Promise.allSettled` and always reaps every successful worker.

## Exact two-platform source-pinned observation

[Focused manually dispatched workflow 44265170754](https://github.com/FlareZ123/obfs/actions/runs/44265170754) completed **successfully as an experiment** on both Ubuntu and Windows Node 22 at exact SHA **`330ce8d1076d332c178a16854153bdac8b5d3708`**. The strict implementation and external JSDoc checks passed; the preceding split-brain, shared transactional repair, actual two-server HTTP and killed-worker recovery tests also passed. The diagnostic recorded genuine failures as outcomes and correctly did not treat a failed server startup as a green *operational* verdict.

| Operating system | Database at simultaneous start | Trial pairs with both workers ready | Workers ready | Workers failed |
| --- | --- | ---: | ---: | ---: |
| Ubuntu | New, uninitialized | **8/8** | 16/16 | **0/16** |
| Ubuntu | Preinitialized, closed | **8/8** | 16/16 | **0/16** |
| Windows | New, uninitialized | **2/8** | 10/16 | **6/16** |
| Windows | Preinitialized, closed | **8/8** | 16/16 | **0/16** |

Every Windows cold-start failure was explicitly reported by the terminating worker as `Error: database is locked`, with stack rooted in `new TransactionalRatchet` at **`sims/sco-ratchet-transactional-store.js:72`**, which executes `this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;')` before creating tables. The original `DatabaseSync(databasePath,{timeout:30000})` did not prevent these errors. The failed work returned early, within a fraction of a second in the captured trials, rather than exhausting the 15-second launch timeout.

The evidence now identifies a **concurrent WAL-mode initialization conflict on the Windows runner** as the direct failing operation in these trials. It does not establish all reasons for that SQLite error, a general Windows SQLite defect, or a portable universal failure rate. The preregistered preinitialization control avoided all observed failures at this pinned source/runner. It is not yet a production multi-host startup solution.

## Same-source bounded retry follow-up

Before implementation, [the startup retry contract](../workplace/sco-ratchet-wal-startup-retry-preregister-2026-11-18.md) specified a **four-retry** `PRAGMA journal_mode=WAL` response only to the exact `database is locked` startup error, with initialization waits **25, 50, 100 and 200 ms**. Ordinary SQL errors still propagate, and failed constructor handles close. This changes no runtime HMAC or HTTP protocol. [Focused manual workflow 44266340561](https://github.com/FlareZ123/obfs/actions/runs/44266340561) passed **both** Node 22 Ubuntu and Windows strict JSDoc, baseline replay, real HTTP, killed-worker, cold-start and anonymous lock steps at exact SHA **`3a757bc2b55c3f11e670d52c8e4fcb4136af53d3`**.

The updated [cold-start script](../sims/sco-ratchet-transactional-cold-start.js) now runs **three** independently predeclared eight-trial cohorts per platform against fresh database paths. Both no-retry and retry modes are available in the same trusted worker constructor; the preinitialized control is separate:

| OS | Cohort | Two-worker successful trials | Successful workers | Workers failed |
| --- | --- | ---: | ---: | ---: |
| Ubuntu | Cold, **no** journal retry | 6/8 | 14/16 | 2/16, `database is locked` |
| Ubuntu | Cold, **four bounded retries** | **8/8** | 16/16 | **0/16** |
| Ubuntu | Preinitialized, four retries | **8/8** | 16/16 | **0/16** |
| Windows | Cold, **no** journal retry | 7/8 | 15/16 | 1/16, `database is locked` |
| Windows | Cold, **four bounded retries** | **8/8** | 16/16 | **0/16** |
| Windows | Preinitialized, four retries | **8/8** | 16/16 | **0/16** |

The zero-retry control reproduces a genuine SQLite busy failure on **both** operating systems in the follow-up; the original Windows-only observation was a finite sampling distinction, not evidence that Linux cannot fail. Four bounded retries and explicit preinitialization both survived all 16 concurrent trial pairs in this run, which supports a narrow *startup reliability improvement*. This does not establish a zero-failure population rate, prove resilience to prolonged lock storms or replace distributed schema migration coordination. Preinitialize/close a trusted SQLite WAL schema before simultaneously launching production workers when possible; SQLite's official [WAL documentation](https://www.sqlite.org/wal.html) confirms the journal mode persists across opened connections, and Node's [DatabaseSync documentation](https://nodejs.org/download/release/v22.23.0/docs/api/sqlite.html) documents the separate busy timeout option. The tested retry is bounded supplemental startup handling, not a replacement for a supervised bootstrapping phase.

## Causal interpretation and suggested admission policy

The failure occurs while several trusted server processes independently attempt to switch/create the same SQLite database's journal mode. This is prior to any authenticated HTTP request or protected HMAC work. Therefore no source secrecy, crypto or normal A/B state-transition claim changes. However, a load balancer that assumes all concurrently starting SCO instances become healthy may deliver requests to unavailable replicas, so **the experimental concurrent cold-start deployment contract fails on Windows**. A sequential application startup or an explicit trusted schema/WAL initialization phase is supported by the observed positive controls. An alternative bounded, narrowly targeted retry of startup `SQLITE_BUSY` may be evaluated separately before promotion, with original failures retained.

**Limitations:** Node built-in `node:sqlite` remains experimental, and CI OS/filesystem/runner scheduling are not controlled outside the pinned environment. Only 16 initial workers per condition were attempted on each OS; zero failures in the preinitialized control does not mathematically prove zero future failure probability. We did not test NFS/shared network drives, multiple hosts, power loss, disk corruption, deployment orchestration, client network RTT or the project's 2.5× compute budget. The earlier [cancelled Windows HTTP run 44262874924](https://github.com/FlareZ123/obfs/actions/runs/44262874924) showed `EBUSY` during temp-file cleanup with an unowned subprocess; its root cause was not captured then. The new trace is an independent, stronger diagnostic, not a retroactive proof of the precise earlier cause.

**Disposition:** preserve both working post-preinitialize and failing cold-start scenarios in intermediate evidence. Keep general obfuscator release blocked.
