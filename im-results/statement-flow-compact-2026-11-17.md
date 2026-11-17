# Opt-in native CFG compaction: hot gains, cold violation, public-source clone (17 November 2026)

**Status:** intermediate cross-platform engineering evidence. This is an explicitly opt-in COO/SNO technique with proven functional cloning under the tested source-only attacker. Workload-level 2.5× safety remains conditional.

## Technique and entry points

`src/statement-flow.js` now offers `compactCases:true`. The emitter merges a chain of linear successor blocks into one shuffled switch case if each successor has exactly one incoming edge and is not the entry. In the initial mainline implementation, branch tests, returns, throws and shared joins remain separate states. This preserves the native evaluation order and function-scoped `var` under the admitted grammar, while retaining source-text and JIT-observation caveats of CFG flattening.

- Implementation [af1d0ff](https://github.com/FlareZ123/obfs/commit/af1d0ff981a2aa5795be8588f308bcc938f2f1ae).
- Compiler `experimentalStatementFlowCompact:true` [1421779](https://github.com/FlareZ123/obfs/commit/142177974d4b8abddac958386b2a0a7eee5e555f).
- COO/SNO CLI flag `--statement-flow-compact` with `--statement-flow file:function` [9a75baa](https://github.com/FlareZ123/obfs/commit/9a75baa89df4d4545487418895573d20bf993762).
- Tests `test/statement-flow-compact.test.js`; profiling `sims/statement-flow-compact-profile.js` and `sims/statement-flow-compact-cold-profile.js`; real graph `sims/statement-flow-compact-app.js`. Absent the new option, the existing emitter is unchanged.

## Hot-loop CPU/callback measurements

[Pinned Linux/Windows run 43996692856](https://github.com/FlareZ123/obfs/actions/runs/43996692856) passed at SHA `6cb2acb842246bc888d6595e8eda87a9481d5ab3`. Nine alternating hot-loop trials per candidate, checksums and external callback effects verified, Node 22. Ratios are median elapsed time divided by the native median, excluding fresh initialization.

| Fixture | Standard → compact cases | Ubuntu standard → compact | Windows standard → compact |
|---|---:|---:|---:|
| Existing router, lightweight callback, 650k calls | 11 → 8 | 1.454× → **1.308×** | 1.987× → **1.925×** |
| Dense arithmetic, lightweight callback, 300k calls | 44 → 7 | 4.968× → **1.334×** | 7.772× → **1.723×** |
| Existing router, SHA-256 callback, 45k calls | 11 → 8 | 0.995× → **0.998×** | 1.013× → **1.014×** |

The dense fixture crosses the 2.5× budget from failure to pass in both samples. The experiments establish no universal worst-case bound.

## Fresh-load negative control

[Pinned Linux/Windows run 43997119211](https://github.com/FlareZ123/obfs/actions/runs/43997119211) passed its checks at SHA `90b6b025eaf2a8dfb36d85ec8dd899abbe3e844c`. The cold harness dynamically compiles a fresh CommonJS module per session, runs callbacks, uses eleven alternating trials and unique trailing comments, and excludes filesystem/network cost.

| Calls per fresh session | Ubuntu compact/native | Windows compact/native | 2.5× budget |
|---|---:|---:|---|
| 1 | 1.514× | 1.600× | Pass |
| 10 | 1.599× | 1.917× | Pass |
| 1,000 | **3.237×** | **2.807×** | **Fail** |
| 100,000 | 0.928× | 0.840× | Pass |

The 1,000-call failure is a counterexample to unconditional rollout. Successful CI steps mean semantic tests and profiler execution passed; the profiler deliberately records 2.5× violations without gating on them. JIT tiers and process noise require repetitions before attributing the deviation to one specific mechanism.

## Real three-module application and attacker clone

[Pinned Linux/Windows run 43997435553](https://github.com/FlareZ123/obfs/actions/runs/43997435553) passed at SHA `1448c32a5e7377d717b17e3988b59c1c7d44f1b8`, including JSDoc checks. The self-contained `sims/statement-flow-compact-app.js` builds a frozen `math.mjs` / `state.mjs` / `entry.mjs` application in separate actual temporary directories using the repository's locked atomic writer. It exercises host-owned `globalThis.appTag`, callbacks, `Object.keys` reflection, arithmetic state updates, and JSON serialization.

- Source: 1,165 bytes; selected 491-byte math module is **42.15%** of the original graph.
- Ordinary emitted CFG: 2,886 bytes and 30 cases; compact: 1,722 bytes and 9 cases.
- **96/96** scenarios match across native, standard CFG, compact CFG, and a seedless source-only recovered clone, tested for 24 seeds × 0/1/4/32 events.
- The attacker reads distributed compact math source and uses `sims/statement-flow-recover.js` to produce an equivalent public function. It requires no compiler seed or native input. Original private identifier spellings are not independently recovered.

Warm application `runSession` processing ratios (callback/JSON included, input prepared and modules already loaded, seven trials):

| Events/session | Ubuntu standard → compact/native | Windows standard → compact/native |
|---|---:|---:|
| 1 | 1.720× → **1.078×** | 1.385× → **0.933×** |
| 50 | 1.204× → **1.043×** | 1.101× → **1.044×** |
| 1,000 | 1.057× → **0.965×** | 1.039× → **1.053×** |
| 10,000 | 1.099× → **1.077×** | 1.016× → **1.029×** |

These sampled warm processing workloads met 2.5×. They exclude fresh module loading and do not erase the cold counterexample.

## Protection verdict

Compaction reduces dispatch and code size on tested graphs. The program remains **statically reconstructable**. No positive static secrecy, unauthorized host execution prevention, runtime extraction resistance, tamper-proofing, or general compatibility proof follows from these experiments. Browser-specific CSP, cold-start and larger application benchmarks remain necessary. The broader COO/SNO full-control attacker can patch observable client code. The separate SCO trust boundary is unaffected.
