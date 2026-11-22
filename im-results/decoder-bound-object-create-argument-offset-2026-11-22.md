# Bound Object.create prototype argument offset: cross-mode decoder parity

Date: 2026-11-22

## Question

Does the decoder-integrity guard preserve native/emitted parity when the native `Object.create` function is bound with its first parameter (the prototype) already supplied, but the descriptor map arrives later at invocation time?

## Red evidence

The existing first-class invocation matrix covered an unbound callable, a callable bound only for `this`, and a descriptor map fully pre-bound. It did not cover the shifted-argument case:

```js
const create = Object.create;
const maker = create.bind(null, null); // bind the prototype parameter
const box = maker({ ref: { get() { return String.prototype; } } });
box.ref.charCodeAt = () => 0;
```

Native `Object.create` receives the descriptor map at its argument 0 after the prototype has been pre-bound. The previous `objectCreateDescriptorArgument` implementation treated any callable alias as if no leading arguments had been bound and looked at argument 1. It therefore missed the getter map and eagerly encoded a later long-string module. The mutator changed `String.prototype.charCodeAt` before that module initialized, causing real decoded output corruption.

The new test-only source `df8e54e05a212bee889a70003decc0b77c64b410` failed on both Node 22 platforms in full manual [run 44971667636](https://github.com/FlareZ123/obfs/actions/runs/44971667636): 4,372 of 4,378 tests passed, with two failures for the unsafe COO and SNO forms of this exact case (four existing skips). Windows and Ubuntu both showed corrupted emitted output versus the native 2,049-character `A…AK` string. Matched Number-positive controls passed.

## Repair

`src/core.js` now derives the number of statically bound leading arguments through local aliases, nested `.bind` calls, and holder fields. The descriptor parameter index is shifted by that count for direct calls, `.call`, `.apply`, and `Reflect.apply`. Bound descriptor maps already supplied at bind time continue to be caught by the existing bind-site check. Holder-field counts are propagated when a holder is copied to another local alias.

The regression matrix now covers:
- direct invocation of a callable with the prototype pre-bound;
- `.call`, `.apply`, and `Reflect.apply` through that bound callable;
- nested `.bind`;
- a bound callable stored in a holder field and a copied holder;
- matched Number.prototype controls to ensure the guard does not suppress safe positive string encoding.

A full two-platform validation at source `00f82ee4b22b42f09f08aba969b664805abafeac`, [run 44972128366](https://github.com/FlareZ123/obfs/actions/runs/44972128366), passed all Node behavioral/adversarial tests, both strict JSDoc checks, performance/profile checks and the whole-process budget check on Ubuntu and Windows; Ubuntu passed the configured real Chromium checks.

The final browser-extended source `c2bebcd8bc3e022fee494ba57277aab2bb9b8bfe` passed [run 44972512134](https://github.com/FlareZ123/obfs/actions/runs/44972512134): both Ubuntu and Windows Node 22 jobs passed all behavioral/adversarial tests, strict project and external JSDoc, performance/profile and formal-value budget steps; Ubuntu additionally passed all configured Chromium integrations, including the new unsafe pre-bound-prototype getter case and harmless Number control.

## Scope and limitations

This is a bounded source-visible compatibility guard. It does not prove arbitrary dynamic `bind` behavior, arbitrary reflection, complete interprocedural effect analysis, source secrecy, hostile-runtime tamper resistance, or a universal 2.5× runtime ceiling. The overall security release remains RELEASE-BLOCKED. PR #239 remains a draft stacked on #217 and still requires parent-branch integration/revalidation against current main.
