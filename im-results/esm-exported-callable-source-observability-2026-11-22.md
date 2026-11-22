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
