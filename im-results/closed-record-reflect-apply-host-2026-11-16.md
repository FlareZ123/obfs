# Source-visible Reflect.apply host-call escape in closed ESM owner proof (16 November 2026)

**Status:** bounded compiler correctness regression and guarded repair. Not a confidentiality, malicious-host defense, or overall anti-reconstruction result.

## Reproduction and exact source pins

- **Red witness:** [manual frozen application challenge 43851650777](https://github.com/FlareZ123/obfs/actions/runs/43851650777) on source `302ec259e5bf86455d9f391165c2e5ddf4f430db`, Node 22 Ubuntu and Windows. The two independent host-call fixtures expected refusal (`crossFile.properties===0`) but the compiler admitted **one** cross-file rename each. The new unrelated positive fixture initially passed an array as the single `Math.max` argument; it expected 3 but obtained `NaN` serialized as `null`. That third fixture failure was a **test error**, corrected before repair validation.
- **Green repair and positive yield:** [manual frozen application challenge 43851968658](https://github.com/FlareZ123/obfs/actions/runs/43851968658), exact source `e7f2c3b9fd880912f5e809695724110e277f956c`. Both Ubuntu and Windows application jobs succeeded, as did the legacy Node 22.0 job. The cross-file regression step passed **35/35** checks on each tested OS, including the two host-escape cases and one corrected positive `Reflect.apply(Math.max,null,[2,3])`. The positive graph admitted **1** renamed exported owner field, with identical native/emitted execution. Existing independent frozen-app differential, attacker, whole-process, and Ubuntu Chromium steps in the same manual workflow passed.

The executable regression is [`test/closed-record-reflect-apply-host.test.js`](../test/closed-record-reflect-apply-host.test.js); the patch is in [`src/cross-properties.js`](../src/cross-properties.js), inside `safeClosedCallerRecordRead`. The existing manually dispatched [application workflow](../.github/workflows/manual-application-challenge.yml) now includes the fixture. No per-commit CI was introduced.

## Semantic counterexample

The source graph has three ordinary ESM files: `state.mjs` publicly exports `const state={secretField:41}`; `record.mjs` holds a private, immutable, own-literal schema and returns `schema[key]` through a verified one-argument exported function; `entry.mjs` imports both and calls that function only with its literal own key. These constraints previously justified renaming the owner's `secretField` to a seeded private spelling.

The entry then uses `Reflect.apply(globalThis.HOST_BRIDGE,null,[])` or `Reflect.apply(callback,null,[])` after assigning `callback=globalThis.HOST_BRIDGE`. An executable CJS preloader supplies `HOST_BRIDGE` before the ESM graph loads. When called, this host function dynamically imports `state.mjs` and returns `Object.keys(ns.state)`. The executable native result is `[41,"audit-v1",["secretField"]]`. The host is allowed to inspect a module that was also statically imported. Thus a rename from the declared graph can change the callback's observable result even when no AST call has the opaque host function as its `callee`.

This is a **source-visible use of an opaque host function**, whose implementation is external to the declared ESM file group. The preloader demonstrates a plausible environment, rather than a hostile attacker breaking the original compiler's established trust contract. The declared source itself contains the indirect host invocation. The initial failure proves the proof accepted the unsafe case; its assertion ran before a native/emitted comparison, so the red CI alone should not be presented as an executed output mismatch.

## Repair boundary

The source-level check now detects `Reflect.apply` and `Reflect.construct` when argument zero is a directly read host capability or a tracked host-call alias. It invalidates only the specialized safe closed-record exception. The existing broader computation and owner proofs still apply. An unrelated direct `Reflect.apply(Math.max,null,[2,3])` retains the positive protected-work yield.

This is a **local refusal repair**. It does not prove arbitrary host-capability confinement. Higher-order wrappers, user-defined callers, arbitrary getters, deep containers, mutable intrinsics, indirect function dispatch, and import-loader behavior remain incompletely modeled. The `Reflect.construct` path is covered by the same static rule but has not yet received a corresponding executed constructor fixture. Broader trusted-host contracts and interprocedural escape analysis are necessary before the closed-record optimization can be represented as generally sound.

## Security and performance interpretation

The repair prevents a known wrong-name change and adds only compile-time analysis, so it does not add client runtime instructions to the generated positive file. No benchmark here establishes a universal **2.5×** runtime ceiling. Existing public-only attacks against transformed COO/SNO code remain valid under their stated assumptions; a source-refusal change is not an increase in obfuscation resistance.

Reference: ECMA-262 (2026), Reflection, §28.1.1 and §28.1.2, defines `Reflect.apply` as calling its target and `Reflect.construct` as constructing its target. https://262.ecma-international.org/


## Follow-on: host callable as an argument to a Call/New expression (10:55–11:00 UTC)

The original patch above considered only two Reflect dispatch methods. An independent five-fixture matrix subsequently established a broader counterexample and a more general bounded repair.

- **Red:** [manual application challenge 43853104177](https://github.com/FlareZ123/obfs/actions/runs/43853104177), exact source `591034f82fb9a653d1a9c70a1515d22567c086ba`. Four new **actual Node ESM** host-callback cases each reported `crossFile.properties===1` despite requiring zero: `queueMicrotask(globalThis.HOST_BRIDGE)`; `Promise.resolve().then(globalThis.HOST_BRIDGE)`; the same `.then` via a local callback alias; and `new Promise(globalThis.HOST_EXECUTOR)`. A verified own-record reader and an exported ESM owner were otherwise unchanged. Each original host preloader caused a live dynamic import and read `Object.keys(ns.state)`. The source-owned `Promise.resolve().then(()=>3)` positive remained valid. Both OS jobs failed **only these four new proof assertions** in the first selected regression step.
- **Typecheck diagnostic:** [43853314441](https://github.com/FlareZ123/obfs/actions/runs/43853314441) on `7e599685f809119cbd626cf7dac455f580332378` stopped before semantic execution with `TS7006`: a new `.some` callback argument had implicit `any`. Repaired with an explicitly typed JSDoc helper function before validation. This intermediate failure is not a compiler semantic counterexample.
- **Green:** [manual application challenge 43853627485](https://github.com/FlareZ123/obfs/actions/runs/43853627485) on `9c215cd71194397a1f67df78a7ce01a665393b5a`. Ubuntu and Windows each passed **40/40** focused compiler/host regressions, including the original Reflect cases and five new cases. Both platform application challenge jobs and the legacy Node 22.0 lane succeeded, including independent attacker, startup/profile, native-versus-emitted application, strict JSDoc and real Chromium steps. The separate source-owned Promise positive retained **one** transformed exported owner property with exact original runtime output.

The new durable fixture is [`test/closed-record-host-callback-escape.test.js`](../test/closed-record-host-callback-escape.test.js). The proof rule in `src/cross-properties.js` replaces the earlier Reflect-specific guard with a generic, narrowly scoped **host-argument escape check**: whenever a syntactic `CallExpression` or `NewExpression` passes a directly read host-owned callable, or a tracked alias of one, the specialized closed-record computed-reader exemption declines. The ordinary source-owned `()=>3` callback and unrelated built-in Reflect call remain admitted. This is a stronger analysis rule than enumerating the four identified standard-library callback APIs, and introduces no emitted hot-path instructions.

**Limitations:** callers can still hide host capabilities through deeper data structures, closures, getters, more complex computed property/alias flow and arbitrary unknown external APIs. The approach has no verified general escape theorem. An external preloader is a trusted-host envelope question under COO/SNO semantics, so tests demonstrate a plausible correct-environment mismatch rather than an attacker-proof confidentiality guarantee. The frozen source-observer-free application and the changed own-key-only diagnostic remain different programs. No universal 2.5× budget or full-control extraction result follows from this bounded safety repair.


### Reconciliation with concurrent reflector proof improvements

During integration, main acquired a separate source-visible global reflector mutation guard and added its own application regressions; the first follow-on PR had a textual conflict in `src/cross-properties.js`. Rather than overwrite the other author's evidence, the argument-escape rule, one new test file, the manual workflow step and this report were reapplied over main source `f23328a1f74ed44595c1de4222ef09234f1d2d1a`, preserving existing reflector checks. The **rebased full application gate** [43854731390](https://github.com/FlareZ123/obfs/actions/runs/43854731390) passed all Linux/Windows/Node22.0 jobs at exact `c7a6d373fadeff74c1a076670511db4566531778`. This explicitly confirms the combination, rather than assuming an older green branch was compatible with moving main.
