# Direct top-level local owner primitive-value coverage and callable-source boundary

**Engineering evidence, 22 November 2026.** This source-pinned soundness and yield result applies to locally private object-literal owners with uniquely bound earlier top-level primitive `const` initializers. It does not establish JavaScript source secrecy, hostile-runtime resistance, strong tamper prevention, or a universal execution cost ceiling.

## Candidate and admissibility

Previously, `renameLocalProperties` accepted inert literal field values and selected direct function parameter values. It declined the ordinary source-order pattern:

```js
const seedValue = 17;
const privateOwner = { secretField: seedValue, otherField: 5 };
module.exports = [privateOwner.secretField, privateOwner.otherField];
```

The local extension records uniquely bound direct top-level `const` declarators whose initializer satisfies the existing `isPrimitiveConstantExpression` grammar. It admits a field value identifier only if the owner is itself a **direct program-level const object literal**, and its initializer declaration completed strictly before the owner declarator starts. A prior declarator in the same `const` statement qualifies. Nested-function owners, imported values, mutable bindings, arbitrary calls, function values, RegExp/object/BigInt const aliases, transitive aliases and later temporal-dead-zone bindings remain outside the extension.

The remaining owner-use proof must independently establish that all properties are fixed own members, external references are absent, dynamic keys and reflection are handled conservatively, and source-error operands are preserved. The transformed code retains the same primitive value initializer and renames only the proved local record keys and their tracked reads.

## Source-observable function boundary

An adversarial negative fixture exposed a second, independent concern:

```js
const seedValue = 17;
const privateOwner = { secretField: seedValue, otherField: 5 };
module.exports = function publicReader() { return privateOwner.secretField; };
```

The resulting function is visible through CommonJS `module.exports`, including its original `Function.prototype.toString()` body. A prior candidate would rewrite `secretField` inside the function body and thereby alter that public source result. [Pinned red 44974384682](https://github.com/FlareZ123/obfs/actions/runs/44974384682) demonstrated this unexpected admission on both Ubuntu and Windows.

The repaired **new earlier-primitive lane** therefore refuses an owner if any proven property edit occurs inside any nested function body. This deliberately declines even callables known in practice to be private and directly called; proving callable source non-escape requires more analysis. Existing literal/direct-parameter candidate lanes were left unchanged by this repair to avoid implicit alteration of their established acceptance contract; their broader exported-callable source boundary is a separate open soundness question sent to Agent 10 in `communications/agent10/2026-11-22T0210Z_agent6_exported-callable-source-red.md`.

## Pinned regressions and runtime evaluation

- [Initial test-only red 44973939290](https://github.com/FlareZ123/obfs/actions/runs/44973939290): both OSes rejected the new legitimate direct top-level primitive-value positive cases before implementation.
- [Initial post-extension semantics green 44973967179](https://github.com/FlareZ123/obfs/actions/runs/44973967179), implementation SHA `748786e6c34951935560225ec360f94dfdd4385c`: both operating systems passed the existing selected transform suite and new initial 44-case Node/VM differential.
- [Real Chromium CSP scope witness 44974245774](https://github.com/FlareZ123/obfs/actions/runs/44974245774), source `341808cbddc16d5e47e17dd58950ebed8b433642`: Ubuntu Chrome browser gate passed. Private top-level ESM module owns the record and yielded two renamed properties, while a classic browser script with externally visible global lexical bindings was conservatively refused. The native, ordinary esbuild-minified, and compiled module variants produced identical checksums over nine measured trials of two million loop iterations each after three warmups. The compiled-runtime median obeyed the bounded 2.5x native CPU gate for this sample; its exact median is in the source-pinned harness output. Reflected property names remained original.
- [Expanded callable and V8 source spelling semantic test 44974638747](https://github.com/FlareZ123/obfs/actions/runs/44974638747): source `14869fcc91e497de97700188e44953f9a54c9d7e`, currently being verified on both operating systems after the callable-source repair.
- [Complete Linux/Windows/Ubuntu Chromium validation](https://github.com/FlareZ123/obfs/actions/runs/44974755689): at source SHA `14869fcc91e497de97700188e44953f9a54c9d7e`: currently in progress. Do not claim an integration green until both jobs complete successfully.

## Reproduce

- `src/properties.js`: uniquely bound program-level primitive initializer inventory, source-order admission, function-source exclusion for the new lane.
- `test/local-top-primitive-const-value.test.js`: paired VM native/emitted behavior, positive and refusal fixtures, temporal-dead-zone and source-error cases.
- `test/local-top-primitive-browser.js`: real Chromium native/minifier/compiler ESM and classic-script scope check with CSP, checksum equality and CPU budget.
- `.github/workflows/manual-transform-safety.yml`: Linux/Windows gate, Ubuntu browser.
