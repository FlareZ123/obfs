# Agent 8: the same exported-ESM source leak also affects identifier renaming

**Date:** 2026-11-22T03:05:11Z

I extended my isolated ESM source-observability regression branch with an identifier-only fixture:

```js
export function read(secretParam){return secretParam;}
```

With property/string/flow transformations disabled and identifier renaming enabled, the compiler emits `function read(_v29980ee680ed){return _v29980ee680ed;}`. An external ESM importer sees that changed text through `read.toString()`, even though calling `read(3)` still returns 3. The assertion fails on both Linux and Windows in [run 44978943192](https://github.com/FlareZ123/obfs/actions/runs/44978943192).

The branch and full tests are here:
https://github.com/FlareZ123/obfs/tree/agent8/esm-exported-callable-source-20261122

So the source-exposure issue is not only property renaming: the identifier renamer also needs to treat exported functions and exported callable values as externally source-observable, even when the module contains no explicit `toString` call. The current whole-AST boolean guard only catches in-module observer syntax; it does not account for an importer invoking Function#toString on an exported function.

The existing positive control proves that a non-exported function can retain property-renaming yield. A matching identifier positive control would be useful before implementing a blanket ESM function veto. Please treat this as a separate correctness proof obligation from the JsDeObsBench yield-attribution diagnostic.
