# Mainline-based SCO lexical and host admission composition, 22 November 2026

**Status:** intermediate integration evidence. Do not promote to `results/` or release until combined-source review. This work concerns *compiler admission correctness and compile-time cost*, not proven code secrecy or adversarial tamper resistance.

## Reproducible source boundary

The canonical integration candidate is [`agent40/sco-main-lexical-composition-20261122`](https://github.com/FlareZ123/obfs/tree/agent40/sco-main-lexical-composition-20261122), commit **`d0ad1d172538c3bd4b6532a10bfec4d7e15fc53a`**, based directly on main commit **`ad7ea18859d951724adb5b89835c59017c622f96`**. It was committed as one Git tree update and remotely verified by matching blob SHAs.

The patch preserves all existing mainline `src/sco-selective-partition.js` logic other than 15 bounded source hunks: the initial 2,246-line file and Agent29's pre-reviewed host/lexical composition differed only in 108 additions and one replacement. The integrated file matches Agent29's earlier verified blob `f86e0b28efee64907571c4b0c87d5d12f0aa9931`. The accompanying free-reference scanner is Agent40's optimized blob `6e9c96ce595a9055518c1a628915b7e32f04e4e1`, superseding the earlier scanner from Agent29's branch. Nine source-pinned regression test files were included without changing existing mainline tests.

The resulting compiler changes:
- classify unqualified selected-private and audited-private ESM name reads via explicit lexical scope/source review, refusing unknown application globals that could resolve differently after browser-to-Node relocation;
- retain actual function-scoped `var` hoists through ordinary blocks, while refusing nested-function/class-static-block escapes and function-body `var` proofs for parameter initializers;
- distinguish switch discriminant evaluation from case-block lexical binding, preserving the independent Agent29 counterexample and the positive case-level hoisted-`var` control;
- cache declaration inventories once per lexical scope and prune nested variable environments during hoist scans, strictly compile-time changes;
- refuse supported cross-host `Atomics.wait` CanBlock and `Blob({endings:'native'})` cases and legacy `TextDecoder` configuration escapes, based on the prior Agent29/Agent36 work.

The original source and tests are available in [stacked draft #285](https://github.com/FlareZ123/obfs/pull/285) on [draft #272](https://github.com/FlareZ123/obfs/pull/272). The above current-main branch is the proposed single consolidation and is not yet merged.

## Source-pinned acceptance matrix

| Candidate and frozen SHA | Test / control | Result |
| --- | --- | --- |
| Agent40 original `e95d7ff734296f71534f7867c4d5880d2a4270b1` | [Focused SCO var and authenticated facade](https://github.com/FlareZ123/obfs/actions/runs/45072188553), Ubuntu/Windows + strict JSDoc | **PASS** |
| Same original SHA | [Acorn lexical inventory complexity guard](https://github.com/FlareZ123/obfs/actions/runs/45072206610), Ubuntu/Windows + strict JSDoc | **PASS** |
| Same original SHA | [136 native strict-realm sensitivity pairs](https://github.com/FlareZ123/obfs/actions/runs/45072223371), Ubuntu/Windows + strict JSDoc | **PASS** |
| Same original SHA | [Full Node/Chromium/JSDoc/performance/adversarial integration](https://github.com/FlareZ123/obfs/actions/runs/45072323546), Ubuntu/Windows | **PASS** |
| Composed `d0ad1d172538c3bd4b6532a10bfec4d7e15fc53a` | [Selected SCO var](https://github.com/FlareZ123/obfs/actions/runs/45072973861) | **PASS**, Ubuntu/Windows + strict JSDoc |
| Same composed SHA | [Native V8 lexical differential](https://github.com/FlareZ123/obfs/actions/runs/45072977946) | **PASS**, Ubuntu/Windows + strict JSDoc |
| Same composed SHA | [Blob native newline host compatibility](https://github.com/FlareZ123/obfs/actions/runs/45072982747) | **PASS**, Ubuntu/Windows + strict JSDoc |
| Same composed SHA | [Atomics agent-blocking host compatibility](https://github.com/FlareZ123/obfs/actions/runs/45072987841) | **PASS**, Ubuntu/Windows + strict JSDoc |
| Same composed SHA | [Native TextDecoder Node 22/22.16 versus Chromium](https://github.com/FlareZ123/obfs/actions/runs/45073145713) | **PASS**, both Node variants on Ubuntu |
| Same composed SHA | [Full source-pinned two-platform integration](https://github.com/FlareZ123/obfs/actions/runs/45073141991) | **IN PROGRESS at initial report** |

These rows are different acceptance boundaries. Green focused tests do not substitute for combined full Node/browser validation. Strict JSDoc proves checked declarations for the tested program, not arbitrary runtime semantics. The native `Blob` and `Atomics` cases are refusal guards and thus prove no new protected-code yield. The source-pinned full green for the **prior** branch must not be presented as full green for this combined candidate.

## Prior independent adversarial/causal checks

The original ordinary free-name migration red witness and selective SCO lexical repair are documented in [#272](https://github.com/FlareZ123/obfs/pull/272). Agent29's combined scope/host branch `4515b39362688538a1ed077c18aa8d6ee1330377` independently passed its [Chrome test](https://github.com/FlareZ123/obfs/actions/runs/45009428995) and six focused Ubuntu/Windows suites. The [`var`-scope pruned walker report](sco-var-hoist-pruned-traversal-2026-11-22.md) preserves locally repeated collector-only and full-preflight A/B timings and exact counterexamples. Compile-preflight A/B timings do **not** measure obfuscated runtime compute or establish the 2.5× bound.

## Decision boundary and integration acceptance

The candidate is proposed for one reviewed mainline integration after complete, same-SHA two-platform Node/JSDoc/browser evidence. Peer review should verify source composition with newer main, the `switch` discriminant refusal and `var` positive, the Atomics/Blob/TextDecoder negative cases and their admitted controls, then choose whether drafts #272 and #285 can be marked superseded. Avoid merging stacked branches on top of the current candidate.

The primary release assessment remains **RELEASE-BLOCKED**. The authorized SCO caller can relay responses, the COO/SNO attacker can instrument or modify locally delivered code, and existing selected source/workload evaluations have strict >2.5× protected-runtime pairs. A syntax-based free-name checker cannot establish full cross-host equivalence for every JavaScript grammar construct, host builtin, asynchronous event, or external observer. No generalizable security advantage over equal-trust alternatives follows from this integration.