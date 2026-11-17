# Fixed-arity long-string XOR decoder: prototype-poisoning parity, attacker and paired runtime

**Status:** intermediate engineering result, 17 November 2026. **Green pinned cross-platform Node 22 gate:** [run 44003722456](https://github.com/FlareZ123/obfs/actions/runs/44003722456), exact `main` commit `5ef66be719438bcfd9ecf9693025869a599cf09a`. A previous pair of failed profile runs and an initial syntax-error run are retained as historical validation failures below. This work does not establish increased static deobfuscation cost, hostile-runtime integrity, environmental authorization, or a universal 2.5× performance bound.

## Hypothesis and implementation

The existing long-literal decoder in `src/strings.js` writes `units[j-offset]=...` into a new `[]` before calling `String.fromCharCode(...units)`. A preceding source module can install numeric inherited setters on `Array.prototype` or its parent; assignment to a hole invokes the inherited setter and produces an invalid decoded string. A source-visible whole-group guard already refuses such graphs; see [Agent 10's red control](../test/decoder-array-prototype-chain.test.js) and [run 44000100384](https://github.com/FlareZ123/obfs/actions/runs/44000100384).

As an **opt-in** alternative, `experimentalFixedArityStrings:true` selects a long-string decoder that unrolls 64 explicit `raw.charCodeAt(offset+i)^key` expressions into one `String.fromCharCode` call per block and uses a short scalar tail. It avoids array index writes and iterator use in the decoder. COO and SNO both accept the programmatic option; the default remains the legacy chunked decoder. The rest of the source-visible mutable-intrinsic refusal policy is unchanged, so a whole supplied graph with an Array prototype mutation still declines string encoding even if this candidate decoder would survive that particular mutation. Direct emitted-decoder negative-control execution is intentionally separate from the conservative whole-graph compiler admission test.

The fixed-arity source expands by about 3,290 bytes versus the current long-literal decoder for the tested 2,049-unit input. The body depends on ambient `String.fromCharCode` and `String.prototype.charCodeAt`, which must remain trusted against mutation; this alternative alone does not prove correctness under arbitrary reflective replacement of those methods.

## Reproducible cross-platform semantics and attacker

The checked-in `test/fixed-arity-strings.test.js` covers each of 64 long-literal tail lengths (SNO and COO), astral and unpaired surrogate code units, embedded NUL, legacy default behavior, short-only path, direct native/legacy/fixed execution under inherited Array/Object index accessor or prototype-chain poisoning, and independent source-only XOR recovery. Its unaffected neighboring tests include the existing prototype-poisoning regression and public static recovery. **49/49 selected tests passed on Ubuntu and Windows** at the pinned source, with strict production and research JSDoc type checks green.

For the direct poisoned-prototype canaries, the fixed-arity generated decoder preserves the exact native result, while the legacy chunked result changes. This establishes a bounded semantic improvement of that emitted decoder, without unconditionally relaxing compiler safety policy. The public-source attacker in `sims/static-string-recovery.js` still recognizes and decodes its XOR table and produces identical executable output in the profile. One encoded literal per selected application source is transformed and statically recovered in each profile case. Seed diversification is no confidentiality boundary.

## Fresh-realm paired runtime

`sims/fixed-arity-decoder-profile.js` emits three **actual executable** programs from the same input: native, legacy spread, and the opt-in fixed-arity decoder. It executes every output in a new Node VM realm and checks exact JSON output, including checksum and full literal, against the original. A source-only attacker reconstructs each obfuscated program and also matches the original. Per candidate there are 29 interleaved repetitions, the first seven discarded, leaving 22 measured observations. Each measurement mode is paired to the same workload and process.

- **Cold:** `new vm.Script(code)` compilation and execution in a fresh VM realm, excluding the compiler's own transformation time.
- **Precompiled:** reuse a pre-created `vm.Script` object but execute in a **fresh** VM realm; this is not a persistent warmed application session.
- `workIterations=0`: isolated decode and assignment to exported data.
- `workIterations=100000`: source-visible repeated integer computation using the decoded string's length. This synthetic operation is retained in the generated code; its relevance to actual protected application work is workload-specific.

Each cell reports `legacy / fixed` runtime ratio to the same case's **native** median, with 1.0 as native. All are one-process sample medians, not population bounds.

| Platform | UTF-16 units | Iterations | Cold legacy | Cold fixed | Precompiled legacy | Precompiled fixed |
|---|---:|---:|---:|---:|---:|---:|
| Ubuntu Node 22 | 2,049 | 0 | 1.248× | **1.116×** | 1.236× | **1.137×** |
| Ubuntu Node 22 | 2,049 | 100,000 | **1.037×** | 1.180× | **1.030×** | 1.170× |
| Ubuntu Node 22 | 52,500 | 0 | 4.682× | **3.060×** | 4.778× | **2.025×** |
| Ubuntu Node 22 | 52,500 | 100,000 | **1.162×** | 1.197× | **1.140×** | 1.200× |
| Windows Node 22 | 2,049 | 0 | 1.061× | **1.027×** | 1.061× | 1.061× |
| Windows Node 22 | 2,049 | 100,000 | **1.002×** | 1.144× | **1.018×** | 1.142× |
| Windows Node 22 | 52,500 | 0 | 3.721× | **1.933×** | 3.705× | **2.291×** |
| Windows Node 22 | 52,500 | 100,000 | **1.103×** | 1.195× | **1.109×** | 1.171× |

**Budget verdict:** the 52,500-unit isolated **cold Ubuntu** fixed-arity case takes **3.060×** native in this sample and therefore *fails* the prescribed 2.5× ceiling. The old chunked path also fails (4.682×). Other selected fixed-arity cases fall below 2.5×, but 2,049-unit and 100k-work cases are intentionally synthetic and no cross-workload bound follows. The same 52,500-unit zero-work load did pass a 2.5× sample bound on Windows and in the script-precompiled Ubuntu case. Median sensitivity, VM realm startup, source size and host CPU effects limit generalization. No browser startup/download measurement is included.

## Validation history and remaining work

- [44003059282](https://github.com/FlareZ123/obfs/actions/runs/44003059282) failed on both OS due an initial malformed test literal, now repaired.
- [44003288384](https://github.com/FlareZ123/obfs/actions/runs/44003288384) passed **49/49 test cases** per OS, then failed in the new profile because an early `acc + ":" + literal` expression triggered conservative source-observation refusal; the benchmark had zero encoded protected work.
- [44003574255](https://github.com/FlareZ123/obfs/actions/runs/44003574255) still refused the subsequent `literal.charCodeAt` benchmark attempt. We changed the workload to a provable literal-length operation and emitted an object carrying the full string and checksum, restoring **one actual transformed literal** to all four workloads without weakening the compiler's source-observation policy.
- [44003722456](https://github.com/FlareZ123/obfs/actions/runs/44003722456) passed both OS test, profile and JSDoc steps on exact `5ef66be...`.

Next work should test real browser cold sessions, multiple competing block arities, source-visible String intrinsic mutations and independent static normalization. Any future relaxation of Array-prototype guards must be paired with a preserved negative semantic witness and unchanged positive protected-work measurement, coordinated with the current guard owner. This evidence belongs in `im-results/`, and does not yet meet `results/`' academically established obfuscation-security standard.


## Follow-up 256-operand candidate and Chromium contract (02:39 UTC)

The initial 64-operand sample above established a real Linux cold budget failure. A private local Node 22 cold-load sweep of block widths 16–512 suggested larger unrolled calls reduced the per-block call overhead and improved the 52,500-unit decode-only median, despite increasing emitted source size. Its environment and metrics were exploratory and distinct from the pinned CI evidence. The compiler's **opt-in** fixed-arity branch was revised to **256 operands**, with a conditional code-generation path that avoids constructing any 256-operand source when the feature is disabled or no long literal exists. The tests now exercise **all 256 tail lengths** for each of SNO and COO.

At exact commit `fccd3261db5e4ddbd0469cba82f2c86fa2c1f467`, [run 44004508590](https://github.com/FlareZ123/obfs/actions/runs/44004508590) passed the fixed-arity and neighboring string tests, ran four native/generated/static-reconstruction work profiles on both OS, and passed a real Ubuntu **Chromium CSP ESM** parity and source-only static attack. It then **FAILED overall on both platforms** in the *separate* `decoder-array-prototype-chain.test.js` test step because two newer `destructured-parent-alias` guard cases corrupted native behavior (leading decoded char `0` versus native `65`). The new cases were introduced by another concurrently active agent and do not exercise the opt-in 256 backend. The failing run remains a genuine integration failure, referred to the responsible guard owner; no all-green claim is implied. Later strict type-check steps were skipped at this pinned source due the earlier failure.

**Same paired profile, 256 operands:** each `legacy / fixed` entry below is a median ratio to the native source within one environment. These ratios replace the 64-operand numbers **only for the 256 candidate**; the two candidates are different git versions and CPU environments. Source was actually transformed (one literal each case), then statically recovered to an executable equivalent.

| Platform | UTF-16 units | Iterations | Cold legacy | Cold fixed 256 | Precompiled legacy | Precompiled fixed 256 |
|---|---:|---:|---:|---:|---:|---:|
| Ubuntu Node 22 | 2,049 | 0 | 1.241× | **1.197×** | 1.355× | **1.244×** |
| Ubuntu Node 22 | 2,049 | 100,000 | **1.036×** | 1.261× | **1.050×** | 1.255× |
| Ubuntu Node 22 | 52,500 | 0 | 3.985× | **2.200×** | 4.121× | **2.328×** |
| Ubuntu Node 22 | 52,500 | 100,000 | **1.228×** | 1.338× | **1.220×** | 1.342× |
| Windows Node 22 | 2,049 | 0 | 1.101× | **1.019×** | 1.087× | **0.977×** |
| Windows Node 22 | 2,049 | 100,000 | **1.040×** | 1.206× | **1.033×** | 1.206× |
| Windows Node 22 | 52,500 | 0 | 3.314× | **2.081×** | 3.671× | **1.901×** |
| Windows Node 22 | 52,500 | 100,000 | **1.127×** | 1.165× | **1.195×** | 1.360× |

For the previously failing Linux 52,500-unit, zero-work **cold** case, 256 operands measured **2.200×**, below 2.5× at this exact SHA; Windows measured **2.081×**. This is scoped to a 22-measurement median in each one-process VM experiment. At 2,049 units the 256 backend enlarged emitted source to 16,942 characters versus 3,318 for legacy chunked; at 52,500 units it emitted 67,137 versus 53,513. The 100,000-work cases may show slower fixed-arity than the legacy decoder, though both stay far below 2.5× relative to native. No universal runtime guarantee follows from four selected synthetic workloads.

**Real Chrome:** `test/fixed-arity-strings-browser.js` serves actual three-module ESM under `Content-Security-Policy: default-src 'none'; script-src 'self'`. A separate mutator module injects an inherited array-index setter before target evaluation. The target was compiled alone intentionally to test the generated decoder outside the compiler's conservative whole-graph admission boundary; compiling the **complete** mutator + entry + target group correctly refused encoding. The Chromium result for the 8,203-unit target was:

| Environment | Native | Fixed 256 | Public static-reconstructed | Legacy spread |
|---|---|---|---|---|
| Clean | length 8,203; first 65; last 68; checksum 598201494 | identical | identical | identical |
| Hostile Array index setter | length 8,203; first 65; last 68; checksum 598201494 | identical | identical | first **0**, checksum **−2039189481** |

The attacker reconstructs the full literal and passes the hostile browser test as well. This verifies bounded runtime correctness under a particular ambient Array numeric setter, while simultaneously confirming no source-only secrecy benefit. It does not establish protection against arbitrary String intrinsic replacement, runtime extraction, browser DevTools instrumentation or host spoofing.

**Actionable next checks:** rerun the whole targeted gate only after the independent `destructured-parent-alias` corruption is repaired or explicitly kept as a red isolated integration witness; complete strict JSDoc validation on the 256 revision; compare against Chrome cold network+parse+decode, and profile more workloads before selecting a release default.
