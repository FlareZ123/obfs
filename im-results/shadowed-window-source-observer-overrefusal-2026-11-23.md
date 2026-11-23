# Shadowed `window` parameter triggers a false source-coordinate veto

**Status:** intermediate empirical regression witness; not an established security result.  
**Date:** 2026-11-23  
**Branch:** `agent1/window-global-binding-audit-20261123`  
**Test source:** `test/window-global-binding-source-observer.test.js`  
**Test commit:** `1c4953e2c1f8f5fb01b23dad0c9b3b07339b2dc2`  
**Focused two-platform run:** [45185160332](https://github.com/FlareZ123/obfs/actions/runs/45185160332)

## Question

Does the current source-coordinate observer distinguish the browser-global `window` from a local parameter with the same spelling?

## Minimal witness

```js
function localWindow(window, handler) {
  window.onerror = handler;
  return 7;
}
const owner = { privateKey: 11 };
function independent() {
  const privateLocal = 29;
  return owner.privateKey + privateLocal;
}
module.exports = { value: localWindow({}) + independent() };
```

The `window` reference in `localWindow` resolves to a function parameter. It is not the browser Window, and assigning its `onerror` property cannot register a browser error callback. The independent object and local binding are unrelated to that assignment and are otherwise eligible for private rewriting.

The paired positive control is the actual unshadowed global assignment:

```js
window.onerror = function handler() {};
```

## Results

Focused run **45185160332** checked the same commit on Ubuntu and Windows with Node 22.23.4.

Both platforms produced the same result:

```json
{
  "sourceObserved": true,
  "metrics": {
    "literals": 0,
    "objects": 0,
    "properties": 0,
    "bindings": 0
  },
  "retainedPrivateKey": true,
  "retainedPrivateLocal": true
}
```

The unshadowed-global positive control passed on both platforms. The expected-red local-shadow assertion failed on both platforms because `observesFunctionSource` returned `true` where the test requires `false`.

The failure occurred in the focused test step. Dependencies installed successfully; strict JSDoc steps were skipped after the test failure. This was not a full-suite or comprehensive acceptance run.

## Code-path explanation

At current main's source pin:

- `src/ast.js` blob: `c227e6e604635a42663af745fd0cfb194b215a67`
- `src/core.js` blob: `8d33996821650de540b87502baff00a9e7ea99c7`
- `src/identifiers.js` blob: `c7e2ed1469381c5bc6dc42cef9a6ca8bfa347f0f`
- `src/properties.js` blob: `bda3c6097e2679f59bd003fa0aed3e0291d4ba4c`

The path is:

1. `src/ast.js:673-677` defines `globals` as the spellings `globalThis`, `window`, `self`, and `global`; `isGlobal(node)` checks only whether an Identifier's name is in that Set.
2. `src/ast.js:2571-2575` defines global error-handler member names, including `onerror`.
3. `src/ast.js:2673-2679` marks an assignment to `window.onerror` as observed whenever `isGlobal(node.left.object)` is true. It does not resolve the `window` reference to its parameter binding.
4. The resulting whole-AST Boolean makes `src/identifiers.js:44` return the source with zero bindings and causes `src/properties.js:378` to refuse the local-object proof. The unrelated property and local binding therefore remain unchanged.

This is a concrete positive-yield loss caused by lexical shadowing, not a behavior mismatch or evidence of an unsafe rewrite.

## Required correction

The source-observer frontend needs per-reference lexical binding identity for ambient host roots. A whole-AST name-count guard is not sufficient: it would suppress recognition of a genuine global `window` reference elsewhere whenever an unrelated local binding named `window` exists. Add paired controls for:

- local/parameter `window` only: no browser sink and nonzero unrelated rewrite yield;
- global `window` plus an unrelated local shadow: global sink still detected;
- the analogous `globalThis`, `self`, `localStorage`, `sessionStorage`, and `Storage` cases;
- `eval` / `with` or other unresolved dynamic scope: conservative Unknown.

This report is intended for Agent 3's canonical source-observer intake. No production source was changed, no competing compiler branch was created, and no result is promoted to `results/`.
