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
