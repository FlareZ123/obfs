# Exported ESM callables expose source spelling across property and identifier renaming

**Date:** 2026-11-22  
**Status:** Reproduced correctness defect on the Agent 6 CommonJS-source-protection branch; no fix proposed or merged here.

## Summary

A module need not contain an explicit `Function#toString` call for function source to be observable. Any importer that receives an exported function or callable object method can invoke `toString()` itself. The current property and identifier transformations can change the exported callable's source spelling while preserving ordinary return values.

This is a semantic mismatch under JavaScript's observable behavior, not merely a cosmetic source-map difference.

## Reproduction

The isolated branch is [agent8/esm-exported-callable-source-20261122](https://github.com/FlareZ123/obfs/tree/agent8/esm-exported-callable-source-20261122), based on Agent 6's `agent6/commonjs-public-callable-source-20261122` head.

### Property owner captured by an exported function

Input:

```js
const owner={secretField:3};
export function read(){return owner.secretField;}
```

With COO, closed-world ESM analysis, and property rewriting enabled, the emitted module contains:

```js
const owner={"_p3bc68f241c":3};
export function read(){return owner._p3bc68f241c;}
```

An external importer observes:

- Original `read.toString()`: `function read(){return owner.secretField;}`
- Emitted `read.toString()`: `function read(){return owner._p3bc68f241c;}`
- Both calls to `read()` return `3`.

### Method reachable through an exported object

Input:

```js
const owner={secretField:5};
export const api={read(){return owner.secretField;}};
```

The emitted method source changes from `owner.secretField` to `owner._pf85bb2bf76`, while the return value remains `5`.

### Identifier binding in an exported function

With property, string, and flow transformations disabled:

```js
export function read(secretParam){return secretParam;}
```

The identifier pass emits `function read(_v29980ee680ed){return _v29980ee680ed;}`. An external importer sees a different `read.toString()`, although `read(3)` still returns `3`.

## Reproduction evidence

- [Run 44978830979](https://github.com/FlareZ123/obfs/actions/runs/44978830979): both exported property-owner fixtures fail exact source equivalence on Linux and Windows; the unexported-function positive property-yield control passes.
- [Run 44978943192](https://github.com/FlareZ123/obfs/actions/runs/44978943192): the same two property fixtures fail and the exported-parameter identifier fixture also fails on Linux and Windows; the unexported property-yield control passes.
- [Run 44979154437](https://github.com/FlareZ123/obfs/actions/runs/44979154437): expanded paired fixture confirms all four source-preservation assertions fail on Linux and Windows, while the unexported property-yield control passes. The paired module has both `privateHelper(privateParam)` and `export function publicRead(publicParam)`: the compiler renames both parameters, but a per-callable fix should preserve `publicParam` while retaining the safe `privateParam` rename.

The test file is `test/esm-public-callable-source.test.js` on the isolated branch.

## Interpretation and required proof

The current branch's new source-protection path is limited to CommonJS. Its explicit in-module source-observer scan cannot see an external importer invoking `Function#toString` on an exported callable. The same omission affects identifier renaming independently of property renaming.

A conservative first policy is to treat exported functions, class methods, and callable values reachable through exported objects as source-exposed, and preserve source spellings inside them. A finer policy may use ESM export reachability and closure analysis, but must also cover nested functions whose source text is included in an observed outer function. Do not disable all ESM property/identifier yield indiscriminately: the non-exported local-function positive control demonstrates a safe case that should remain eligible.

This report records a reproducible intermediate finding only. It does not establish a fix, quantify corpus prevalence, or claim that all exported callables are currently affected in every compiler path.


## Agent 10 follow-up: property-proof source boundary (2026-11-23)

A current-main reproduction confirmed that the local property proof could rewrite a member spelling inside an exported CommonJS or ESM callable even when the owner object itself remained private. That changes the function's externally observable `Function.prototype.toString()` result. This is a separate source-observability channel from a source-observer call appearing inside the same AST.

A forward-port on `agent10/exported-callable-property-guard-20261123` adds a conservative private-callable proof to `src/properties.js`:

- a callable binding must be unique;
- its declaration must not itself be exported;
- every non-declaration reference must be a direct, non-optional call within the binding's lexical scope;
- a property read is eligible only when every enclosing function node is in that proven-private set.

This deliberately rejects exported functions, escaping function values, aliases, returned or passed callbacks, unknown function expressions, and methods. It still permits a private direct-call-only helper called by an exported wrapper, because the public wrapper's source contains only the helper call and not the rewritten property spelling. The analysis is property-proof-specific; it does not claim to solve source preservation for identifier, string, or every other transformation pass.

The regression suite also corrects several previously positive fixtures that expected property rewrites inside exported callable bodies. The positive cases now keep the public wrapper source-stable and put the actual field reads in a private helper. The hotpath benchmark measures only the `wrapped` positive workload; `direct`, `readers`, and `identity` remain negative controls because their exported bodies expose the field spelling.

Focused validation of `test/exported-callable-source-regression-suite.test.js` passed on Ubuntu and Windows, including strict project and external JSDoc, in [run 45105960554](https://github.com/FlareZ123/obfs/actions/runs/45105960554). The broader `manual-transform-safety` run [45106029232](https://github.com/FlareZ123/obfs/actions/runs/45106029232) is still pending at the time of this note. This is a validated focused prototype, not yet a merged or globally complete source-preservation implementation.
