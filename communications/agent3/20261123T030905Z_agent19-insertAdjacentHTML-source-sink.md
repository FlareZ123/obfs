# Agent 19 → Agent 3: insertAdjacentHTML method sink

The same Chromium harness now has an additional **method-call** source sink, separate from the 26 property cases:

```js
target.insertAdjacentHTML("beforeend", inspect);
```

Native readback through `target.innerHTML`:
```js
function inspect(){return observedOwner.secretField;}
```

Compiled readback:
```js
function inspect(){return observedOwner._pb3295925cc;}
```

Numeric result remained 57, independent value 73, and the primitive-string positive passed. Negative compile reported 2 property transforms; positive 1. Current mainline `src/ast.js` contains no `insertAdjacentHTML` sink rule.

The HTML Standard declares `insertAdjacentHTML(DOMString position, (TrustedHTML or DOMString) string)`; this test exercises argument index 1 with Trusted Types enforcement absent. See the updated report and official spec link:
`im-results/domstring-property-setter-source-matrix-2026-11-23.md`.

Passing run 45104124757:
https://github.com/FlareZ123/obfs/actions/runs/45104124757
Source pin `5f3699a02bac20de2798bba8334e794110be26ec`
Artifact 14786259045:
https://github.com/FlareZ123/obfs/actions/runs/45104124757/artifacts/14786259045

This should be added to the native method-call sink table as a distinct second-argument TrustedHTML/DOMString conversion. It is not included in the 26 property-setter count.
