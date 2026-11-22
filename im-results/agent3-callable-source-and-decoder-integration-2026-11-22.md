# Callable-source preservation and descriptor-decoder integration, 22 November 2026

**Status:** Reproducible compatibility evidence and an integration candidate. Security-strength promotion remains **RELEASE-BLOCKED**. Source pins are mandatory; individual passing tests do not establish the full 2.5× compute bound or resistance against an instrumented attacker.

## Why this matters

ECMAScript 2026 [§20.2.3.5](https://tc39.es/ecma262/2026/multipage/fundamental-objects.html#sec-function.prototype.tostring) defines `Function.prototype.toString()` to return the function's original `[[SourceText]]` when that source is available. An exported callable can therefore expose even an otherwise semantically-private property spelling, an unused parameter, a literal, or a nested callable's body. Renaming a property inside a callable that a consumer can stringify changes behavior. Native coercion APIs can observe the same source without an explicit `.toString()` call. TypeScript's [JSDoc reference](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html) supports checked JavaScript without runtime TypeScript artifacts.

This investigation composes separate provenance and native-coercion guards, then tests byte-exact source observations and independently proven private transformations. It does **not** introduce a confidentiality or client-integrity guarantee.

## Reproducible source pins

| Work | Exact source / CI | What is established |
| --- | --- | --- |
| Querystring.escape/unescape native coercion | Branch commit `792d06d17680fb9df27cc7cbbcedd258dc43752e`; [two-OS focused run 45062970969](https://github.com/FlareZ123/obfs/actions/runs/45062970969) | Native-vs-emitted callable-source parity and primitive/private-positive controls in COO, SCO and SNO |
| Node `util.toUSVString`, `MIMEType`, `MIMEParams` | Branch commit `9b075a2907fb9ddd2c64f96624e9f2208e4454fa`; [focused run 45063046305](https://github.com/FlareZ123/obfs/actions/runs/45063046305), [45063075428](https://github.com/FlareZ123/obfs/actions/runs/45063075428), [45063078809](https://github.com/FlareZ123/obfs/actions/runs/45063078809) | Four native-coercion suites pass focused Ubuntu/Windows and strict JSDoc |
| Object.create/defineProperties descriptor alias provenance | Integration chain `#217 → #239 → #289 → #290 → #293 → #295 → #297` at `25a87b78ba9e6988d3bedd400590f2c618b4b33b` | One composed `src/core.js` provenance scanner, with 19 original node/browser fixtures retained; red-only strict test JSDoc repaired at `592564db8c401f8622f0e3882c2049d853d8e94e` |
| Native and descriptor baseline | `c4e4028ea71f07003d66eb54b4835477848634d5`, [full run 45063545550](https://github.com/FlareZ123/obfs/actions/runs/45063545550) | Full Ubuntu/Windows Node 22 suite, strict JSDoc, performance samples and real Chromium descriptor-alias positive/negative differential **PASS** |
| Public CommonJS callable source | Test-only red `28ea993e6f4e2a5e5e7c29dbaa81358d57774f2c`, [run 45063727622](https://github.com/FlareZ123/obfs/actions/runs/45063727622); repaired `3c546953...`, [run 45063849016](https://github.com/FlareZ123/obfs/actions/runs/45063849016) | 11 of 16 cases failed native-vs-emitted source parity on each OS before repair; all 16 passed afterward with retained private scalar positive cases |
| Public ESM callable source | `8dd301fae2836a8d6e617cd77b9d09d7e0173361`, [focused run 45065890378](https://github.com/FlareZ123/obfs/actions/runs/45065890378) | 12/12 ESM cases plus strict JSDoc pass Ubuntu and Windows: exported functions/classes, public parameter spelling, source-spelled property/reflection, reexports, independent private key/literal yield, and selective advanced transform refusal |
| Combined canonical candidate | Draft [PR #299](https://github.com/FlareZ123/obfs/pull/299), commit `fe5786079f9c757af5b579b5bd1ef1dc4a57ced5`, [full run 45066047823](https://github.com/FlareZ123/obfs/actions/runs/45066047823) | Descriptor/native/source proof integrated on one current-main-derived tree. **Full run pending at report creation**. Do not use it as a passing claim until both OS gates and browser finish |

The detailed donor matrix and exact test paths appear in [`workplace/agent3-source-observer-decoder-intake-2026-11-22.md`](../workplace/agent3-source-observer-decoder-intake-2026-11-22.md). All donor PRs remain separately inspectable; their tests should not be counted as independent security gains.

## Proved compatibility boundaries

- `src/properties.js` restricts source-changing local key rewrites using a nonescaping direct-callable proof and source-exposed AST bodies. Any unproved reflective or external use declines.
- `src/identifiers.js` now excludes source-exposed declaration identifiers even when the identifier is unused inside its exported callable. This is necessary because a parameter declaration's original spelling is part of `[[SourceText]]`. An earlier candidate left this gap: the 11/12 ESM run at `3b5236cc49e3...` rewrote an unused exported parameter; commit `dc7d918e40be3b8ca56d05773d07a390e05e57a4` closed it.
- `src/strings.js` preserves exposed callable literals, and `src/core.js` selects advanced VM/control-flow candidates only when their source is not externally observable.
- `src/cross-properties.js` follows source-observed named ESM exports, re-exports and property spellings in exported callables. `src/symbol-properties.js` applies a similar local refusal.
- The full-file source coercion veto remains conservative. The diagnostic `test/agent3-source-proof-sft.test.js` on the experimental branch isolated cases where an unknown function-result conversion makes the whole module unproved. Positive private transformations are required in independent provable modules and separately bounded single-file cases rather than weakening source safety.

## Performance and security decision

The canonical baseline full run `45063545550` produced Ubuntu sampled hot-work ratios roughly **0.58–1.10×** and Windows sampled ratios roughly **0.99–1.23×** across 11 named workloads. The sample excludes arbitrary scripts and attacker instrumented workloads, and it is not a universal proof of a 2.5× ceiling. The full integration and every future merge need their own source-pinned samples.

COO clients can retain and instrument every distributed file; SCO clients can request and intercept responses; SNO assumes hostile control of filesystem, runtime and memory. The source-parity work primarily prevents semantic breakage. No inference about general static reconstruction cost, runtime extraction resistance, unauthorized modification resistance, or environmental enforcement follows from these compatibility tests. Strong protection remains **RELEASE-BLOCKED** until the repository has a credible independent adversarial assessment against equal-trust minified or otherwise comparable baselines.

## Open integration gate

1. Confirm both OS jobs, JSDoc and real Chromium at exact `fe578607...`, then freeze an updated PR #299 source pin.
2. Independently verify public-source parity and live browser ESM import behavior after any further source changes.
3. Rebase or reconcile new main commits without discarding donor evidence; rerun full validation on the merged SHA.
4. Test strict performance bounds on workloads where the protections actually execute, and retain an explicit negative security control.

**Author:** Agent 3. All observations above are source-pinned computational evidence or specification facts; no novel security result is claimed.
