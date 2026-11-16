# ECMA-402 native function-source observation (2026-11-16)

**Status:** intermediate compatibility evidence. This is a bounded compiler preflight correction. It does not establish cryptographic security, attacker-resistant execution, arbitrary JavaScript semantic preservation, or the 2.5× runtime budget.

## Counterexample

In Node 22.16.0, passing a native function into selected `Intl` APIs can reveal its exact `Function#toString` spelling without any explicit `.toString()` in the calling source. In a two-version native script with `inspect(){return state.secretField;}` versus `inspect(){return state._pabc;}`:

- `new Intl.Collator('en').compare(inspect,'function inspect(){return state.secretField;}')` returned **0** for the original and **-1** for the changed body.
- `new Intl.Segmenter('en').segment(inspect)` returned text containing the original property spelling; changing the spelling changed the result.
- `new Intl.ListFormat('en').format([inspect])`, `Intl.supportedValuesOf(inspect)`, `new Intl.RelativeTimeFormat('en').format(2,inspect)`, `new Intl.DateTimeFormat('en',{timeZone:inspect})` and `new Intl.NumberFormat('en',{style:'unit',unit:inspect})` emitted error messages containing that spelling. `Intl.PluralRules` and other option records can similarly expose their function-valued options through implementation-specific error diagnostics.

The [June 2026 ECMA-402 specification](https://402.ecma-international.org/13.0/) prescribes ToString in several relevant calls. **Error message text is implementation-dependent**, so the differential evidence is scoped to matching Node/V8 runners, including the exact source bytes and option choices used.

## Implementation and reproducibility

`src/ast.js::observesFunctionSource` now follows direct, aliased and destructured `Intl` namespace/constructor cases plus a bounded selection of method and static API calls. Unknown input primitive-ness triggers a conservative source-observer refusal. Literal-primitive Intl uses remain eligible. This is a syntactic analysis with known indirect/reflection gaps, rather than a full proof of JS semantics.

A function defined in one ESM module may be introspected by Intl in another: `src/core.js` already refuses all source rewrites across a supplied module group when it recognizes any source observer. The new AST recognition activates that existing whole-group refusal.

Executable regressions:
- `test/intl-source-observation.test.js`: direct Intl function-source diagnostics, aliases, constructor options, AST positive/negative controls.
- `test/intl-cross-file-source.test.js`: three original-vs-obfuscated native Node ESM executions for imported function observers, plus one safe positive control. The observed cases preserve original source; the ordinary imported call still allows one local field rename.
- `.github/workflows/manual-transform-safety.yml`: explicit manual-only Node 22 Ubuntu+Windows gate, preserving full prior semantics and strict JSDoc stages.

**Passing immutable source pins:** [43816332203](https://github.com/FlareZ123/obfs/actions/runs/43816332203) at `7f7b4374f25f923a6039116e3aa08371f908e49c` for initial cases; [43816986020](https://github.com/FlareZ123/obfs/actions/runs/43816986020) at `f2febb831c236284f1915d354cbb6f36ca40d7f5` including the cross-module test; and [43817385070](https://github.com/FlareZ123/obfs/actions/runs/43817385070) at `61ad6c3124623c32313bd68b1b3a4478ef7f2aee` including additional Intl constructor and unit options. All three passed Ubuntu and Windows with the original semantic test stages and JSDoc checks. **These pins precede the later PluralRules and alias extensions** and must not be taken as their validation.

## Security and cost interpretation

The repaired guard trades obfuscation coverage for guaranteed source compatibility on a bounded set of native APIs. The observed source-introspection cases transform **zero** owner objects, identifiers and literals; the nonobserving literal-primitive control still renames **one** owned key. The guard emits no extra runtime instructions when declining, but compiler preflight cost, full application life cycle performance and remaining API observer gaps have not been exhaustively measured. It cannot prevent authorized SCO relaying, full-control COO/SNO reconstruction, runtime instrumentation, or malicious host execution. The finding belongs in `im-results/` as engineering evidence.

Further work: pin and validate the latest extensions, test `Reflect.apply`/`.call`/`.apply` and bound Intl method aliases with independent differential scripts, measure conservative false-positive coverage across real modules, and retain a realistic attacker-cost comparison separate from semantic compatibility.


## Pinned before/after compiler differential (new evidence, 06:40 UTC)

A branch at the **unmodified pre-fix compiler** plus the initial Intl test file was tested through the existing manual-only semantics workflow: [negative-control run 43818248489](https://github.com/FlareZ123/obfs/actions/runs/43818248489) at exact SHA `fa275de18c01ad32dd2dbc3f1eec3ec8a8e7c80a`. Ubuntu and Windows both failed the intended Intl step: **eight test failures and one positive-control pass out of nine**, including exact emitted native-function-source mismatches. The underlying compiler changed `secretField` to a hashed key and also changed local identifier spelling; although `inspect()` still returned 71, externally observed `Intl.Segmenter` or `Intl.ListFormat` text differed. The isolated positive primitive test remained a pass.

The **patched fixed-head** [run 43818198594](https://github.com/FlareZ123/obfs/actions/runs/43818198594) at `22f922c6a482a7e1383e779074a3b5266fd5a0ff` passed on Ubuntu and Windows with the **expanded** direct + cross-file Intl suite and all existing semantic/JSDoc stages. This pin includes the PluralRules and aliased static Intl updates. The red/green contrast demonstrates a concrete behavior preservation repair for the tested fixtures, beyond the syntactic AST assertions. The pre-fix experiment is intentionally preserved as a failing regression control; it is not a present release failure. Neither check proves arbitrary Intl or non-Intl source observers are fully modeled.


## Follow-on indirect callback, SCO serving and native locale method evidence (06:59 UTC)

The compiler's source observer also recognizes extracted `Intl.Collator.compare` invoked via `.call`, `.apply`, `.bind` and `Reflect.apply`; its escaped comparator can be invoked by `Array.prototype.sort` without direct source-string conversion in the user's AST. Tests exercise callback and primitive precision cases. [Pinned joint semantics workflow 43819563074](https://github.com/FlareZ123/obfs/actions/runs/43819563074) at `c5d0412e871f8341bd952cae4402588e180fbf5c` **passed Ubuntu and Windows** with the expanded Intl direct/callback/ESM suite and all pre-existing semantic/typecheck stages. In an intervening run `43818731662` at `d1c331f`, six existing unrelated cross-file property-coverage assertions failed because of a concurrently evolving dynamic-loader proof in `src/cross-properties.js`. Agent 43 repaired its global-key resolution in `b92bc8708815`. The later green joint pin includes that repair; see the direct Agent 43 mailbox message for exact affected test names.

**SCO**, whose server mutates client files per request, now has four native ESM served-file observations in `test/sco-interfile-source-observation.test.js`: Collator comparison, Segmenter source text, ListFormat errors and supportedValuesOf errors. Both observed execution and the original defining-module source bytes are checked. [Pinned 43819841156](https://github.com/FlareZ123/obfs/actions/runs/43819841156) at `9fe6b19dcbb1fd4979a6fffaba66c769e1e61d4f` **passed Ubuntu and Windows**, alongside the original semantics gate.

**Additional standard-library API surface:** V8 also exposes native function source through `Number.prototype.toLocaleString`, `BigInt.prototype.toLocaleString`, `Date.prototype.toLocaleString/toLocaleDateString/toLocaleTimeString`, `String.prototype.localeCompare` when given a function-valued Intl option, and `Array.prototype.toLocaleString` when containing a function element. The recognizer now guards their relevant locale/option inputs and array function members. A separate `test/native-locale-method-source.test.js` contains ten negative scenarios, a literal-primitive positive coverage control and AST assertions. A true **pre-fix negative control** [43820387181](https://github.com/FlareZ123/obfs/actions/runs/43820387181) at `58b36a2d8519093f427315a0cf76b904d5622a74` failed **11 out of 55 tests on each OS** while retaining the safe primitive case. The **patched** [43820217859](https://github.com/FlareZ123/obfs/actions/runs/43820217859) at `cb2036cb4acd1b7be809adb6feeb6be4a853329c` **passed both OSes**, including the full previous semantic gate.

These are measured semantic fixes and deliberate coverage refusals; none amounts to an anti-deobfuscation resistance improvement. The source observer still does not prove general indirect invocation across unknown wrappers/proxies or full environment equivalence.
