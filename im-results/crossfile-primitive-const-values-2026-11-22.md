# Cross-module private field names with earlier primitive `const` values

**Status:** bounded ESM property-proof improvement with source-pinned red and independent Linux, Windows and real Chromium green regressions. 22 November 2026. This is a compatibility/coverage finding; it does not demonstrate source confidentiality, dynamic extraction resistance, or tamper prevention.

## Exact proof boundary

The previous cross-file owner preflight required `isLiteralValue(property.value)`. It declined an otherwise simple **unescaped, closed-world** owner solely because the value was an identifier:

```js
const seedValue = 17;
export const state = { secretField: seedValue, otherField: 5 };
```

The new `src/cross-properties.js` proof admits an identifier as a field initializer only if all conditions hold:

- Exactly one binding for the identifier in its module's conservative binding inventory.
- A **module-top-level** `const` declarator directly initializes that identifier, including a named `export const`.
- The binding initializer satisfies the existing side-effect-free `isPrimitiveConstantExpression` grammar. Function, array/object, call, imported/ambient and effectful initializers remain outside this extension.
- The initializer declaration ends **strictly before** the exported owner declarator begins, or before the `export default` declaration. ESM top-level declarators execute sequentially and the proof does not read later TDZ values.
- Existing closed-world module import/call/owner-escape, reflection, source-observer, inherited-property, dynamic-property and lexical-binding gates all still independently pass.

This admission applies to direct named exported const objects and direct default exported object expressions. It also permits a simple earlier value in the **same** `const` declaration list, by comparing individual declarator positions. The value expression is left in place; only rigorously tracked private property spellings are replaced.

## Red source pin

[Test-only GitHub Actions 44972776369](https://github.com/FlareZ123/obfs/actions/runs/44972776369), source SHA `4a54f0aa529ee739266aa39f1b2a3002b74b60af`, reproduced four expected positive-case failures in the pre-extension compiler: local preceding `const`, same-declaration `const`, earlier primitive binary expression, and earlier default-owner `const`. The error was the missing `crossFile.properties=2` proof; this was an intentionally red feature-coverage regression, not a runtime-semantic failure.

## Targeted two-platform green source pin

[GitHub Actions 44973180059](https://github.com/FlareZ123/obfs/actions/runs/44973180059), source SHA `41c963503a47bab3b6372ff30aaa1803f8a80f22`, completed **success on Linux and Windows**. It checked:

- 12 ESM regression tests passed on both OSes, including 11 paired native/published Node execution differentials and one static later-initialization/TDZ rejection. Four positive cases genuinely renamed both tracked keys; negatives retained original property names for later initialization/TDZ, mutable binding, imported value, effectful initializer, host-derived value, duplicate lexical binding, own-key enumeration and dynamic host key.
- Strict core and specialized cross-file JSDoc checkers passed.
- Existing imported-identity and configured esbuild property-mangle browser controls remained green.
- The new real Chromium native/minified/compiled graph with CSP `default-src 'self'; script-src 'self'` completed 100,000 exact differential input checks on named, default and reflective-owner scenarios. Reflected keys retained the original names.

Browser hot-path benchmark at this pin, 9 paired samples of 500,000 calls per variant after warmup, yielded **median native 3.30 ms; ordinary esbuild minified 3.40 ms; private-field rewritten 3.40 ms**. Native-relative `1.03030x`, minified-relative `1.00000x`, both within the project 2.5x limit on this workload. Timing includes repeated browser function calls and excludes module import/initialization. This is empirical and does not certify a universal worst-case bound.

A separate complete [Linux/Windows validation 44972942735](https://github.com/FlareZ123/obfs/actions/runs/44972942735) at implementation-only SHA `4185f46e537aaaf8f10b70fc9df60a06e5d189ac` was in progress at the first report; its final outcome must be checked before declaring a full-suite pass.

## Reproduction and security limits

- `test/cross-file-primitive-const-value.test.js`: native Node ESM positive/negative graphs.
- `test/cross-file-primitive-const-browser.js`: true CSP Chromium ESM before/after semantics and repeated-call CPU ratios.
- `.github/workflows/manual-imported-identity-alias.yml`: cross-platform source-pinned gate.
- `src/cross-properties.js`: narrow source-order and primitive value proof.

The new emitted field names are ordinary JavaScript properties and remain visible to an instrumented client. Legitimate source visibility, native `Function.prototype.toString` observations, dynamic owners, and untracked external importers remain outside the positive proof. The result adds selectively safe field renaming under explicit closed-world assumptions; a known-family static attacker can still recover structure in other assessed backends. Neither this benchmark nor the removed source labels establish independent security against the stated hostile-runtime threat model.
