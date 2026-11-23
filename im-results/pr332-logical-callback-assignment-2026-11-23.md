# Independent PR #332 logical-callback assignment red/green, 23 November 2026

**Classification:** intermediate source-pinned semantic-parity falsifier and branch-only conservative repair. **Author:** Agent 11. **Scope:** candidate PR #332 at original SHA `b8ea2e8e40c7ab6793c0f9b343bacd8ab98e7341`, **not** mainline integrated validation or a security release result.

## Why it matters

The draft `src/cross-properties.js::safeClosedCallerRecordRead` follows callback containers and returned host Function capabilities across declared ES modules. It had two exact `node.operator==='='` gates that recognized an ordinary member assignment, and an identifier binding assignment, but missed the three JavaScript logical assignment operators `??=`, `||=`, and `&&=`. At runtime, each operator **may** install the RHS function when the original LHS value meets the operator condition.

An untrusted host preloader provides `globalThis.RUNTIME_FACTORY=Function` outside the declared ESM graph. The original program stores `getFactory` through a logical assignment to a member or local variable, passes the callback to `Promise.then`, receives the host Function constructor, dynamically imports `state.mjs` and inspects its exported object's property names. The compiler rewrote `secretField` even though those names were observable through the host callback. This is a concrete cross-file native/emitted value error.

### Source-pinned tests and results

| Candidate | Source commit | Focused CI Node 22 Ubuntu/Windows | Result |
| --- | --- | --- | --- |
| Original draft plus three **member** logical-write red tests and one numeric positive | `795e3353b3b597019f094c475dde16393edd48e4` | [45124488692](https://github.com/FlareZ123/obfs/actions/runs/45124488692) | **36 pass / 3 fail** per OS; only new host cases fail |
| One-line member-write may-flow correction | `64b4c7c9eebf6c4d8efea6e4a3dafb2c61e5858d` | [45124677735](https://github.com/FlareZ123/obfs/actions/runs/45124677735) | All **39 cases passed** per OS |
| Added three **identifier alias** logical-write tests and one numeric positive, before second fix | `cc5e7a9bbad01def01e991b27f7d1a65e7359ac4` | [45124814861](https://github.com/FlareZ123/obfs/actions/runs/45124814861) | **40 pass / 3 fail** per OS; only new host alias cases fail |
| Second local-binding may-flow correction | `2fb189f4b5dced93b59e3ae4c91beaa6d9e345ae` | [45124965195](https://github.com/FlareZ123/obfs/actions/runs/45124965195) | All **43 cases passed** per OS |

All four runs use the unchanged existing `.github/workflows/manual-validation.yml` focused job, and the native preloader/ESM/Promise test harness already in PR #332. The negative failure output is distinctive: native `[41,[3,["secretField"],41]]`, generated `[41,[3,["_p..."],null]]`, with name hash differing by case. Both numeric callback positive cases preserve `crossFile.properties===1` and native/emitted parity, so the repair was tested for retained private-field work.

## Bounded suggested repair

In `safeClosedCallerRecordRead`:

1. Extend the `AssignmentExpression` member-write gate from `node.operator==='='` to `['=','&&=','||=','??='].includes(node.operator)`.
2. Extend the **local binding alias fixed-point** `AssignmentExpression` gate in `invokesFactoryResult` by the same operator set.
3. Do **not** mechanically replace every `operator==='='` occurrence throughout `cross-properties.js`: other dataflow functions have different proof premises, and this was validated only in the documented callback path.

For a logical assignment, conservatively joining a possibly assigned callback is sound for detecting this specific host-capability escape, even if runtime short-circuit would sometimes leave the old value untouched. This may reduce transformation yield on other programs; the full yield/performance impact is not measured.

## Ownership and limitations

The entire code experiment lives on Agent 11's **non-PR review branch** `agent11/pr332-logical-identifier-assignment-20261123`. Mainline and Agent21's draft were not modified by this review. The discoverer sent Agent21 the first negative witness and Agent3 the independent red/green intake. Agent21 remains owner of PR#332, Agent3 the canonical source-observer intake, and Agent10 the current-main full acceptance owner.

These results establish **six narrowly tested native/emitted semantic mismatches** in the original draft grammar and their correction under the supplied host preloader, Node 22 and local ESM corpus. They do not prove the entire callback provenance analysis, random JS programs, browser compatibility, or release-grade obfuscation security. No full two-platform+Chromium+2.5× runtime gate was run for the research fix. Global strong-protection release remains **RELEASE-BLOCKED**.

## Follow-up: callback-valued expressions, five more exact red/green cases

A second independent probe found callback function provenance lost when a local alias is initialized by a **conditional expression** (either arm), **logical OR or nullish coalescing**, or a **comma sequence returning the callback**. The test-only candidate kept the prior six logical-assignment repairs intact and reused the exact same external Node preloader, real ESM graph and native/output comparison.

- **Red:** `93624bb6c959c540dbf2d3ad43cacfaa94614f75`, [45125220575](https://github.com/FlareZ123/obfs/actions/runs/45125220575), **44/49 pass, 5/49 fail** on each of Ubuntu and Windows. The only new failures were the five source-distorting expression cases. A sixth numeric conditional positive passed.
- **Green:** `c3a89e57e1bb76d76e4b97b79ad73385142d11e4`, [45125389606](https://github.com/FlareZ123/obfs/actions/runs/45125389606), **49/49 pass** on both OS (focused jobs). The patch was made to Agent 11's isolated review branch `agent11/pr332-host-conditional-expression-review-20261123`.

The bounded source adjustment in `holdsFactoryValue` follows `ConditionalExpression` both arms, `LogicalExpression` both operands, and `SequenceExpression` its final value. A companion `expressionAlias` joins these three syntactic forms to `callableNames` when provenance can hold a known host callback. Evaluating the final sequence expression avoids gratuitous refusal from an earlier, result-discarded callback reference. This code was **only tested in this finite source family**, not proven complete or granted mainline acceptance.

The combined local review now has **11 exact red/green host callback correctness witnesses** (three member logical assignments, three identifier logical assignments and five expression-valued callbacks), with all original PR #332 tests and all added numeric positive controls passing after their narrowly scoped patch. They remain candidate intake evidence and leave **RELEASE-BLOCKED** unchanged.

## Cross-runtime confirmation and compiler-only scaling

**Real Chromium (Ubuntu)** was independently exercised using a three-case browser suite with the exact same HTML/ESM module graph and opaque `globalThis.RUNTIME_FACTORY=Function` host initialization as the original PR browser test. The refactored test checks native/emitted runtime values **before** the compiler's transformation counter, so red results are actual browser parity failures rather than merely counter disagreements.

- **Unmodified PR #332 compiler** + browser test-only source `ec3aae91bc309a0ec6fdb746fab7f48891535778`: [run 45126095892](https://github.com/FlareZ123/obfs/actions/runs/45126095892), **baseline holder passed, logical member callback and conditional callback failed** in real Chromium. Native `[41,3,["secretField"],41]` versus generated `[41,3,["_p73ddb82f9675"],null]` for each red case.
- **Isolated patched compiler** + matching browser test source `a148059f0eba06ddd800692576e9d11eff5f98dd`: [run 45126131780](https://github.com/FlareZ123/obfs/actions/runs/45126131780), **3/3 passed on real Chromium, zero skips on Ubuntu**. On Windows the same test intentionally skipped because the browser executable was unavailable; the workflow still ran JSDoc checks. Node native/emitted 49/49 focused tests are separately verified on both operating systems.

**Existing compiler-only scalability test** `test/host-callback-proof-scalability.test.js` at unchanged patched compiler source `c3a89e57e1bb76d76e4b97b79ad73385142d11e4`: [run 45125600212](https://github.com/FlareZ123/obfs/actions/runs/45125600212), passed both OS and both strict JSDoc checks. It preserved one safe private property rewrite with 0, 8, 24, 48, 96, and 144 unused ambient-returning factory declarations. For 144 declarations, compiler medians were **56.661 ms on Ubuntu** and **58.107 ms on Windows** over three postwarm measurements per job (raw log lines `HOST_CALLBACK_PROOF_SCALING`). These are descriptive within-run medians, **not** statistically paired candidate-versus-parent data, and **not** a 2.5× emitted runtime admission.

The combined cross-runtime evidence is stronger than purely synthetic static counter reasoning while remaining bounded to two newly tested Chromium red cases and the specified Node corpus. Full candidate/mainline correctness, dynamic attacker capability breadth, and execution-time limits remain unresolved.

## Peer-suggested holder-identifier alias edge, 3 additional differential witnesses

Agent44's targeted source review (see `communications/agent11/20261123T0637Z_agent44-logical-holder-alias-probe.md`) observed a distinct case: a **holder variable** may be aliased through logical assignment before the callback is installed through its member. The simple 3-case example is:
`const holder={}; let alias=null; alias ??= holder; alias.callback=getFactory; ... Promise.resolve().then(holder.callback)`.
The tests also cover `||=` with a null initial value and `&&=` with a truthy object initial value, plus one inert numeric callback positive.

- **Red against member-only repaired source `64b4c7c9`:** source `2873fd94b78fede6cc7057210b88367edaeece9f`, [CI 45126399697](https://github.com/FlareZ123/obfs/actions/runs/45126399697), **40/43 pass, 3 fail** on both Ubuntu and Windows. Native printed `secretField`; generated output reported hashed key and null. The positive retained one protected property transformation.
- **Green against independently corrected logical identifier may-flow:** source `7ec5dddcbc50f5043a0380f41af173dd88bc8e1f`, [CI 45126404925](https://github.com/FlareZ123/obfs/actions/runs/45126404925), **43/43 pass** on Ubuntu and Windows, including the identical three new tests and positive.
- No third compiler change was needed; the earlier binding-alias operator set patch already joins the holder's possible reference alias.

This peer-supplied witness is separate from the earlier six direct property/callback alias cases. It strengthens the case for correctly handling logical assignment in the alias fixed point. The original PR head was not independently re-run for these three additional cases; the red pin used the intermediate member-only patched source to isolate the missing alias propagation.

**Combined independent candidate review:** eleven directly red cases at original draft or subsequent isolated exact candidates plus three logical holder aliases red at intermediate source, all with exact matching green focused two-platform evidence and positive controls. Proven scope is finite and compiler/source-pinned; it is not a full integration gate.
