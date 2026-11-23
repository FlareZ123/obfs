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

## Direct and nested destructuring callback carriers: six additional red/green paths

A further structurally distinct counterexample bypassed `safeClosedCallerRecordRead`'s conservative callback alias flow without any intermediate named holder. A callback-bearing literal can be bound directly by an array or object destructuring pattern; nested patterns and defaults deliver callbacks even when the RHS literal contains no callback by itself. The existing draft had only recognized a **named identifier source** already classified as a callback-bearing holder and simple direct pattern targets.

**Six native/emitted mismatches:**
1. `const {callback}={callback:getFactory}`
2. `const [callback]=[getFactory]`
3. `const {callback=getFactory}={}`
4. `const [callback=getFactory]=[]`
5. `const {inner:{callback}}={inner:{callback:getFactory}}`
6. `const [[callback]]=[[getFactory]]`

Each used the existing opaque preloader, real ESM state module, Promise callback transfer, dynamic import and native/generated output comparison, and every native case printed `secretField` with value 41. Both numeric-destructuring controls retained exactly one private record rewrite.

- **First two red cases:** source `7ab68632f361d3857ac01bae79dcfdef07667697`, [45127042040](https://github.com/FlareZ123/obfs/actions/runs/45127042040): 50/52 passed, two failures on both OS.
- **Expanded six red cases:** source `24b51c469fbfd1eaaf525ea8131e8097635ea739`, [45127221658](https://github.com/FlareZ123/obfs/actions/runs/45127221658): **51/57 pass and 6 fail** on Ubuntu and Windows; two numeric positives passed.
- **Matched green candidate:** source `8d8c5485ba48f02a193158541623fcb9d5d28784`, [45127394775](https://github.com/FlareZ123/obfs/actions/runs/45127394775): **all 57/57 passed** both OS and strict project/external JSDoc gates.

The branch-only bounded correction in `src/cross-properties.js` walks an AST `ObjectPattern` or `ArrayPattern` worklist, collecting nested/Rest/AssignmentPattern binding names but excluding default RHS identifiers from being mistaken as bound names. It joins those names conservatively if the source expression may contain a factory callback or any nested binding default may return one. It uses the existing `holdsFactoryValue` may-flow rather than a new source gate, and does not relax the renamed-field safety veto.

Research branch `agent11/pr332-direct-destructure-review-20261123` contains this candidate. It has **not** been merged into original draft PR #332 or current-main. These six cases, added to prior 11 + 3, total **20 finite red/green callback provenance paths across explicitly distinct source pins**. The full ECMAScript grammar, browser path for this cohort, source-observation scope and universal 2.5× runtime budget remain unproven.

## Follow-up: destructuring refusal must remain slot-sensitive for proven own-data fields

The first six-pattern green patch `8d8c5485` reached 57/57 on its finite corpus, but a new **positive-yield challenge** exposed its over-conservative rule: when a literal contains an unused host callback in one field and an entirely separate numeric callback in another, indiscriminately tainting every binding suppresses a provably eligible `externalFormat` private-property rewrite.

**Red positive controls at `9f1808c9289cd86e5deb1d7cd7c32bf793319ff9`:** [focused CI 45127818456](https://github.com/FlareZ123/obfs/actions/runs/45127818456), **57 pass/3 fail of 60** on both Ubuntu/Windows. Native/generated values still match, but the three new positive tests require `crossFile.properties===1` and receive zero. This is a **yield regression**, not a native-semantic mismatch. It means the first 57/57 patch should **not** be ported as a final precision result without revision.

The three original probes were then split according to JavaScript's observable operation:

- **Proven own-data object fields:** a fresh static object literal with noncomputed, plain `init` fields and a matching static key can deliver a particular function value to a particular object binding. `{unused,numeric}={unused:getFactory,numeric:()=>7}` and `{unused=getFactory,numeric=()=>7}={unused:undefined,numeric:()=>7}` retain **one safe private-field rewrite** each. Missing or dynamic fields, getters, spread, computed property names, `__proto__` and ambiguous sources still follow conservative refusal.
- **Array binding patterns:** even a syntactically fixed array literal is consumed through the host-mutable `Symbol.iterator` method. Treating source positions as guaranteed values would invent a safety proof. Mixed host/numeric positions retain a **zero-rewrite safety veto**, and a new concrete preloader adversary replaces the numeric callback yielded in the second array slot with `()=>Function`. The generated code must preserve externally observed `secretField` when that injected capability dynamically imports the module.

The <https://tc39.es/ecma262/2026/multipage/syntax-directed-operations.html> `BindingInitialization` and `IteratorBindingInitialization` definitions ground the iterator distinction. The `ObjectBindingPattern` and `KeyedBindingInitialization` rules similarly explain own-property lookup and missing-key risks; the static compiler proof here is additionally constrained to fresh plain object literals.

**Verified refined candidate:** `src/cross-properties.js` branch-only adjustment walks nested target bindings but joins individual names by their matched ordinary own-data literal source value. All other uncertain patterns use the existing conservative host reachability may-flow. The initial 60-case source `268565ccccdc98b5f49286bca8d38af8914aa9f0` passed its [focused two-platform CI 45128670121](https://github.com/FlareZ123/obfs/actions/runs/45128670121), including both positive own-data cases and the array iterator refusal. Initial precursor `9415d840` had **60/60 Node tests green** but a strict JSDoc parse failure from an accidental `@@iterator` comment; the `268565` exact source fixed the comment and passed both strict JSDoc gates. The later source `21b655a54b0bdca722076c7f10769fe1f3944992` adds the concrete preloader iterator adversary and fixes a missing comma in that test's string-array source; [focused CI 45128936594](https://github.com/FlareZ123/obfs/actions/runs/45128936594) ran **61/61 tests green on Ubuntu and Windows**, along with strict internal/external JSDoc gates.

At precursor `650a28de` the uncorrected new test file had a JavaScript array-item comma syntax error, causing a failed run before any tests; this was repaired at `21b655`. Do not treat that infrastructure-free syntax failure as a compiler regression.

**Existing focused regressions on the refined compiler** `650a28de` also passed on both OS: `cross-file-pattern-binding-context-gate.test.js` [45128822208](https://github.com/FlareZ123/obfs/actions/runs/45128822208), `computed-pattern-cross-file-matrix.test.js` [45128826938](https://github.com/FlareZ123/obfs/actions/runs/45128826938), `closed-record-host-formal-provenance.test.js` [45128831824](https://github.com/FlareZ123/obfs/actions/runs/45128831824), `cross-file-safe-record-read.test.js` [45128837716](https://github.com/FlareZ123/obfs/actions/runs/45128837716), and `host-callback-proof-scalability.test.js` [45128848844](https://github.com/FlareZ123/obfs/actions/runs/45128848844). Real browser four-case patched graph at `71d3c7` passed [45127680446](https://github.com/FlareZ123/obfs/actions/runs/45127680446); a later isolated Ubuntu browser rerun [45128843404](https://github.com/FlareZ123/obfs/actions/runs/45128843404) ran **three cases successfully** but had an unrelated `google-chrome --version` probe timeout in its baseline, leaving that particular run failed. The browser outcome must be reported with this distinction.

**Status:** this precision result advances a finite, cross-platform correctness-yield tradeoff; it does not establish complete dataflow safety for all JavaScript, runtime 2.5× compliance, or a strong obfuscation release. Candidate code remains on `agent11/pr332-destructure-mixed-precision-20261123`, outside draft PR #332 and mainline. In particular, the extra conservative array refusal may reduce protected-work yield beyond the measured corpus and must be evaluated against matched ordinary controls before promotion.

### Refined candidate: real Chromium revalidation

An isolated **post-precision-adjustment** manual browser run [45129127290](https://github.com/FlareZ123/obfs/actions/runs/45129127290) at exact `21b655a54b0bdca722076c7f10769fe1f3944992` passed **all four native/generated ESM Chromium scenarios on Ubuntu with zero skips**: original baseline holder, logical member assignment, conditional alias, and defaulted object-destructured callback. Windows finished its focused JSDoc checks but intentionally skipped Chrome execution due unavailable browser executable. This clean post-fix run supersedes the earlier browser-version timeout at 45128843404 for candidate validation, without erasing the documented transient failure.

The refined source simultaneously passed the **61/61 two-platform Node suite** at [45128936594](https://github.com/FlareZ123/obfs/actions/runs/45128936594) and all five additional focused suites at the compiler-equivalent 650a source. This is bounded cross-runtime correctness and positive-yield evidence; broad mainline integration, 2.5× emitted runtime admission, and the primary strong-protection objective remain unestablished.
