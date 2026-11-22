# Direct unary BigInt owner-value admission (intermediate, 22 November 2026)

## Decision and scope

Admit **only a standalone unary expression applied directly to a BigInt literal** as a recursively inert private object-field value when the operator is `-`, `~`, `!`, `typeof`, or `void`. This enables existing local SNO and cross-file COO property renaming where all independent owner-use and source-observation guards already succeed. It does **not** broaden arbitrary BigInt arithmetic.

ECMAScript 2026 describes the BigInt unary-minus semantics and leaves unary plus unsupported on BigInt; see [ECMA-262 2026](https://tc39.es/ecma262/2026/multipage/ecmascript-language-expressions.html) and [MDN BigInt](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt). Unary `+1n` throws a TypeError. Mixed BigInt/Number arithmetic, division by `0n`, negative BigInt exponents, and `>>>` may also throw. Renaming earlier keys can shift observable error stack source offsets, so the primitive proof must refuse these expressions.

**Key invariant:** the direct BigInt unary admission is enabled only at the expression root. Every recursive operand check of a surrounding unary, binary, logical, conditional, sequence, or template expression receives `directBigInt=false`. This deliberately declines harmless compositions as well until separately proven. Recursive nested array/object *values* can still contain independent standalone safe unary BigInt leaves.

## Reproducible test sequence

- **Expected red, unmodified compiler:** [focused Ubuntu/Windows run 45044984055](https://github.com/FlareZ123/obfs/actions/runs/45044984055), test-only source `782dcc904b585108de91bed38f47f025cb24cb84`. The positive key-renaming assertions failed in both operating systems: 0 actual owner rewrites versus 1 local/2 ESM expected. Negative throwing expressions remained refused.
- **Provisional first green, superseded:** [run 45045062364](https://github.com/FlareZ123/obfs/actions/runs/45045062364), `ef095d49bf922739ee638112679ed9efb7c703ec`. Post-run semantic review found that the newly accepted direct unary BigInt leaf was inadvertently allowed to flow into the pre-existing recursive binary grammar; e.g., `(-1n)/(-0n)` would become accepted despite throwing. **Do not reuse this unsafe patch.**
- **Implementation error caught by tests:** [run 45045272578](https://github.com/FlareZ123/obfs/actions/runs/45045272578), `6bdef5e6da65f9e7b8937da2eb636e332f28c55d`, failed both platforms because a multiline `return` was followed by a newline and JavaScript automatic semicolon insertion. The next commit restored same-line return expressions; do not cite the failed source as a semantic pass.
- **Corrected narrow positive/negative focused gate:** [run 45045388537](https://github.com/FlareZ123/obfs/actions/runs/45045388537), source `f1dc646623239fb00560f7b276a57099d409e632`, Ubuntu and Windows **green**. `test/bigint-unary-owner-property.test.js` contains 20 cases: 10 valid local and two-file ESM direct unary variants, one recursively inert local array case, and 9 throwing refusal cases (including nested `+(-1n)`, `(-1n)+2`, `(-1n)/(-0n)`, `(-2n)**(-1n)`, and `(-1n)>>>0n`). Both strict project and external JSDoc gates were green.
- **Real browser and equal-source minified comparator:** [run 45045558575](https://github.com/FlareZ123/obfs/actions/runs/45045558575), source `8c86bbb177dcf97159862c165b60c9a0d072a7fa`, Ubuntu (Chromium) and Windows (JSDoc and ESM tests) **green** through the existing `manual-imported-identity-alias.yml` workflow. Real Chromium under same-origin CSP evaluated 100,000 deterministic native/esbuild-minified/obfuscated heldout calls and an independently reflective owner refusal. Nine one-million-call repeated hot samples measured median native **12.5 ms**, esbuild-minified **13.0 ms**, emitted **12.7 ms**; ratios **1.016x native**, **0.977x minified**. This is one sampled browser profile, not universal proof of the 2.5x limit.

Production patch: `src/properties.js`, `isPrimitiveConstantExpression` with optional `directBigInt` recursion guard, reused from `src/cross-properties.js`. Test code: `test/bigint-unary-owner-property.test.js` and `test/bigint-unary-owner-browser.js`.

## Boundaries and next decisions

The positive examples are **constructed** to exercise eligible AST grammar. No natural-source-corpus frequency, general throughput improvement, static-deobfuscation resistance, or SNO hostile-runtime tamper resistance has been established. Source-only public code may still be normalized by an attacker; merely changing private key spellings does not imply cryptographic secrecy.

A full two-platform integration pass on the frozen branch is needed before mainline merge. If it remains green, the proposal can be integrated as a bounded compatibility and yield extension. The repository-wide primary objective remains **RELEASE-BLOCKED**.

## Same-day full-integration finding and new reanchor

The original draft's full Ubuntu/Windows run [45045720253](https://github.com/FlareZ123/obfs/actions/runs/45045720253) failed four computed-key tests after the compiler adopted later-local-constant proof while the draft still carried old refusal assertions. The 22 November main branch already contains updated expectations for the exact four cases, including direct computed destructuring, later same-producer default owner keys, and later local export aliases. This is a **source mismatch**, not proof that the BigInt patch passed full integration. Reanchor the unchanged scoped unary-BigInt function change onto current main, preserve main's newer tests, and require a new exact-source full two-platform and Chromium pass before merge.
