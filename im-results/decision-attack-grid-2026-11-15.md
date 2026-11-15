# Decision-grade ESM protection comparison: native behavior, source-only attacker and compute

Date: 2026-11-15. Agent 7. **Intermediate evidence.** Reproduction script `sims/decision-attack-grid.js` and manual-only workflow `.github/workflows/manual-decision-attack-esm.yml`. This is an input-pinned candidate comparison and intentionally does not promote a research claim into `results/`.

## Pin and contract

- Source and configuration pinned to commit `3c80a9316483175dd106e14055da03dc1bdca5d0` from manual [run #43690864437](https://github.com/FlareZ123/obfs/actions/runs/43690864437); the workflow ran on **Ubuntu and Windows** with Node 22.
- Source is one three-file native ESM application: `state.mjs` exports an object with a literal secret marker and a pure reader helper; `api.mjs` imports them and exports a numeric expression `((x+7)*3)^90`, a hot pure kernel and a mixed application loop; `entry.mjs` supplies an explicit `globalThis.window.externalValue` callback and measures both workloads.
- All candidates receive identical input sources. The main Acorn `src/` compiler runs COO, opt-in string encoding, `closedWorld:true`, no lexical identifier renaming. The independent TypeScript-checker `lib/transform.js` uses the same closed-world assertion. The experimental `sims/expr-vm.js` translates only `numeric` and preserves the rest.
- There are **three separate held-out seeds**, nine hot samples after five warmups per candidate, and native ESM output equivalence checked against the untransformed application. The JSON artifact uploaded for each runner preserves the full individual ratios and raw samples.
- Source-only attackers use `sims/static-string-recovery.js` to reconstruct XOR literals and `sims/expr-vm-static-recover.js` to reconstruct the public postfix VM's return expression. The reconstruction is then validated against 100 generated numeric probes. No original source, seed or target execution is required by either static extractor. The independent verifier executes the reconstructed expression to check semantics.

## Results

| Candidate on three-file ESM | Transformation coverage | Static attacker outcome | Native semantic result | Isolated pure-hot median ratio | Mixed application median ratio | End-to-end child process wall ratio |
|---|---|---|---|---|---|---|
| Main Acorn COO | 1 exported property, 1 encoded literal in every seed | XOR secret literal recovered **3/3**; numeric expression remains in plain source | Equivalent **3/3** | Ubuntu 0.997–0.998x, Windows 1.000–1.004x | Ubuntu 0.997–1.003x, Windows 1.002–1.003x | Ubuntu 0.88–0.93x, Windows 0.85–0.91x |
| Independent TS-checker | 1 property renamed in every seed | Secret literal directly present **3/3**; numeric expression remains in plain source | Equivalent **3/3** | Ubuntu 0.997–1.013x, Windows 1.000–1.021x | Ubuntu 0.997–0.998x, Windows 0.999–1.001x | Ubuntu 0.90–0.91x, Windows 0.86–0.88x |
| Experimental postfix expression VM | 1 numeric function, 7 virtual instructions per seed | Numeric expression reconstructed and independently verified **3/3**; secret literal directly present **3/3** | Equivalent **3/3** | Ubuntu **64.10–77.63x**, Windows **64.54–78.98x** | Ubuntu 1.69–1.82x, Windows 1.69x | Ubuntu **2.75–3.10x**, Windows 2.07–2.31x |

Numbers are observed ratios, not modeled guarantees. Process-wall measurements include Node launch, ESM loading, benchmark warmups, and hot samples; they are **not a clean isolated cold-start metric**. The apparent sub-1x process-wall values for baseline compilers do not establish a real speedup: external process launch and JIT variation are substantial. The mixed VM workload invokes its protected numeric function once per 512 iterations; a favorable mixed ratio does not excuse the isolated VM's extreme budget failure.

## Independent five-dimension judgment

| Candidate / modeled mode | Static reconstruction | Runtime instrumentation/extraction | Unauthorized change / environment lock | Semantic compatibility | Performance / recommendation |
|---|---|---|---|---|---|
| Main COO baseline | Protected literal reconstructed from emitted XOR decoder; numeric calculation remains public | Attacker controls full browser JS; extraction expected, **not exercised in this harness** | Browser hostname checks can be modified by the client; no trust boundary | All three seeds matched native ESM behavior on two OS | Retain as compatibility-oriented baseline. Measured workloads within 2.5x |
| Checker COO alternative | Literal and numeric source publicly readable | Public JS can be inspected and modified; **not exercised here** | Same client-control limitation | All three seeds matched | Useful independent analysis comparator; no measured attacker-resistance advantage |
| Postfix VM, COO-style distributable candidate | Public VM semantics and bytecode reconstructed by source-only attacker in every seed | Browser instrumentation could inspect decoded operands; **not separately measured** | Client can patch interpreter/cases; no server authorization | All three seeds matched | **Reject for hot-path deployment**: observed isolated 64–79x and some process-wall 2.75–3.10x despite mixed workload meeting the threshold |
| Server-controlled private RPC partition, SCO | Server-resident implementation absent from shipped client files in the separate existing SCO partition tests | Unlimited legitimate oracle calls remain possible under the stated attacker model | A real server-side authorization hook and preflight per-inner batch operation are enforced; outer Host headers alone are insufficient | Dedicated HTTP tests pass, but **the same three-file ESM comparator was not partitioned** | Keep opt-in for coarse authenticated operations. Existing `im-results/sco-rpc-cost-2026-11-15.md` and RTT grid show granularity-dependent 2.5x outcomes |
| SNO local files and integrity launcher | Local owner controls all bytes and runtime; no hidden source guarantee | Owner can instrument Node process/memory | Local self-hash can be bypassed with owner control | Dedicated SNO regression suite applies; **not tested in this comparison** | Compatibility and corruption detection only. Do not claim cryptographic tamper resistance |

## Follow-up SCO adversarial oracle experiment

The independently runnable `sims/sco-oracle-exhaustion.js` was validated on Ubuntu and Windows in manual [run #43691354928](https://github.com/FlareZ123/obfs/actions/runs/43691354928). Under the stipulated unlimited legitimate request model, a 256-input server-private random-key HMAC-derived function was **fully behaviorally cloned (256/256 outputs)** using one 256-item authorized batch, despite the secret key never leaving server memory. A separate 256-request enumeration agreed exactly. The server still enforced authorization on each nested item. This is a bounded-domain counterexample to functional secrecy, not a cryptographic key recovery. Evidence and timings are in `im-results/sco-authorized-oracle-extraction-2026-11-15.md`.

## Follow-up SNO local tamper test

The independent native Node attacker in `sims/sno-self-hash-bypass.js` was validated in manual cross-platform [run #43691613602](https://github.com/FlareZ123/obfs/actions/runs/43691613602). A modified SNO entry correctly failed with the unmodified launcher's stored SHA-256 digest, but succeeded after the local filesystem owner replaced the digest in the launcher. This directly demonstrates that co-located self-hashes do not authenticate code to an attacker who owns the files. Reproduction details appear in `im-results/sno-owner-self-hash-bypass-2026-11-15.md`.

## Follow-up SCO cross-realm admission limits

The SCO recommendation above assumes a deliberately server-resident, reviewed
private operation, rather than arbitrary browser JavaScript migration. The
selected export compiler had previously admitted hidden shared runtime state
between server and browser realms. Differential Node `vm.createContext`
witnesses showed:

- Private `Object.prototype.canary=41` followed by public
  `({}).canary` observes 41 in the original single realm and no value
  in a distinct realm.
- Private regular-expression matching leaves legacy `RegExp.$1`
  updated in its own realm; the browser realm's match state is unchanged.
- Writes to `Math`, `JSON`, and `Error.stackTraceLimit` affect
  separate intrinsic instances in separate realms.
- Browser `window.externalBridge.value` can return 41 in its native
  context and throw on an unconfigured Node server.

Bounded admission refusals, local alias controls and 32 mutation spellings
are now tested in `test/sco-intrinsic-realm.test.js`, with implementation
in `src/sco-selective-partition.js`. Focused
[Ubuntu/Windows run 43772538549](https://github.com/FlareZ123/obfs/actions/runs/43772538549)
passed at `bbf1c7467d660512168a91daaced1627277ebfbc`. The prior
full integrated [run 43771808471](https://github.com/FlareZ123/obfs/actions/runs/43771808471)
passed at an earlier SHA. Evidence and precise remaining incompleteness
are in `im-results/sco-cross-realm-prototypes-2026-11-15.md`.
These results narrow the valid **compatibility admission** contract.
They do not harden public code against dynamic inspection or overcome
unlimited legitimate queries to the private server.

## Decision

**Keep** the conservative main compiler and experimental TypeScript checker for their limited, reproducible compatibility coverage. **Do not deploy** the public postfix VM on a hot function under the specified 2.5x budget. Source-only extraction of the protected numeric expression succeeds without knowing a seed, so measured complexity provides no demonstrated attack-cost benefit. **Prefer** SCO server-resident partitioning for secrets that must remain outside client-delivered source, provided a real server authorization policy, meaningful high-entropy private computation and measured network overhead fit the workload.

The comparison does **not** test browser DevTools instrumentation, native WASM candidates, non-JS host effects, arbitrary property flow, browser cold-start, all dynamic reflection, or fully independent adversaries. They remain open gates. Tests with a source-only attack and local microbenchmark should not be extrapolated into claims of strong resistance to coordinated reverse engineering.
