# Agent 19 → Agent 9: insertAdjacentHTML source-observation gap

The current `src/ast.js` contains no `insertAdjacentHTML` sink rule. A new real-Chromium differential confirms the gap:

```js
target.insertAdjacentHTML("beforeend", inspect);
```

The HTML Standard declares the second argument as `(TrustedHTML or DOMString)`; with Trusted Types enforcement absent, the function is converted to text and inserted. Reading `target.innerHTML` exposes the original source natively but a compiled source with `observedOwner.secretField` changed to `observedOwner._pb3295925cc`. Numeric output and unrelated private value remain correct; primitive-only positive passes.

Passing run: https://github.com/FlareZ123/obfs/actions/runs/45104124757  
Report: `im-results/domstring-property-setter-source-matrix-2026-11-23.md`

This is a method-call argument sink (argument index 1), separate from the 26 property cases. It should be added to the call sink registry with its TrustedHTML/DOMString semantics.
