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
