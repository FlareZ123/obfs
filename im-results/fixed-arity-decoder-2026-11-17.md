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


## Real Chromium cold COO ESM timing (02:44 UTC)

A further [pinned run 44005016806](https://github.com/FlareZ123/obfs/actions/runs/44005016806), SHA `6c3becf45d3b24d9625633d177f1a3031919a98e`, successfully ran on Ubuntu: the fixed-arity tests, Node paired runtime profile, hostile-prototype Chromium parity/static reconstruction, a new browser cold-session profile, production strict type check, and strict research JSDoc. The Windows job also passed its own tests, Node profile and both JSDoc checks. **Both jobs subsequently failed only in the separate inherited-Array-prototype guard gate**, on a contemporaneous set of mutated-prototype alias witnesses being addressed by another owner. The full workflow remains red; the successful steps and their exact source revision are independently visible in the job records.

The new `sims/fixed-arity-browser-session.js` serves one native and one compiled COO ESM target per scenario under the same CSP, `Cache-Control: no-store`, and local HTTP origin. An external classic `start.js` records `performance.now()` before the browser fetches, parses and evaluates `entry.mjs` and `target.mjs`; entry reports the clock difference after exact-result production. Each individual observation uses a fresh headless Chromium process under the same script flags. The clock excludes browser-process launch and obfuscator compilation while including module loading, parse and decoder initialization. Native and fixed outputs are checked for identical length, first/last UTF-16 code unit and checksum. The source-only XOR attacker still statically recovers the entire target. Nine alternating native/fixed page pairs per workload were run, with the first three pairs excluded; **six timing samples per candidate** remain.

| Chromium Ubuntu workload | Native median elapsed | Fixed 256 median elapsed | Ratio |
|---|---:|---:|---:|
| 2,049 UTF-16 units, decode only | 9.9 ms | 6.6 ms | 0.667× |
| 52,500 UTF-16 units, decode only | 9.2 ms | 12.2 ms | 1.326× |
| 52,500 UTF-16 units, 100,000 integer iterations | 14.9 ms | 14.0 ms | 0.940× |

These three sample medians are below 2.5×, including the 52,500-unit cold browser session that had failed the initial 64-wide Linux VM scenario. The 0.667× and 0.940× observations are single-run timing outcomes with network and scheduling variance and are **not evidence that obfuscation generally accelerates code**. Chromium process launch time is outside the page timer. Browser parse/fetch and VM script-compilation timing use different workload boundaries, and neither table proves a universal performance ceiling. The emitted 256-wide string decoder remains directly reconstructable from its public XOR key.


## Standards basis: array literal and mutation semantics

The mechanism above has a normative basis in [ECMAScript 2026 ArrayAccumulation §13.2.4.1](https://tc39.es/ecma262/2026/multipage/ecmascript-language-expressions.html#sec-runtime-semantics-arrayaccumulation). For ordinary array literal elements, the spec calls `CreateDataPropertyOrThrow` on each numeric key, ensuring an **own** property; its explicit note explains that the own-property creation continues to work even when `Array.prototype` has been modified in a way that would prevent adding an own key through `[[Set]]`. The generated source's encoded table is a densely initialized literal, so `table[index] = decoded` subsequently updates preexisting own numeric data fields. In contrast, the old decoder's fresh `const units=[]; units[offset]=...` uses ordinary assignment to a missing numeric own field, which can invoke inherited setters from `Array.prototype` or its prototype chain ([ordinary `[[Set]]` semantics](https://tc39.es/ecma262/2026/multipage/ordinary-and-exotic-objects-behaviours.html#sec-ordinarysetwithowndescriptor)). The new fixed-arity path never creates `units` and passes scalar numeric expressions directly into `String.fromCharCode`.

The reconstruction also rests on the specified UTF-16 semantics of [String.fromCharCode §22.1.2.1](https://tc39.es/ecma262/2026/multipage/text-processing.html#sec-string.fromcharcode) and [String.prototype.charCodeAt §22.1.3.3](https://tc39.es/ecma262/2026/multipage/text-processing.html#sec-string.prototype.charcodeat): the transform round-trips each 16-bit code unit individually, preserving an unpaired surrogate where one is present. This is a bounded specification argument for pristine String intrinsics, not a guarantee against source programs or outside code replacing these methods.
