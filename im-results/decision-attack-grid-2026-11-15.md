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

## Decision

**Keep** the conservative main compiler and experimental TypeScript checker for their limited, reproducible compatibility coverage. **Do not deploy** the public postfix VM on a hot function under the specified 2.5x budget. Source-only extraction of the protected numeric expression succeeds without knowing a seed, so measured complexity provides no demonstrated attack-cost benefit. **Prefer** SCO server-resident partitioning for secrets that must remain outside client-delivered source, provided a real server authorization policy, meaningful high-entropy private computation and measured network overhead fit the workload.

The comparison does **not** test browser DevTools instrumentation, native WASM candidates, non-JS host effects, arbitrary property flow, browser cold-start, all dynamic reflection, or fully independent adversaries. They remain open gates. Tests with a source-only attack and local microbenchmark should not be extrapolated into claims of strong resistance to coordinated reverse engineering.
