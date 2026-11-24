# Independent PR #332 logical-callback assignment red/green, 23 November 2026

**Classification:** intermediate source-pinned semantic-parity falsifier and branch-only conservative repair. **Author:** Agent 11. **Scope:** candidate PR #332 at original SHA `b8ea2e8e40c7ab6793c0f9b343bacd8ab98e7341`, **not** mainline integrated validation or a security release result.


## Latest cross-file source-provenance status (23 November 2026, 09:23 UTC)

The frozen PR #332 head remains **DRAFT / UNMERGED / RELEASE-BLOCKED**. Its original full gate is still 54/5,079 Node failures on both OSes, and the separate cross-module callback-holder matrix remains 16/38 red. The new pattern tests below are additional semantic evidence, not a substitute for those blockers.

- **ForIn host-prototype source:** direct object-pattern declaration and assignment forms fail on current main and frozen PR #332; the candidate also fails a simple ForIn string-key followed by later destructuring and an exported cross-file function-return path. A plain ForIn identifier with no destructuring remains a positive control preserving one safe cross-file rewrite.
- **Primitive String source:** direct `const {callback:Loader}="x"` fails even with no ForIn. Candidate run [45143302218](https://github.com/FlareZ123/obfs/actions/runs/45143302218) is 5 failures / 1 positive-control pass on both OS. The same isolated test fails on current-main control [45143663778](https://github.com/FlareZ123/obfs/actions/runs/45143663778) and frozen PR #332 control [45143671525](https://github.com/FlareZ123/obfs/actions/runs/45143671525), both OS.
- **Number primitive source:** direct `const {callback:Loader}=0` under a host `Number.prototype.callback` getter also fails on the candidate [45144263720](https://github.com/FlareZ123/obfs/actions/runs/45144263720), current-main control [45144429687](https://github.com/FlareZ123/obfs/actions/runs/45144429687), and frozen PR #332 control [45144436278](https://github.com/FlareZ123/obfs/actions/runs/45144436278), all both OS. This confirms the boxed-primitive issue is not String-only.
- **Boxed primitive matrix:** correctly targeted source-paired controls now show 8 failures / 1 arithmetic positive-control pass on both OS for Number/Boolean/BigInt/Symbol object+array patterns on current main [45146233899](https://github.com/FlareZ123/obfs/actions/runs/45146233899) and frozen PR #332 [45146283881](https://github.com/FlareZ123/obfs/actions/runs/45146283881). Earlier 45144780684/45144833430 were mis-targeted default-suite runs and are excluded.
- **Independent iterator/member-read channels:** Agent38's expanded test-only matrix [45143823490](https://github.com/FlareZ123/obfs/actions/runs/45143823490) is 8 failures / 2 positive-control passes on both OS; the exact frozen PR #332 control [45144219853](https://github.com/FlareZ123/obfs/actions/runs/45144219853) has the same 8/10 split. It covers host-mutated `String.prototype[Symbol.iterator]`, direct `key.callback` reads, and cross-file StringKey flows.
- **Primitive prototype method dispatch:** Agent38's valid focused [run 45145024353](https://github.com/FlareZ123/obfs/actions/runs/45145024353) reports 4 failures / 2 passes on both OS: host-mutated String/Number/Boolean/BigInt `.toString()` methods return Function; Symbol `.toString()` and primitive arithmetic are green controls. This is a separate host-controlled sink beyond direct member reads and destructuring.
- **Direct member-read sink:** Agent38's independent test-only branch [45143534036](https://github.com/FlareZ123/obfs/actions/runs/45143534036) adds `const Loader=key.callback` on a ForIn StringKey receiver; it is 7 failures / 1 plain-key positive pass on both OS. PrimitiveString taint therefore needs to cover direct member reads as well as object/array destructuring.
- **Required analysis direction (proposal, not implementation):** distinguish primitive-origin values from inert own-data records. A StringKey/PrimitiveString fact must propagate through ForIn bindings, aliases, assignments, function returns and cross-file calls. Convert it to unknown host-provided values when consumed by object/array destructuring, because boxing/Get may consult String.prototype/Object.prototype accessors and array binding may consult the string iterator. Do not mark a plain string key callable merely because it came from ForIn; retain the positive control. A broader boxed-primitive rule may be needed for Number/Boolean/BigInt/Symbol as well.

All new probes remain on test-only branches. No compiler source, mainline implementation, or PR #332 was modified by this review. Agent3 remains canonical source-observer intake owner, Agent21 owns PR #332, and Agent10 owns full-suite disposition. Keep the draft unmerged pending one consolidated implementation/review and exact-head full-gate admission.


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

## Iteration loop-head pattern binding is a separate host callback ingress

With the previously refined callback/provenance patch pinned at `21b655a54b0bdca722076c7f10769fe1f3944992`, three newly evaluated real Node ESM cases revealed a further **native/emitted semantic mismatch**: `for (const {callback} of [{callback:getFactory}])`, `for (const [callback] of [[getFactory]])`, and `for await (const {callback} of [{callback:getFactory}])`. Each drives `Promise.resolve().then(callback)` to obtain an opaque preloader-provided `Function`, dynamically reimports generated `state.mjs`, and observes the real `secretField` name. The compiler renamed that exported owner key.

- **Red test-only source** `afb1ac89a6fc56b9dac7399cb9a2698f0bc6ee34`: [focused CI 45129513447](https://github.com/FlareZ123/obfs/actions/runs/45129513447), **61 pass /3 fail of 64 cases** on both Ubuntu and Windows, with exact native `secretField` versus generated hashed keys and null values.
- **Green branch-only source** `c39baab0c30f72f732961a01f4d92d7cbc08d5c7`: [focused CI 45129675317](https://github.com/FlareZ123/obfs/actions/runs/45129675317), **64/64 pass** on Ubuntu and Windows with both strict internal/external JSDoc checks, preserving all earlier positive own-data object rewrites and hostile-array-iterator refusal tests.

The bounded patch in `src/cross-properties.js::safeClosedCallerRecordRead` recognizes a `ForOfStatement` (including ESTree's `await:true` form) and obtains either its direct LHS pattern or the first `VariableDeclaration.declarations[0].id`, feeding that pattern to the existing conservative callback-target tracing using the iterated RHS only as an **unknown potential source**. The reason is semantic: a loop binding receives values produced by an iterator at runtime; it cannot safely assume that the static iterable's corresponding literal elements are the values bound. A fixed-point loop still marks only previously unknown reachable callable names.

This is a separate loop-head grammar path beyond ordinary `VariableDeclarator` or `AssignmentExpression` destructuring, and a finite red/green result rather than general host provenance completeness. Test branch `agent11/pr332-loop-pattern-review-20261123` remains unmerged and outside PR #332. **Global RELEASE-BLOCKED unchanged**.

## Direct loop identifiers and catch-clause bindings: additional grammar coverage

### Direct loop identifier controls

An extra three variants of the prior `ForOfStatement` fix used simple identifier targets instead of destructuring: `for(const callback of [getFactory])`, `for await(const callback of [getFactory])`, and `let callback;for(callback of [getFactory])`. At source `461ea50570fba4fad2dc07cab380d1df49930ba4`, [focused CI 45129945286](https://github.com/FlareZ123/obfs/actions/runs/45129945286) passed **67/67** Node tests on both OS, including those three additions, with no further compiler change. This is a confirmed positive coverage expansion and **does not add three independent red witnesses**.

### CatchClause binding provenance: three new exact red/green witnesses

The same draft analysis omitted a separate AST binding path: `catch({callback})`, `catch([callback])`, and nested `catch({inner:{callback}})` receive a value thrown by a `try` block. Each case constructs a direct thrown object or array containing the declared `getFactory` callback, passes it through Promise.then to the ambient host `Function`, dynamically imports generated `state.mjs`, and inspects the exact `secretField` published name. Native output has the original field/value, while generated output renamed the key and returned null.

- **Red test-only** source `f597963dba6e5b411b21d5ce97f3cf2940149018`: [focused CI 45130258617](https://github.com/FlareZ123/obfs/actions/runs/45130258617), **68 pass /3 fail of 71** Ubuntu and Windows. A fourth new primitive callback from a known literal `throw {callback:()=>7}` preserved one unrelated private-field rename in both red controls.
- **Green branch-only** `src/cross-properties.js` source `1ad1f37f5916155f26236d53011d32e609c2935e`: [focused CI 45130493429](https://github.com/FlareZ123/obfs/actions/runs/45130493429), **71/71 pass on Ubuntu and Windows** with both strict JSDoc gates, including the numeric catch positive.

The bounded adjustment recognizes `CatchClause.param` as a potential callback-binding target. When the immediate parent `TryStatement` has exactly one direct `ThrowStatement`, it passes the thrown AST expression into the existing nested/static-own-data pattern may-flow, preserving a numeric own-data literal's independently eligible property rewrite. For other try bodies, it conservatively regards the catch value as unknown and joins all pattern targets when an ambient-returning factory may exist. The patch does not claim to prove the absence of implicit errors during arbitrary expressions, and it is not a complete exception-flow or interprocedural catch theorem. This is finite correctness and positive-work evidence.

Current branch: `agent11/pr332-catch-pattern-review-20261123`. All preceding loop-head, inline binding, own-data object precision, host iterator, logical assignment and expression callbacks remain green in the focused suite. No compiler implementation was merged into Agent21's original draft PR #332 or shared mainline. Release remains **RELEASE-BLOCKED**.

### Final catch-source focused compatibility receipts

At the **exact catch-patched source** `1ad1f37f5916155f26236d53011d32e609c2935e`, two additional pattern validation suites passed both Ubuntu/Windows: `test/cross-file-pattern-binding-context-gate.test.js` [CI 45130781052](https://github.com/FlareZ123/obfs/actions/runs/45130781052) and `test/computed-pattern-cross-file-matrix.test.js` [CI 45130787231](https://github.com/FlareZ123/obfs/actions/runs/45130787231). A matched [real Chromium browser gate 45130793264](https://github.com/FlareZ123/obfs/actions/runs/45130793264) completed **4/4 native-versus-generated ESM scenarios green, zero skips in Ubuntu Chromium**: baseline, logical assignment, conditional alias, defaulted object destructuring. Windows runs strict type checks and skips browser due unavailable executable. The same source independently passed [71/71 Node cases on both OS](https://github.com/FlareZ123/obfs/actions/runs/45130493429).

These source-pinned focused gates comprise the final review-branch baseline for this invocation. They are *not* the current-main full integration gate or 2.5× emitted runtime admission. PR #332 and current-main have not incorporated this candidate.


## Additional ForInStatement binding-pattern host callback falsifier

**Agent 11, 23 November 2026.** This is a distinct grammar path not covered by the preceding ForOf/catch review. It is a finite host-environment correctness witness against the current candidate branch, not a general ForIn or prototype theorem.

The isolated review branch `agent11/pr332-for-in-pattern-review-20261123` is based on the catch-patched source `1ad1f37f5916155f26236d53011d32e609c2935e`. Test source `test/cross-file-for-in-host-pattern-gate.test.js` is at `23acb766fb59fb4d7bc18df289d313a58f1b9c75`; the initial test-only commit was `d30f844c0976219c60b4937b47eb8f1254bb501b`.

The two-module ESM fixture exports `state={secretField:53}`, imports it into `main.mjs`, then executes:

```js
for (const {callback:Loader} in ["x"]) {
  injected=Loader('return import("./state.mjs")');
}
const remote=await injected();
console.log(JSON.stringify([
  state.secretField,
  Object.keys(remote.state),
  remote.state.secretField
]));
```

A host-owned Node `--require` preloader (outside the compiler graph) installs a configurable getter on `String.prototype.callback` that returns the native `Function` constructor. The ForInStatement yields the string key `"0"`; object-pattern destructuring performs a property read on that string wrapper and invokes the inherited getter, so `Loader` receives the host Function constructor. The resulting dynamically imported module is not visible in the source graph.

At exact candidate source `1ad1f37f5916155f26236d53011d32e609c2935e`, the focused [run 45139289282](https://github.com/FlareZ123/obfs/actions/runs/45139289282) failed on **both Ubuntu and Windows**. Native output was `[53,["secretField"],53]`; emitted output was `[53,["_pde6d7fbcf816"],null]`. The cross-file pass reported one property rewrite. This is a real Node ESM execution with an external preloader, not a synthetic AST-only assertion.

The current `safeClosedCallerRecordRead` binding walk handles `ForOfStatement` and `CatchClause`, but does not handle `ForInStatement` as a loop-head binding source. A ForInStatement does **not** bind values from its RHS: it binds property-key strings. Destructuring those strings can nevertheless read host-modified inherited `String.prototype` accessors; array patterns can also consult the host-modified string iterator. The RHS object must never be treated as the loop's bound value.

**Review recommendation:** before integrating this candidate, conservatively treat a ForInStatement's destructuring LHS as an unknown source and taint its binding targets (including nested object/array/default/rest targets); do not infer a binding from `node.right`. A simple identifier loop target receives a string key and does not by itself need callback taint. Preserve a matched numeric own-data positive control if a narrower proof is attempted. No compiler patch was made in this review branch. This witness is separate from the earlier host-iterator and catch-binding families and should be added to the same canonical intake rather than spawning another report.


### Source-paired mainline control: the ForIn mismatch predates this candidate

To distinguish a candidate regression from a baseline defect, the identical test `test/cross-file-for-in-host-pattern-gate.test.js` was copied unchanged onto a test-only branch from current main at `91d46a0eaec6a74395d29203c0c754aefd5d9c4f`:

- Control branch: `agent11/for-in-host-pattern-mainline-control-20261123`.
- Test commit: `63bd9a70b5154cd870ac32b4db462d328e697c4e`.
- Focused [run 45139644479](https://github.com/FlareZ123/obfs/actions/runs/45139644479): **failed on both Ubuntu and Windows**, with the same native/emitted outputs as the candidate run: `[53,["secretField"],53]` versus `[53,["_pde6d7fbcf816"],null]`.

Therefore the ForIn source-parity defect is **already present on the observed mainline baseline**; the Agent11 catch/ForOf candidate neither introduced nor fixed it. This is a baseline release-blocking correctness issue, and the candidate intake must not describe its finite green ForOf/catch matrices as covering all loop-head binding forms. The two source-pinned runs provide a matched attribution: candidate `1ad1f37...` red and mainline `91d46a0...` red, both on both OSes. No mainline compiler implementation was changed by these controls.


### Exact PR #332 frozen-head control

The same two-case test file (ForIn object binding declaration and assignment pattern) was also run unchanged against Agent21's exact frozen PR #332 head `b8ea2e8e40c7ab6793c0f9b343bacd8ab98e7341`:

- Test-only branch: `agent11/pr332-for-in-host-pattern-pr332-control-20261123`.
- Test commit: `35576ea544ca53403f38e162f81179aea139f130`.
- Focused [run 45140171695](https://github.com/FlareZ123/obfs/actions/runs/45140171695): both cases **failed on Ubuntu and Windows** with the same mismatches as the mainline and Agent11-candidate controls.

This confirms that the frozen PR #332 draft does not repair the baseline ForIn host-prototype callback defect. The source-paired evidence now covers three exact revisions: current main, Agent11's catch/ForOf candidate, and Agent21's frozen PR head. The declaration and assignment pattern forms both fail on the candidate and PR; the declaration form also fails on current main. The PR remains draft and independently release-blocked by its already documented full-gate and 16/38 cross-module matrix failures. This ForIn witness adds to those existing blockers; it does not replace them.


### Follow-on StringKey flow and precision control

The ForIn test-only branch was extended to distinguish direct loop-head destructuring from a simple string-key binding that is destructured later:

```js
for (const key in ["x"]) {
  const {callback:Loader}=key;
  injected=Loader('return import("./state.mjs")');
}
```

This is important because a fix that only taints direct `ForInStatement.left` patterns will still miss the later `VariableDeclarator` pattern. The loop's simple identifier receives a property-key string; when that value is later destructured, `String.prototype.callback` is consulted and the host getter can supply `Function`.

The current candidate test file at `9e82e712ca2298285eb4d15ace896788a2cec859`, [run 45140889201](https://github.com/FlareZ123/obfs/actions/runs/45140889201), has **three distinct semantic failures and one passing positive control on both Ubuntu and Windows**:
- direct object-pattern declaration: generated key `_pde6d7fbcf816`;
- direct object-pattern assignment: generated key `_pf024082ab089`;
- simple ForIn key followed by object-pattern destructuring: generated key `_p57008e9b9143`;
- plain ForIn identifier with no destructuring: passes and preserves `crossFile.properties=1`.

The native result in each negative case is `[53,["secretField"],53]`; generated results expose the renamed key and return `null` for the stale dynamic-import lookup. The positive control shows why the right abstraction is not “every ForIn identifier is callable”: retain a distinct **StringKey-origin** fact for simple loop variables, and convert it to unknown host-value taint only when consumed by object/array destructuring (including nested/default/rest targets). Propagate StringKey through ordinary aliases/assignments before such destructuring. Direct ForIn destructuring should taint its targets immediately. Never treat `node.right` as the bound value.


### Cross-file function-return StringKey propagation failure

The same test-only branch was extended with a three-module ESM case:

- `keys.mjs` exports `getKey()`, which returns a simple ForIn property-key string.
- `main.mjs` imports `getKey`, destructures `{callback:Loader}` from `getKey()`, then invokes the host-provided callback to dynamically import `state.mjs`.
- The host preloader still supplies `String.prototype.callback` as an inherited getter returning `Function`.

At test commit `e4c6195f3807669c5dd7f9c88b989d5247315703`, focused [run 45141620747](https://github.com/FlareZ123/obfs/actions/runs/45141620747) failed on both Ubuntu and Windows. The five-case suite reported **four failures and one passing plain-identifier positive control**. The new cross-file-return case produced native `[53,["secretField"],53]` versus emitted `[53,["_pc3b043b29d7d"],null]`.

This establishes that the required provenance is not merely a direct ForIn loop-head flag. A simple property-key string can leave its loop scope through a function return, cross an ESM export/import edge, and later be destructured. The proposed StringKey fact therefore needs to propagate through function return summaries and cross-file calls, as well as local aliases/assignments, before being converted to unknown host-value taint at object/array destructuring. The current candidate does not do this. This remains a test-only finding; no compiler source was changed.


### Direct String primitive destructuring: the issue is broader than ForIn

A sixth test removes ForIn entirely and performs direct object destructuring from a string literal:

```js
const {callback:Loader} = "x";
const injected=Loader('return import("./state.mjs")');
```

The same host-owned preloader installs `String.prototype.callback` as a getter returning `Function`. The getter is invoked by ordinary object-binding initialization after boxing the string primitive; the hidden importer then observes the transformed state module.

At test commit `f0080da37b08c5d2f36d0016e0103d1f27a84429`, focused [run 45143302218](https://github.com/FlareZ123/obfs/actions/runs/45143302218) failed on both Ubuntu and Windows. The six-case suite reported **five semantic failures and one passing plain-ForIn-identifier positive control**. The direct String-literal case produced native `[53,["secretField"],53]` versus emitted `[53,["_p92953797210d"],null]`.

This establishes that the underlying problem is broader than ForIn. Object destructuring from a primitive string can consult host-mutated `String.prototype` / `Object.prototype` accessors even when the source is a literal. Array destructuring from a string can consult the host-mutated string iterator. The StringKey provenance needed for ForIn is one source of a more general **boxed-primitive destructuring** risk. The candidate's current pattern analysis does not conservatively account for the direct string-literal source either.

**Revised analysis direction:** distinguish primitive-origin values from ordinary inert own-data object literals. At minimum, treat object/array destructuring from a primitive string as host-prototype-sensitive regardless of whether any factory is statically known in the module; propagate primitive-string provenance through ForIn keys, aliases, function returns and cross-file calls. A more general boxed-primitive rule may be needed for Number/Boolean/BigInt/Symbol prototypes and host-installed iterators. The plain ForIn identifier positive control remains necessary: a string key not destructured is not itself a callable and should not discard unrelated safe rewrite yield. This is still a test-only finding, not an implemented fix.


### Agent38 complementary direct PrimitiveString member-read sink

Agent38's test-only branch `agent38/for-in-string-iterator-host-control-20261123`, source `aaf3a62f04cc3133397ea3b2d55aa2dd23bce47e`, focused [run 45143534036](https://github.com/FlareZ123/obfs/actions/runs/45143534036), Node 22.23.4, is **7 failures + 1 positive-control pass on both Ubuntu and Windows**. Its eighth case uses a simple ForIn key and reads `const Loader=key.callback`; the host-installed `String.prototype.callback` getter supplies `Function`, which dynamically imports the transformed module. Native `[53,["secretField"],53]`; emitted `[53,["_p35e6d13a2d5d"],null]`.

This is a separate sink from destructuring: boxing a PrimitiveString receiver for an ordinary member read can invoke an inherited host-mutated accessor and return an opaque host function. The positive control keeps a simple key with no host-sensitive read/destructuring safe. The combined PrimitiveString model therefore needs to cover at least direct member reads, ObjectPattern consumption, and ArrayPattern/GetIterator consumption. Agent2's synthesis and Agent38's direct/return/field matrices are complementary to Agent11's literal/destructuring and cross-file return tests; treat them as one primitive-string provenance workstream, not separate patch families.


### Boxed Number primitive source-paired control

A separate test changes the host-owned preloader to define `Number.prototype.callback` as a getter returning `Function`, then performs `const {callback:Loader}=0` before the same hidden dynamic import.

- Candidate test-only branch [run 45144263720](https://github.com/FlareZ123/obfs/actions/runs/45144263720): red on both Ubuntu and Windows.
- Current-main control [run 45144429687](https://github.com/FlareZ123/obfs/actions/runs/45144429687): red on both OS.
- Frozen PR #332 control [run 45144436278](https://github.com/FlareZ123/obfs/actions/runs/45144436278): red on both OS.

The native result is `[53,["secretField"],53]`; the generated result renames the exported key and the hidden importer reads `undefined`. This demonstrates the same host-prototype source through Number boxing, not only String boxing. The candidate, current main and frozen PR #332 all fail this isolated control. At minimum, the analysis must account for String and Number primitive destructuring; analogous Boolean/BigInt/Symbol wrapper prototypes and host-installed iterators remain untested.



### Agent38 primitive prototype method-dispatch sink

Agent38's test-only branch `agent38/primitive-prototype-method-host-control-20261123`, source `8be0f9cb025966e5c53e2f8d2bfefc1432e61222`, test `test/cross-file-primitive-prototype-method-host-callback.test.js`, focused [run 45145024353](https://github.com/FlareZ123/obfs/actions/runs/45145024353), is **4 failures + 2 passes on both Ubuntu and Windows**.

The host preloader replaces `toString` on String, Number, Boolean, BigInt and Symbol prototypes with a function returning the native Function constructor. Four cases fail:
- String.prototype.toString on a string primitive;
- Number.prototype.toString on a number primitive;
- Boolean.prototype.toString on a boolean primitive;
- BigInt.prototype.toString on a BigInt primitive.

Each creates a hidden dynamic import and observes the transformed ESM owner under a renamed key. Symbol.prototype.toString is a passing control because the compiler conservatively refuses the rewrite; ordinary primitive arithmetic is another passing control retaining one safe rewrite.

This directly challenges the primitive-method precision exemption: a call that appears to be a pristine built-in conversion is not guaranteed to use the builtin if the host can mutate the prototype before execution. The analysis must account for host-controlled primitive method dispatch, not just direct member reads and object/array destructuring. A trusted/frozen-intrinsics contract could permit a narrower assumption; absent such a contract, primitive prototype method calls should be treated as host-controlled where their result can feed an opaque callback/importer. Preserve the arithmetic positive control rather than blanket-tainting every primitive operation.


### Source-level trust assumption behind primitive method precision

The current mainline `src/ast.js` explicitly documents that non-generic `String#toString/#valueOf` are excluded from `sourceCoercingStringReceiverMethods` because the native methods do not coerce a Function receiver to source text (around lines 244–248). The existing `test/primitive-method-source-precision.test.js` encodes the corresponding precision expectation.

That argument is valid only if the relevant intrinsics are trusted and unmodified. Agent38's host-preloader matrix replaces primitive prototype `toString` methods before module execution; the correctly targeted [run 45145589232](https://github.com/FlareZ123/obfs/actions/runs/45145589232) reproduces four failures (String, Number, Boolean, BigInt) and two controls. Once the host replaces the supposedly non-generic method, the call can return a Function and the hidden importer can observe renamed cross-file properties.

This is a threat-model decision, not merely a parser edge:
- Under the stated COO attacker, the client can mutate prototypes before execution.
- Under SNO, the attacker controls the Node runtime and memory.
- Under SCO, the client side still remains attacker-controlled even if the obfuscator server controls its own initialization.

Therefore none of the three stated threat models automatically grants a trusted-intrinsics assumption for client-side or attacker-controlled runtime execution. If a faster/less-conservative mode relies on pristine intrinsics, expose it as an explicit trusted-host contract (and document that it is outside the hostile-host threat model); otherwise default analysis should treat primitive prototype method dispatch as host-controlled. Freezing prototypes in attacker-controlled environments is not by itself a durable security boundary.



### Correctly targeted full boxed-primitive pattern matrix (current main and frozen PR)

The previously mis-targeted Agent38 runs `45144780684` and `45144833430` are excluded. I re-dispatched the exact matrix file `test/cross-file-boxed-primitive-host-pattern.test.js` with the correct `focused_test` input and source-paired it:

- Current-main control: Agent38 test-only branch `agent38/boxed-primitive-host-pattern-control-20261123`, source `5e7180e502f994074e54eeb1ea39dc9600a56bcf` (parent `467e14a2661002a2dc45c7b3633e7bc7be5d8625`), [run 45146233899](https://github.com/FlareZ123/obfs/actions/runs/45146233899).
- Frozen PR #332 control: Agent11 test-only branch `agent11/string-primitive-pr332-control-20261123`, exact PR source base `b8ea2e8e40c7ab6793c0f9b343bacd8ab98e7341`, test commit `acde28fa6cafc38a96d9ba264ccb3de868ef0611`, [run 45146283881](https://github.com/FlareZ123/obfs/actions/runs/45146283881).

Both correctly targeted runs are **8 failures / 1 positive-control pass on Ubuntu and Windows**. The eight failures cover object and array destructuring for Number, Boolean, BigInt and Symbol primitives when the host preloader mutates their prototype getters/iterators to supply Function. The positive control confirms ordinary primitive arithmetic retains one safe private-field rewrite. Logs explicitly show `OBFS_FOCUSED_TEST: test/cross-file-boxed-primitive-host-pattern.test.js` and all nine test results.

This is now source-paired evidence that the frozen PR #332 and current-main source both fail the complete Number/Boolean/BigInt/Symbol boxed-primitive pattern matrix. It replaces the earlier mis-targeted 45144780684/45144833430 runs, which executed the default safe-record suite and are not evidence for this matrix.

### 23 November 2026 23:50 UTC: boxed-primitive matrix revalidated against latest main

To check whether later mainline changes had closed the earlier primitive-pattern gap, I copied the exact nine-case test file from Agent38's prior test-only branch onto a fresh branch based on main commit `27572fc13ed8f04b3ec6f98d95f1a60b98454ec5` (branch `agent11/boxed-primitive-current-main-20261123`). The compiler blobs under test were current-main `src/ast.js=c227e6e604635a42663af745fd0cfb194b215a67` and `src/cross-properties.js=7298df722d65f545dcb7b55c81cb6b8e101ce6b7`; no compiler source was changed.

Focused two-platform [run 45292181431](https://github.com/FlareZ123/obfs/actions/runs/45292181431), exact test-branch head `b47934251e86c8e6166db584cb5a784f99338b92`, is **8 failures / 1 pass on Ubuntu and Windows**. The eight failures are all semantic differentials: Number, Boolean, BigInt and Symbol each fail under both object and array destructuring. Native output is `[53,["secretField"],53]`; emitted output contains a seed-renamed owner key and a null lookup. The independent ordinary-arithmetic control passes and retains one private-field rewrite. The focused job confirms the exact test path in `OBFS_FOCUSED_TEST`; this is a targeted donor regression, not a full-main acceptance run.

This fresh pin supersedes reliance on the earlier 45146233899 current-main test branch for present-main status. It confirms that the intervening `cross-properties.js` changes did not close the host-controlled boxed-primitive destructuring gap. It does not establish a complete BoxedPrimitive provenance model, and it does not change the source-observer integration NO-GO or RELEASE-BLOCKED decisions. No production code or PR was changed.

### 23 November 2026 23:55 UTC: PrimitiveString / ForIn matrix revalidated against latest main

The exact ten-case test `test/cross-file-for-in-string-iterator-host-control.test.js` was copied from Agent38's prior test-only commit onto the same fresh main-based donor branch `agent11/boxed-primitive-current-main-20261123`. The focused [two-platform run 45292800791](https://github.com/FlareZ123/obfs/actions/runs/45292800791), exact head `970a4f690c9c486f2b0b58812dfe39c870f7a606`, is **8 failures / 2 passes on Ubuntu and Windows**.

Eight semantic failures cover:
- ForIn declaration and assignment array-pattern bindings invoking the host-modified String iterator;
- StringKey provenance through alias assignment, local identity-function return, and object-field storage;
- an imported ESM identity-return edge;
- a direct member read invoking a host-installed String getter; and
- direct array destructuring from the primitive string literal.

The two positive controls pass: reading the own `length` property from a ForIn StringKey and using a plain ForIn identifier without destructuring. In each red case, native output is `[53,["secretField"],53]`; emitted output contains a seed-renamed property and null lookup. The exact focused path is recorded in `OBFS_FOCUSED_TEST`.

This current-main run and [boxed Number/Boolean/BigInt/Symbol run 45292181431](https://github.com/FlareZ123/obfs/actions/runs/45292181431) both use the same compiler-source pin from main `27572fc13ed8f04b3ec6f98d95f1a60b98454ec5`, with only test files added. Together they provide current-main evidence for primitive-string and other boxed-primitive host capability sources while preserving positive-yield controls. This remains a narrow Node ESM compatibility donor, not a complete source/effect analysis or full acceptance. No compiler source or PR changed; the NO-GO / RELEASE-BLOCKED decisions remain unchanged.

### 23 November 2026 23:56 UTC: primitive prototype method-dispatch matrix revalidated against latest main

The six-case `test/cross-file-primitive-prototype-method-host-callback.test.js` was copied onto the same current-main-based donor branch. Focused two-platform [run 45292983468](https://github.com/FlareZ123/obfs/actions/runs/45292983468), exact branch head `b9017ab54bdc7cad029bdf4757bb52595f969a96`, is **4 failures / 2 passes on Ubuntu and Windows**.

Host mutation of `String.prototype.toString`, `Number.prototype.toString`, `Boolean.prototype.toString`, and `BigInt.prototype.toString` causes the transformed cross-file owner key to be renamed; the hidden importer then reads null instead of 53. The `Symbol.prototype.toString` case and ordinary primitive-arithmetic rewrite control pass. The focused logs confirm the exact test path and six-test result.

This current-main run complements the two pattern matrices above: BoxedPrimitive exposure is not limited to destructuring/member reads; primitive prototype method dispatch can also be replaced by a host-provided callable. This does not establish that all primitive methods are source observers in all environments: the result is conditional on the hostile preloader, and a trusted-intrinsics contract would be a distinct assumption. Under the repository's stated hostile runtime models, pristine prototype dispatch cannot be presumed. No compiler source or PR changed; the integration NO-GO / RELEASE-BLOCKED decisions remain unchanged.

### 24 November 2026 00:00 UTC: boxed-primitive direct-member provenance matrix

To isolate the direct-member-read sink and test whether non-string primitive provenance survives the interprocedural shapes named in the objective, I added `test/cross-file-boxed-primitive-member-host-control.test.js` to the same main-based donor branch. It tests Number, Boolean, BigInt and Symbol primitives through five origins/flows: direct literal, assignment alias, local identity return, object-field storage, and imported ESM identity return. A host-only preload installs a getter for `callback` on each corresponding primitive prototype, returning `Function`; the resulting callback constructs a dynamic importer of the renamed ESM owner.

Focused two-platform [run 45293453450](https://github.com/FlareZ123/obfs/actions/runs/45293453450), exact branch head `596ab4221caef68f0025a1bf1bcf0a723e585cab`, is **20 failures / 1 pass on Ubuntu and Windows**. Every one of the 4 primitive kinds × 5 provenance flows produces native `[53,["secretField"],53]` but emitted output with a seed-renamed owner key and null lookup. The sole ordinary-arithmetic positive control passes and retains one private-field rewrite.

This establishes a stronger bounded donor result than the earlier direct-literal pattern matrix: the host-controlled getter source is not limited to one primitive type or one local syntax shape; it survives aliases, local function returns, shared object-field storage and a cross-file ESM identity-return edge. It remains a test of one property-getter capability under an explicit host preloader, not a complete soundness proof for all primitive operations. No compiler source or PR changed. The source-observer integration NO-GO / RELEASE-BLOCKED decisions remain unchanged.

### 24 November 2026 00:13 UTC: direct getter side-effect controls narrow the callable-flow gap

Two additional current-main focused tests isolate the host getter's own execution from use of its returned value:

- [Run 45295210042](https://github.com/FlareZ123/obfs/actions/runs/45295210042), `test/cross-file-primitive-prototype-getter-side-effect.test.js`: **5/5 green on Ubuntu and Windows**. For Number, Boolean, BigInt and Symbol, an unlisted prototype getter starts a dynamic import and logs `Object.keys(state)` during the getter itself, then returns non-callable `0`. The app merely discards the value with `void`; the transformed graph preserves the host observation and `crossFile.properties===0`. The ordinary arithmetic control retains one property rewrite.
- [Run 45294821796](https://github.com/FlareZ123/obfs/actions/runs/45294821796), `test/cross-file-primitive-prototype-getter-unused-binding.test.js`: **5/5 green on Ubuntu and Windows**. The same side-effecting getter is assigned to an unused local binding; transformed output remains equal and the owner-key rewrite is vetoed. The arithmetic positive control passes.

Together with the 20/21-red direct-member callable-provenance run [45293453450](https://github.com/FlareZ123/obfs/actions/runs/45293453450), this narrows the current-main failure: a primitive prototype getter is conservatively refused when its result is discarded or merely stored unused, but the same kind of getter value can escape through a binding and be invoked, after which the property pass renames the exported owner. The missing case is not merely "primitive member access"; it is preservation of the host-effect/callable provenance when the read result is subsequently used as a callable through aliases, returns, fields and ESM identity edges.

Methodological correction: an exploratory `String.length` positive-control assertion in runs 45293993691/45294227831 observed `crossFile.properties===0`; the failure was the test's yield expectation, not a native/emitted semantic mismatch. It was replaced by the known arithmetic control before runs 45295210042 and 45294821796. No claim is made that the current pass preserves String own-length property yield. This distinction should remain visible when designing a scoped fix.
