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

The original source and tests are available in [stacked draft #285](https://github.com/FlareZ123/obfs/pull/285) on [draft #272](https://github.com/FlareZ123/obfs/pull/272). The above current-main branch is the proposed single consolidation, now available as [draft integration PR #302](https://github.com/FlareZ123/obfs/pull/302), and is not yet merged.

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
| Same composed SHA | [Full source-pinned two-platform integration](https://github.com/FlareZ123/obfs/actions/runs/45073141991) | **PASS**, Ubuntu and Windows jobs, JSDoc, benchmark, adversarial steps, Ubuntu Chromium |

These rows are different acceptance boundaries. All five staged combined-candidate workflows are now **green** on the **same** source SHA, including the full Node/browser gate. Focused tests alone would not substitute for this combined full validation. Strict JSDoc proves checked declarations for the tested program, not arbitrary runtime semantics. The native `Blob` and `Atomics` cases are refusal guards and thus prove no new protected-code yield. The standalone prior-branch full green remains a distinct claim. The combined-candidate full run is now separately **green** at its own frozen SHA.

## Prior independent adversarial/causal checks

The original ordinary free-name migration red witness and selective SCO lexical repair are documented in [#272](https://github.com/FlareZ123/obfs/pull/272). Agent29's combined scope/host branch `4515b39362688538a1ed077c18aa8d6ee1330377` independently passed its [Chrome test](https://github.com/FlareZ123/obfs/actions/runs/45009428995) and six focused Ubuntu/Windows suites. The [`var`-scope pruned walker report](https://github.com/FlareZ123/obfs/blob/agent40/sco-var-hoist-proof-20261122/im-results/sco-var-hoist-pruned-traversal-2026-11-22.md) preserves locally repeated collector-only and full-preflight A/B timings and exact counterexamples. Compile-preflight A/B timings do **not** measure obfuscated runtime compute or establish the 2.5× bound.

## Decision boundary and integration acceptance

The candidate is proposed for one reviewed mainline integration after complete, same-SHA two-platform Node/JSDoc/browser evidence. Peer review should verify source composition with newer main, the `switch` discriminant refusal and `var` positive, the Atomics/Blob/TextDecoder negative cases and their admitted controls, then choose whether drafts #272 and #285 can be marked superseded. Avoid merging stacked branches on top of the current candidate.

The primary release assessment remains **RELEASE-BLOCKED**. The authorized SCO caller can relay responses, the COO/SNO attacker can instrument or modify locally delivered code, and existing selected source/workload evaluations have strict >2.5× protected-runtime pairs. A syntax-based free-name checker cannot establish full cross-host equivalence for every JavaScript grammar construct, host builtin, asynchronous event, or external observer. No generalizable security advantage over equal-trust alternatives follows from this integration.

## Combined-source full integration verdict, 21:45 UTC

The [full GitHub Actions validation 45073141991](https://github.com/FlareZ123/obfs/actions/runs/45073141991) concluded **success** at exactly `d0ad1d172538c3bd4b6532a10bfec4d7e15fc53a`. Both `node22 (ubuntu-latest)` and `node22 (windows-latest)` jobs completed with `conclusion=success`; Ubuntu also ran all configured Chromium checks. The same frozen-source candidate already passed all four focused Ubuntu/Windows suites and the Node22/22.16/Chrome TextDecoder cross-runtime comparison. This closes the previously pending **source-pinned CI acceptance** requirement. **Independent source review and canonical merge into moving main remain pending.** Full CI does not prove arbitrary JavaScript semantic equivalence, strong obfuscation security, or a universal <=2.5x protected-runtime bound.


## Later test-only safeguard: default-parameter realm mismatch, 21:52 UTC

Independent native `vm.runInNewContext` executions demonstrate that `async function protectedOp(value=externalBridge){return value}` evaluates to a browser-injected `43` when called without arguments in one realm and rejects `ReferenceError` in an otherwise identical realm without that global. This motivated an explicit SCO admission audit of default-parameter expressions.

**Root-cause and corrected interpretation:** The selected-SCO lexical preflight inspects private bodies, not the selected root's parameter defaults. It can therefore give an incomplete diagnostic, sometimes falsely labeling a safe defaulted parameter's body reference `value` as an unproved global. This does **not** establish unsafe emitted SCO behavior. The downstream `partitionScoAsyncModule` enforces **plain identifier parameters** before any RPC partition is emitted. The same test with an unused default (so the body preflight cannot mask it) throws `RPC partition requires distinct non-generator async functions with plain parameters`. This confirms fail-closed admission at the narrower supported architecture.

Two intentionally red exploratory test-only pins [`746595fc`](https://github.com/FlareZ123/obfs/actions/runs/45074136867) and [`86dfb486`](https://github.com/FlareZ123/obfs/actions/runs/45074241892) revealed, respectively, the misleading body-scope diagnostic and the independent downstream plain-formal refusal. The regression was corrected to assert the actual supported contract: eight nonplain default/rest/destructured cases refused, native realm sensitivity reproduced, plain formal positives retained, unknown free body reads refused. [Final two-OS focused+JSDoc **GREEN** workflow 45074375766](https://github.com/FlareZ123/obfs/actions/runs/45074375766) at test-only commit `394e53e18ae792fe106f25f37c1db3c60a4161a8`.

The compiler source blobs at the latest test head still exactly equal the full-green source: `src/sco-selective-partition.js` `f86e0b28efee64907571c4b0c87d5d12f0aa9931`; `src/sco-free-references.js` `6e9c96ce595a9055518c1a628915b7e32f04e4e1`. No production-code change resulted. The earlier full [45073141991](https://github.com/FlareZ123/obfs/actions/runs/45073141991) remains source-valid at its own `d0ad1d...` pin, and the new test-only head is supported by focused validation. Do not misstate a test-only full-run pin or claim a proven exploit.

Drafts [#272](https://github.com/FlareZ123/obfs/pull/272) and [#285](https://github.com/FlareZ123/obfs/pull/285) have now been closed as superseded with preserved source/evidence links. One active canonical [draft #302](https://github.com/FlareZ123/obfs/pull/302) awaits independent review and main integration.


## Generated independent native-realm scope challenge, 21:57 UTC

Added test-only `test/sco-lexical-generated-native-differential.test.js` at canonical-PR branch commit `eb8edcee0d9bd83df5d1a5ba49cfc08047a35490`. It deterministically crosses **18 declaration/context prefixes** with **17 reference/observation suffixes** and **three nested function wrapper depths** (918 generated source strings), parsing as strict ESM function bodies through the exact compiler parser. Syntax-invalid declaration conflicts are skipped and counted; the test requires at least **750 valid** instances, plus at least 100 locally-proven, 100 refused and 100 externally-sensitive oracle examples. The sources include `var`/lexical/static/switch/loop/catch scopes, closure access, getters, computed property names, class static fields, helper defaults and TDZ paths.

For each valid case the test calls the actual `firstUnprovedFreeReference` scanner, then executes the same strict native function with an external `x` omitted and injected as `73` in isolated Node V8 realms. If the checker proves all relevant names local (returns `null`), the normalized primitive-result-or-exception outcome must be identical. The reverse implication is intentionally not required because conservative false refusals are allowed. The oracle ignores stack traces and nonprimitive identity, so this is a bounded *external-name soundness screen*, not complete observable behavior equivalence.

[Exact-head focused + strict JSDoc GitHub Actions **45074852383**](https://github.com/FlareZ123/obfs/actions/runs/45074852383) passed Ubuntu and Windows at `eb8edcee0d9bd83df5d1a5ba49cfc08047a35490`. It found no external-name false local proof among the valid generated cases. The scanner and selective compiler production source remain byte-identical to the previous full-green `d0ad1d...` code pin; the new head includes test-only additions. No new obfuscation security or universal runtime CPU claim follows.


## Host-parity admission falsified and repaired: reflective Blob construction, 22:11 UTC

Agent 8 independently identified a likely cross-host loophole in `realmStateObservation`: the direct `new Blob(...,{endings:'native'})` safeguard cannot see the same constructor passed to `Reflect.construct`. The exact selected-SCO source `const blob=Reflect.construct(Blob,[['A\\nB'],{endings:'native'}]); return [...new Uint8Array(await blob.arrayBuffer())];` **was admitted**. [Red-on-Ubuntu-and-Windows run 45075311256](https://github.com/FlareZ123/obfs/actions/runs/45075311256), source `bc954fb83e1b65f9d89dc6243f2ff1803e59ba6f`, directly confirms wrong compiler admission. Native V8 yielded byte `[65,10,66]` on Linux and `[65,13,10,66]` on Windows with `endings:'native'`; `'transparent'` remained stable. This is a **real bounded functional equivalence defect** in cross-host SCO, separate from the still-blocked strength/security claims. See [official Node Blob native endings semantics](https://nodejs.org/download/release/v22.18.0/docs/api/buffer.html) and [Reflect.construct argument-list semantics](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Reflect/construct).

An initial conservative direct-`CallExpression` refusal passed [focused two-platform run 45075535939](https://github.com/FlareZ123/obfs/actions/runs/45075535939) but was **falsified** by a spread into `Reflect.construct(...[Blob, args])`, [RED two-platform 45075653235](https://github.com/FlareZ123/obfs/actions/runs/45075653235). This caused the final repair to treat first-class Blob constructor values as host-configuration dependent unless they are direct `new` callees (where the existing options proof applies), plain tracked constructor aliases, lexical declaration/binding positions or harmless `typeof`. Array/object containers, spreads, `Proxy` construction, reflected calls and `Blob.bind` must conservatively refuse. The strengthened source passed [45075832846](https://github.com/FlareZ123/obfs/actions/runs/45075832846). Positive tests were then added for `new Blob(...,{endings:'transparent'})`, `const Ctor=Blob;new Ctor(...,{endings:'transparent'})` and a two-hop simple local alias. Explicit `globalThis.Blob` aliases remain refused by an earlier separate ambient-host guard and are **not** claimed admitted. The corrected [two-platform + strict JSDoc run **45076009966**](https://github.com/FlareZ123/obfs/actions/runs/45076009966) completed **success** at `dbcf6943873f3f8d50dd001d1383217d6287db1d`.

The production compiler changed from prior full green: `src/sco-selective-partition.js` changed from blob `f86e0b28efee64907571c4b0c87d5d12f0aa9931` to a new frozen blob (see the current canonical branch). The entire corrected candidate was then merged onto main snapshot `1cfaba1bbe75fda322c9827c09a43ebc87993589` in two-parent branch commit **`9e35686024f05d9a849a880e023f13eb897050bf`**, based on a main tree plus 14 nonoverlapping SCO source/test paths. The earlier full [45073141991](https://github.com/FlareZ123/obfs/actions/runs/45073141991) is **historical for old source only**. A new comprehensive Ubuntu/Windows/Chromium and Node22/22.16 decoder compatibility workflow were queued at the new commit. Do not label the revised compiler full-suite green until those exact-source runs complete; preserve the source pins and red-first experiments.
