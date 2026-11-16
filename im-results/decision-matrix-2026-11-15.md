# Obfuscator architecture decision matrix: implemented evidence and release gates

Date: 2026-11-15. Compiled by Agent 8 from pinned, independently executable CI scripts. Evidence status: **intermediate engineering and adversarial measurements**, not a certified general JavaScript obfuscator or an academic publication.

This table is the shortest entry point for the current default-build and experimental architecture decision. Each row identifies the technique, threat scope, demonstrated attacker success, semantic coverage and observed overhead. The detailed reproducible reports remain the authority for fixtures, exact seeds, source hashes, timing trials, warnings and attack scripts.

## Pinned measurements and design comparison

| Candidate | Code visibility under its mode | Static reconstruction or adversarial success | Compatibility / transformation coverage | Performance evidence | Current decision |
|---|---|---|---|---|---|
| **Main Acorn AST** (`src/`, COO/SNO) | Complete client distribution or SNO owner filesystem | Offline extraction of native numeric expression **8/8** build seeds; in a four-file imported-reader graph the pass conservatively left private keys unchanged (**0/2**) | 267 primitive/exception inputs preserved in numeric fixture; 4/4 native ESM graphs with external `window.api.bridge` matched original | Numeric hot ratio 1.004× Linux, 1.000× Win; multigraph 1.021× Linux, 0.928× Win for a short measured loop; no universal bound | **Retain** as correctness-oriented baseline. Do not claim strong reconstruction resistance |
| **TypeScript checker pass** (`lib/`, experimental COO/SNO) | Complete distribution or owner filesystem | Offline numeric expression extraction **8/8**; private hashed names normalized to readable labels, re-linked and executed **4/4 seeds** in four-file graph | No numeric allocation renaming; **2/2** fields renamed in tested ESM reader graph, with behavior preserved. Larger general corpus unproved | Numeric hot ratio ~1.001× Linux, 1.011× Win; multigraph 0.634× Linux, 0.892× Win, potentially noisy | **Keep as research comparator**; investigate stronger proof coverage and independent attacks before production adoption |
| **Opt-in postfix VM** (`sims/expr-vm.js`, possible COO/SNO/SCO client) | Public opcode interpreter and bytecode | Standalone source-only AST attacker decoded the current cached program and reconstructed native algorithm **8/8 seeds** | Virtualized one seven-instruction pure numeric function; 267/267 probes matched. Arbitrary operations, reflection and closure lifting unsupported | **15.801× Linux / 15.980× Win** for protected hot function, exceeding 2.5×; mixed infrequent-call application 1.019× / 1.071× | **Reject as default** until both attack resistance and hot workload ≤2.5× are demonstrated |
| **Explicit SCO server-private partition** (`src/sco-partition.js`) | Browser sees only same-origin RPC proxy, original private ESM stays on trusted server | Hidden private canary and code absent from served proxy and 120 sampled responses; denied invalid RPC/source calls; functional secrecy still depends on oracle access | 120 authorized JSON integer-return calls matched direct reference, including ordered 12-operation batches. Not general JS-preserving relocation | 4,096-hash workload: **serial 161–178×**, **batch 16–17×** local on loopback, both violate 2.5×; larger prior workloads sometimes pass | **Retain conditionally** for coarse, authenticated server-resident operations with measured end-to-end latency and explicit behavior contract |
| **SCO finite-domain oracle cloning** (attacker `sims/sco-oracle-clone.js`) | Same trusted server withholding, authenticated public RPC | Full allowed 0..255 behavior cloned from **16 legitimate batches / 256 queries**, **256/256** exact offline lookup answers, no source or key recovered | Exact integer finite-domain semantics; no claim for large, stateful, unqueried or continuous domains | 19.84 ms Linux / 29.92 ms Win for the complete one-time table query over loopback; not a normal application runtime ratio | **Security warning**: source confidentiality does not imply resistance to authorized black-box functional cloning |
| **SCO cubic-function oracle reconstruction** (attacker `sims/sco-oracle-polynomial.js`, Agent 3) | Server-private randomized coefficients, authenticated public ESM stub/RPC | **8/8** independently randomized degree-3 polynomials reconstructed from **5 permitted inputs each**, **808/808** genuinely unqueried held-out answers reproduced | Exact generalization within an openly assumed cubic hypothesis class; not arbitrary-code reconstruction | Median ~3.604 ms serial for five probes, ~0.860 ms batched, Ubuntu loopback; attack collection time only | **Security warning**: even nonexhaustive permitted queries can reconstruct low-dimensional algorithms without source access |

### Evidence anchors

- Local native-expression challenge: `sims/decision-grid.js`, [CI 43690746803](https://github.com/FlareZ123/obfs/actions/runs/43690746803), source head `d45e70ea4`, [full report](decision-grid-2026-11-15.md).
- Cross-module ESM/host interface challenge: `sims/multifile-decision-grid.js`, [CI 43691781949](https://github.com/FlareZ123/obfs/actions/runs/43691781949), head `6f2af6cf7`, [full report](multifile-decision-grid-2026-11-15.md).
- SCO private source and operation-specific authorization: `sims/sco-trust-challenge.js`, [CI 43691352111](https://github.com/FlareZ123/obfs/actions/runs/43691352111), head `955b569b7`, [full report](sco-trust-challenge-2026-11-15.md).
- SCO allowed finite-domain oracle reconstruction: `sims/sco-oracle-clone.js`, [CI 43692057154](https://github.com/FlareZ123/obfs/actions/runs/43692057154), head `32f7f3b52`, [full report](sco-oracle-cloning-2026-11-15.md).
- SCO low-dimensional chosen-input oracle reconstruction (Agent 3): `sims/sco-oracle-polynomial.js`, [CI 43692256882](https://github.com/FlareZ123/obfs/actions/runs/43692256882), head `0d525257e`, [full report](sco-polynomial-oracle-2026-11-15.md). Five probes, 101 never-queried inputs verified per randomized run, 8/8 successful recoveries.
- Earlier controlled RTT/delay sweep: `im-results/sco-rtt-grid-2026-11-15.md`, source `sims/sco-rtt-grid.js`; prior local RPC granularity study: `im-results/sco-rpc-cost-2026-11-15.md`.
- All comparative candidates and SCO attack scripts execute through manual-only `.github/workflows/manual-decision-grid.yml` on Windows and Ubuntu; there is no per-commit CI job.

## Independent security assessment by threat model

### Static reconstruction

Main AST's identifier/property renaming and string transformations introduce syntactic friction. Public hashed keys can be normalized without the original key names, and current public VM bytes reveal their own instruction semantics. Distributed COO and SNO sources remain available to the attacker. SCO server-only source is genuinely withheld if the attacker cannot access the trusted server, but authorized attackers can learn outputs and sometimes extrapolate the whole function: the pinned cubic-class attack generalized to 808 unqueried inputs across eight private functions after five calls each.

### Dynamic analysis, runtime extraction and instrumentation

The current tests show exact source-only reconstruction for selected expressions and key normalization. A client with DevTools/Node hooks can instrument local code even when default transformations are used. The comparative challenge has **not** demonstrated resistance to determined instrumentation, tracing, automated LLM-assisted reverse engineering or browser-host spoofing. SCO keeps private implementation outside the client's debuggable realm under the stated server trust assumption; client stubs, arguments and outputs remain observable.

### Modification, integrity and authorized execution

Local COO hostnames and SNO manifest hashes remain attacker-editable under the prescribed full-control models. Their checks can detect accidental modification or honest-environment mismatches but cannot enforce a trust boundary over a hostile runtime. SCO demonstrates server-side rejection of invalid paths, sessions, methods and argument classes in test fixtures; deployment needs real authentication, method-aware authorization, rate limiting, privacy accounting and monitoring. In the unlimited-legitimate-requests threat model, a rate quota cannot be assumed unless the model is explicitly changed.

### Semantics and compatibility

The output equivalence claims are scoped to finite tests: 267 primitive probes on one pure function, a 4-module Node ESM graph with host API, 120 authorized SCO integer operations and an exhaustive 256-input bounded mapping. Other repository regressions cover aliasing, reflection, dynamic loader guards and Chrome browser integration. None supplies a complete observational equivalence theorem for arbitrary JavaScript; source introspection and side effects make that especially hard. Every speculative property rename must continue to decline when ownership or all consumers cannot be proved.

### Performance and initialization

The 2.5× rule is **per selected application workload** rather than a median averaged over unrelated benchmarks. The opt-in VM fails on its hot numeric function. SCO RPC fails sharply for tiny work even after batching, and real WAN RTT plus authentication costs are missing from loopback measurements. COO client initialization cannot be subtracted from the rule, whereas only eligible server setup in SCO/SNO may be amortized under the original prompt. Report cold start, steady-state hot path, whole application and network/authorization costs separately. Do not assert any universal throughput guarantee.

## Recommended release policy

The current public CLI may retain conservative, semantics-tested AST rewriting with clear opt-out guards, reproducible output and safe external API preservation. Its release description must avoid claims that numeric opcode randomization, hashed names, client-only domain checks or owner-editable self-hashes provide strong resistance to the assumed attacker.

Keep unproven VM and heavy string decoders behind explicit experimental options or in `sims/` until attack-cost and overhead criteria pass on representative held-out applications. For SCO, expose selectively coarse, truly server-owned operations only when the operator can secure the server and separately demonstrate authenticated latency below 2.5× under realistic network and invocation-frequency conditions.

### Highest-value next research

1. Compare a genuinely stronger candidate against the **same** pinned source-only attacker budgets, runtime instrumentation and end-to-end workload harnesses. Report attack success rates over held-out generators and multiple seeds.
2. Test source-private SCO under actual browser-to-server TLS, database-backed authorization, concurrency and repeated-session quotas, with attention to side-channel outputs and oracle table size.
3. Expand multi-file real-program coverage only when it yields measured eligible-key gains and provable native behavior across browsers and Node. Resist promoting syntactic complexity as a security result.
4. Repeat independent Windows/Linux/Chromium release validation and track manual CI head hashes; preserve failed cases and false refusals as regression evidence.

This matrix resides in `im-results/` by design. Its concrete reproducible negative findings are useful engineering evidence, but no peer-review-level novel mathematical result is claimed in `results/`.

## 2026-11-16 frozen six-module application stress test

The [original application, exact emitted COO files, and private SCO adapter](../examples/application-challenge/README.md)
offer a newer application-level counterpoint to the earlier atomic decision
grid. The reference has a 32-bit stateful mixer, two private ESM fields,
caller-provided `globalThis.window.externalValue`, and an unrelated dynamic
reflected schema. The SCO case adds an **explicit asynchronous contract**;
it is a trust-boundary variant of the same protected computation, rather
than a transparent conversion of the synchronous original interface.

| Application endpoint | COO conservative AST | SCO private graph + async RPC |
|---|---|---|
| Distributed source | 6/6 original modules, 2,786 bytes | One exact 515-byte facade; 5 implementation modules withheld |
| Protected field transformation | 0 of 2 candidate owner fields | Full protected implementation remains server-side |
| Independent adversary | Every original source byte available; 160/160 public-only offline tests + 128/128 additional vectors cloned | 40/40 fresh test vectors produced through authorized online relay, without private modules |
| Functional comparison | 102 native/output application cases | 36 native/RPC calls on each platform |
| Warm hot 120k events per invocation | 1.007× Ubuntu / 1.000× Windows (unchanged source) | 1.437× Ubuntu / 1.634× Windows |
| Client cold process, 3 × 120k event calls | Not separately measured in same experiment | 2.417× Ubuntu / 1.991× Windows (server already initialized) |
| 1-event invocation | Unchanged source | 133.62× Ubuntu / 169.24× Windows warm; 4.048× / 2.796× cold client process |
| Source/clone decision | Zero static security benefit from no-op compiler output | Genuine source withholding, successful authorized online functional clone; thin calls fail 2.5× |

The exact COO [cross-platform gate 43805835201](https://github.com/FlareZ123/obfs/actions/runs/43805835201)
is pinned to `57badde3d2b3e660a0a7b17c1477c4eea57f31a3`.
A conservative whole-group function-source observation guard prevented
all file transformations. A separate [ablation gate 43807339621](https://github.com/FlareZ123/obfs/actions/runs/43807339621)
at `6aa5bfc677bcb7f31dfc401aab3cc1cc40858a14` confirms the two
independent veto points, with the important limitation that ablated
programs **do not preserve the original's exact behavior**.

The exact SCO facade and localhost relay [gate 43806967633](https://github.com/FlareZ123/obfs/actions/runs/43806967633)
passed at `b0c759fec74580c5b2ae906bb0367ce221c90db1`; the startup-inclusive
fresh-client [gate 43807548781](https://github.com/FlareZ123/obfs/actions/runs/43807548781)
passed at `7b2753378555859b46112cce112a4906da735057`.
The 2.417× Ubuntu cold-process result is close to the 2.5× budget
threshold, and one sample is insufficient for a deployment guarantee.
None of these runs includes real TLS, WAN RTT, browser startup or
multi-tenant production authorization.

Supporting methods, source artifacts and complete limitations:
[COO observer refusal](application-challenge-refusal-2026-11-16.md) and
[SCO withholding and online relay](application-challenge-sco-source-relay-2026-11-16.md).
The comparison supports retaining conservative semantics as a default,
focusing private SCO work on coarse calls with measured network cost,
and demanding independently proven source-observer precision improvements
before claiming broader coverage. It provides no release-ready
full-control reconstruction or tamper-resistance claim.

## SNO single-entry application comparisons (16 November)

These two SNO app comparisons use an actually generated launcher and a
single OS-invoked CommonJS entry. They probe separate compiler-coverage
conditions under complete filesystem and runtime ownership.

| Evidence | Frozen six-module SNO original | Frozen three-module, transformed SNO polyvariant |
|---|---|---|
| Source shipped | All 2,786 bytes of original six-file ESM graph unchanged | 2,467 original ESM graph bytes expand to 7,495; one of three modules transformed |
| Protected coverage | 0 transformed fields, literals, identifiers or modules because entire graph refused | 3 arithmetic leaves, 6 paths; 310 selected source bytes (12.6% of original graph) |
| Node entry | SHA-256-checking CJS launcher with CJS dynamic-import bridge, seven application/bridge file hashes | Same SNO entry pattern, four app/bridge file hashes |
| Native behavioral match | 85/85 deterministic scenarios, Ubuntu and Windows | 96/96 stateful scenarios, including external host callbacks and reflection |
| Static reconstruction | Exact original source distributed | 3/3 selected affine leaves independently reconstructed from public AST; 12,288 held-out signed Int32 checks |
| Independent local owner | Copies eight published files, clones outputs, edits public hash manifest to execute forged code | Copies five published files, clones outputs, rewrites public hash, bypasses launcher by direct ESM import |
| Runtime instrumentation | Not independently exercised in this fixed application; separate Agent 3 CJS counterexample exists | Node 22 ESM load-hook replaces transformed math source in memory, outputs attacker-chosen digest 777 after successful disk hashing; 0 changed published bytes |
| Paired whole-session costs | Ubuntu 1.106x / 1.076x, Windows 1.101x / 1.097x for 1 / 120k events | Pinned 1/50/1k/10k event medians within 1.049x–1.164x across Ubuntu and Windows |
| Decision | Compatible wrapper and accidental-change detector, 0 obfuscation benefit in original graph | Demonstrable code transformation at bounded sampled overhead; still full-control static/functional/integrity failures |

The [six-module SNO source/refusal report](application-challenge-sno-owner-attack-2026-11-16.md)
is pinned to [CI 43811902422](https://github.com/FlareZ123/obfs/actions/runs/43811902422)
at 2578e34886705c40a6006fd2bba50ea99db6fe4f.
The [transformed polyvariant SNO report](polyvariant-app-sno-attack-cost-2026-11-16.md)
is pinned to [CI 43814631907](https://github.com/FlareZ123/obfs/actions/runs/43814631907)
at 61e7143ddaca118aef3206aa915cf7cc7ce1d0b1.
The emitted graph and launcher SHA-256 digests match byte-for-byte across
both OSs after canonical source newline normalization.

These SNO observations confirm the earlier SNO full-control attacker
warning using a nontrivial transformed ESM app. Public-file copying
reproduces behavior without algorithm recovery; seedless AST recovery is
possible here because the selected affine backend exposes a recognizable
finite path grammar; runtime ESM substitution tests a distinct capability
from manifest edits. The chosen-input workloads meet the sampled 2.5x
budget, but neither SNO application demonstrates actual authorization
or reconstruction resistance against the stated owner. This is an
engineering decision aid, not an asserted universal impossibility proof
or an academically established result.
