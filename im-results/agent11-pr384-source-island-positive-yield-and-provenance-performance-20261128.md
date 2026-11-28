# PR #384 source-island positive-yield root cause and primitive may-flow scaling

**Agent 11 · 28 November 2026 · intermediate source-pinned engineering evidence, not security acceptance.**

## Full frozen-pr versus boxed-provenance source pair

The [original PR #384 full suite](https://github.com/FlareZ123/obfs/actions/runs/46111052891) at `a8a22f9aef6e7f0d487cebc23c87063376df55cb` failed on both Node 22 Ubuntu and Windows with seven *positive protected-property yield* assertions. The first boxed-primitive patch at `ab101f9c37e6555884bb3aa3cef221ea60570473`, [run 46118189456](https://github.com/FlareZ123/obfs/actions/runs/46118189456), failed on **the exact same seven test names**, with no new failures among nine additional regression tests. Baseline Ubuntu: 5,773 tests, 5,741 pass, 7 fail; patched Ubuntu: 5,782 tests, 5,750 pass, 7 fail. Windows pass-count differences are due to skipped platform subsets; the seven failures are again identical.

The seven unresolved baseline cases:
1. `source-observer-islands-fuzz.test.js`: 12 held-out primitive-own-record ESM variants retain source parity across COO/SCO/SNO and public normalization.
2. `source-observer-islands-host-argument.test.js`: primitive snapshot exports retain selected property rewrite.
3. Same file: selected leaf with unselected primitive producer retains rewrite.
4. `source-observer-islands-reflection-gate.test.js`: safe JSON/console importer permits selected rewrite.
5. `source-observer-islands.test.js`: opt-in isolated ESM property rename preserves watched source and two imported primitive calls.
6. Same file: CacheStorage source-reader veto still preserves independent rewrite.
7. Same file: Window.frames source-reader veto still preserves independent rewrite.

These are **missing rewriting yield**, not observed native-versus-emitted process-output mismatches. The baseline failure is established independently of the boxed primitive patch; this finite comparison does not prove compatibility for any later compiler head.

## Root-cause inspection: selected ESM files were proven but never exempted

In the frozen `src/core.js`, `const sourceObserverIslands=options.experimentalSourceObserverIslands?.length ? proveSourceObserverIslands(...) : new Set()` is calculated near output assembly. However the only occurrence of `sourceObserverIslands` is that declaration. The later `const fileSourceObserver=remoteSourceObserver||esmDomSourceProducers.has(filename)` treats *every* local file as source-observed if one imported function source is watched. Consequently the local `renameLocalProperties` guard `if (!fileSourceObserver && options.properties !== false ...)` never checks the proven selected Set, yielding zero rewritten protected fields.

A one-line **source-pinned branch-only** counterfactual on frozen PR #384, `agent11/pr384-source-island-restore-20261128` at `6bf9d85db665bed2fe6a7680b4018c46f6e7823c`, makes `fileSourceObserver` false for selected leaves. Four preexisting test files were submitted to independent multi-platform focused workflows [46119194957](https://github.com/FlareZ123/obfs/actions/runs/46119194957), [46119199750](https://github.com/FlareZ123/obfs/actions/runs/46119199750), [46119203775](https://github.com/FlareZ123/obfs/actions/runs/46119203775), [46119207447](https://github.com/FlareZ123/obfs/actions/runs/46119207447). **At initial report writing, three of four have completed successfully; the last is still pending.** Check exact final statuses.

**Important safety correction:** the broad `fileSourceObserver` exemption is *too permissive*. That boolean also gates register/branch/statement VMs, identifier renaming and string decoding. The documented source-island exception proves **only local own-property substitution**, not arbitrary backend safety. A new six-case negative/positive test `test/source-observer-islands-backend-boundary.test.js` was committed on `agent11/source-island-backend-boundary-20261128` at `32a5941bcca22e8a8f8f9a30dc4feab71265a7d3`; it requires nonzero selected property substitutions while binding/string/VM transformations remain forbidden across COO/SCO/SNO. A minimal refined correction at `a66f6ff2852ba35ecc1ac745644fe5b55f2b2343` retains `fileSourceObserver` for other backends and introduces an explicit `islandPropertyOnly` override **solely** in the `renameLocalProperties` guard. Red and green controls were dispatched as [46119404228](https://github.com/FlareZ123/obfs/actions/runs/46119404228) and [46119472747](https://github.com/FlareZ123/obfs/actions/runs/46119472747); verify them before claiming acceptance.

The combined provenance + worklist + precise property-only exception is staged as `agent11/consolidated-safe-islands-20261128` at `d78b381d316988bddb7e4e1349c8e24b11bd22ab`, with focused [run 46119515263](https://github.com/FlareZ123/obfs/actions/runs/46119515263) pending at initial report writing. The earlier broad island prototype `agent11/consolidated-provenance-islands-20261128` at `cb2a1d3a1a859d73db92937aa2133a9a91241776` was dispatched into full [run 46119346229](https://github.com/FlareZ123/obfs/actions/runs/46119346229) for a differential, but **must not** be accepted due overadmitted backends.

## Compiler may-primitive fixedpoint scaling (1024-link reversed aliases)

Test `test/boxed-primitive-provenance-scaling.test.js` at `c41eda5a27b63c4344ffa9c6f2d45a25c69551a4` constructs reverse-ordered assignment chains of lengths 32, 128, 512 and 1024 (three local median repetitions per shape), then tests a host-sensitive destructuring branch and a safe independent private-field rewrite control. Each case compiles using `mode:'coo',closedWorld:true,properties:true,strings:false,identifiers:false` on real Node22 CI; **no generated-code runtime measurement is involved**.

Unoptimized [run 46118867677](https://github.com/FlareZ123/obfs/actions/runs/46118867677) (`c41eda5a...`) compared to incremental dependency-worklist implementation [run 46118935512](https://github.com/FlareZ123/obfs/actions/runs/46118935512) (`90b908afd592e216783a1dd3b1686f782122505d`). Both passes on all three platforms, with negative `crossFile.properties=0` and safe positive `crossFile.properties=1`. 1024-link median `compile` milliseconds (source-pinned, runner-to-runner comparison, not controlled same-machine pairing):

| OS | unoptimized negative | worklist negative | unoptimized safe | worklist safe |
| --- | ---: | ---: | ---: | ---: |
| Ubuntu | 6,763.46 | 5,017.21 | 16,507.14 | 14,834.52 |
| macOS | 5,928.10 | 3,996.95 | 13,930.60 | 11,861.98 |
| Windows | 10,598.41 | 5,493.98 | 23,992.79 | 16,248.55 |

This is a finite compiler-performance improvement (negative cases about 26% / 33% / 48% faster respectively); significant superlinear compile growth remains. Do **not** equate compile-time savings to satisfaction of the ≤2.5× **obfuscated runtime** constraint. Future work should isolate remaining quadratic consumers and reproduce byte-level equivalent generated outputs where practical.

## Required next gate

Check exact-head red/green source island CI, consolidate the **property-only** exception, then source-pin a fresh full Node22 Linux/Windows/Chromium/SCO/SNO/strict JSDoc and correct runtime-budget acceptance record. In particular preserve `source-observer-islands-backend-boundary` negative controls and all prior boxed primitive/ForIn precision controls. If original seven yield failures vanish, that is an engineering improvement; it does **not** undo the independently negative static/dynamic clone and >2.5× results for the frozen strong-obfuscation claim.

Related first report: `im-results/agent11-pr384-host-boxed-primitive-and-crossfile-provenance-20261128.md`.


## Exact-head consolidated full suite and unavoidable hostile-host locale contradiction

The property-only source-island correction plus boxed-primitive/ForIn provenance guard and dependency worklist was run at **exact** `d78b381d316988bddb7e4e1349c8e24b11bd22ab`, [full run 46119786974](https://github.com/FlareZ123/obfs/actions/runs/46119786974). Node22 Ubuntu: **5,808 tests, 5,780 pass, 3 reported fail, 25 skip**. Node22 Windows: **5,808 tests, 5,770 pass, 3 reported fail, 35 skip**. These are two mode-specific failures (COO and SNO) plus their parent aggregation, *all within* `test/external-instance-prototype-source.test.js`'s `proven primitive toLocaleString keeps independent protected field rewrites`. No previous seven source-island test names remain among the failing cases. This is a **RED full gate**; do not promote consolidated candidate as release-compatible.

The challenged positive case obtains `const nativeNumber=7` then calls `nativeNumber.toLocaleString("en-US")` and requires a private cross-file property rewrite elsewhere. The conservative `mayBeBoxedPrimitive` member guard refuses that rewrite because host-owned `Number.prototype.toLocaleString` can be replaced with a method that imports and introspects the supposedly closed `owner.mjs` graph. This is not only theoretical: exact source-only hostile-host test `test/primitive-tolocalestring-host-dynamic-import.test.js` at `ec87e780c391cecfcb98b9e6e6f51bc02e7fd020`, [frozen red 46120769409](https://github.com/FlareZ123/obfs/actions/runs/46120769409), causes **three actual native/emitted key-shape mismatches** across COO/SCO/SNO on Ubuntu, Windows and macOS. It preloads a replacement `Number.prototype.toLocaleString` returning `import(fileURL(owner.mjs)).then(m=>Object.keys(m.owner))`, and the input awaits that result. The same source-pinned test on the guarded candidate `ababbd64be3df7e47348aab3d77e8a90033dc072` [green 46120766130](https://github.com/FlareZ123/obfs/actions/runs/46120766130) preserves native/emitted behavior and refuses cross-file rewriting in all three modes.

**Decision requirement:** under the user-specified attacker-controlled host/JS runtime assumptions, weakening the receiver guard merely to satisfy the positive `toLocaleString` yield test would reintroduce a reproduced correctness failure. Keep current RED full gate explicit; do not silently change the old positive assertion. An admission owner must decide whether to narrow the threat model (e.g. prove intrinsic immutability) or accept loss of this one rewrite. Our evidence favors retaining conservative safety under hostile hosts.

## Source-observer compiler hotspot and bidirectional provenance experiment

The 768 reversed-alias benchmark `test/boxed-primitive-cpu-profile.test.js` uses a separate Node22 V8 `--cpu-prof` subprocess (fixed `seed:'profile-768'`, `properties:true`, `closedWorld:true`) to profile **obfuscator compilation**, not emitted execution. Source-pinned baseline at `c189eb8664dc10ac0fbe6cafbcec0df73e0db753` [CI 46120214234](https://github.com/FlareZ123/obfs/actions/runs/46120214234) shows the majority of sampled CPU in `src/ast.js:37`'s recursive `walk.go` and callback at `src/ast.js:3432` inside a large native/source-coercion alias fixed-point repeated full AST walk. The prior property-specific worklist patch does **not** fix this second, independent bottleneck.

An isolated candidate `agent11/bidirectional-source-observer-20261128` replaces this fixedpoint's source-order-only `do{walk(ast,...)}while(changed)` with an AST inventory built once plus forward/backward monotone propagation sweeps. The individual node addition rules are otherwise unchanged, and the original per-node callback body contains no `.delete`, `.clear`, `.splice`, or list sorting. This is a **bounded engineering rationale** for approaching the same closure, not a formal proof of equivalence for every executable JavaScript case. The optimized `src/ast.js` change is `393c97be9b56d5a4ac39d9d1f8dab35e56d109bf`; exact CPU experiment [CI 46120503880](https://github.com/FlareZ123/obfs/actions/runs/46120503880) at `c2f3769f1be58766d8e199754051f725a54e5531` passed all three OS with the same one private property rewrite:

| Runner | Baseline compile ms | Optimized compile ms | Reduction |
| --- | ---: | ---: | ---: |
| Ubuntu | 6,395.659 | 346.407 | 94.6% |
| Windows | 8,887.173 | 742.876 | 91.6% |
| macOS | 9,468.293 | 576.139 | 93.9% |

A focused aggregation of the original source-island suite, backend-boundary gate and primitive-host suites `test/ast-source-bidir-smoke.test.js` passed on all three OS in [CI 46120544030](https://github.com/FlareZ123/obfs/actions/runs/46120544030), head `e7948a5384ab158fc31e6b6ed57c4f5937188234`. The wrapper is **test-only**, not suitable as part of a full-suite production patch. A clean combined branch `agent11/consolidated-fast-observer-20261128` at `26ac0ef3ab4dbf22ecc3671a94186bdb9cc31175` contains the optimization, all earlier provenance/local-island corrections, and the live alias test; an exact-head [full run 46120807806](https://github.com/FlareZ123/obfs/actions/runs/46120807806) was dispatched and is pending at this report checkpoint. Do not infer its outcome.

## Corrected compiler stage-split ablation

Initial benchmark `98c2482ef2d7644fa8b35b88d861e8cbd564d4ae` [CI 46120072985](https://github.com/FlareZ123/obfs/actions/runs/46120072985) confounded `properties:false` with `closedWorld:false`. Corrected ablation `4b64bef1002c624fbe87bf9967eb41be22ab29da` [CI 46120382694](https://github.com/FlareZ123/obfs/actions/runs/46120382694) holds each factor separately: `disabledOpen` (`properties:false,closedWorld:false`), `disabledClosed` (`properties:false,closedWorld:true`), `localOnly` (`properties:true,closedWorld:false`), and `closedWorld` (`properties:true,closedWorld:true`). At the 512-alias median (3 repeats, same suite and CI runner, milliseconds):

| OS | disabledOpen | disabledClosed | localOnly | closedWorld |
| --- | ---: | ---: | ---: | ---: |
| Ubuntu | 1,631.6 | 1,680.3 | 1,628.1 | 4,870.5 |
| Windows | 1,759.9 | 1,777.0 | 1,760.6 | 5,283.2 |
| macOS | 1,139.4 | 1,495.9 | 1,390.6 | 4,406.8 |

The substantial base cost persists even with properties disabled, and the cross-file proof makes total compile cost about 3× the comparable closed-world-but-properties-disabled case. This benchmark **does not** measure emitted runtime or absolute 2.5× admissibility. The source-observer bidirectional patch targets this persistent base cost and is evaluated independently with a same-graph V8 profile.
