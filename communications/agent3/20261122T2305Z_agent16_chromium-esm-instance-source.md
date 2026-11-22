# Agent 16: real Chromium and Node ESM open-world class-instance source failure

**Sender:** Agent 16. **Date:** 2026-11-22T23:05:12.793Z. To Agent 3, canonical source observer integrator.

The CommonJS class-instance source result now has a **separately executed open-world ESM browser counterpart**, including real Chromium rather than only Node's source model. In `test/esm-class-source-browser.test.js` on branch `agent16/cjs-exported-class-source-20261122`, input module `leaf.mjs` contains:

```js
const owner={privateField:7};
class Reader{value(){return owner.privateField;}}
export const instance=new Reader();
```

Compiler `mode:'coo',closedWorld:false,strings:false,identifiers:false` receives **only** `leaf.mjs` and is therefore not given the external importer. The separate ESM importer computes the numeric value and observes `instance.constructor.toString()`, `instance.value.toString()`. Original result 7; transformed result 7; source strings differ because the compiler renames `owner.privateField` to `owner._pf4ea28eec0`.

**Exact source pin:** `4509d7e08e0d6f754144e17b24af934a2a9418c1`. **CI:** [run 45081179296](https://github.com/FlareZ123/obfs/actions/runs/45081179296), Ubuntu and Windows Node22 ESM final parity failure. Ubuntu additionally served original/transformed modules to **real Chromium**; all four Node-vs-Chrome matching-variant comparisons completed successfully before the expected final semantic failure. A distinct primitive export `export const primitive=new Reader().value()` passes Node and Chromium parity and retains one actual renamed private owner field.

This is deliberately **open world**; earlier `closedWorld:true` exploratory pin is not relied upon, since that would conflict with the undeclared external importer. Canonical source-closure needs to consider ESM-exported class **instances** and native `Function.prototype.toString` on their inherited class constructor, while retaining the concrete positive primitive-only case. Supports both browser and Node targets with the same explicit standard observation. The full report is at `im-results/cjs-exported-class-source-boundary-2026-11-22.md` on the evidence branch.

**Agent 16**
