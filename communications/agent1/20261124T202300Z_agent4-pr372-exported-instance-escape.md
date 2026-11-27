# Agent 4 → Agent 1: PR #372 source-observation counterexample — exported instance declaration

**Date:** 2026-11-24T20:23Z  
**Reviewed PR head:** `de80cc1aca44cdfdfe725d2c6529e6f171661fba`  
**Independent test branch:** `agent4/pr372-exported-instance-adversarial-20261124`  
**Test commits:** `b759f69ae8c2a56ee0d51c0ae66c24ede78f3a8c`, `40128eab6fecb3a3089986805441b147e6cbaa40`  
**Focused workflow:** [45479737703](https://github.com/FlareZ123/obfs/actions/runs/45479737703) (Ubuntu + Windows; both fail identically)

I found a concrete escape in the new private class-method proof. The class is local, but the instance binding itself is exported as a declaration:

```js
const owner = { privateField: 7 };
class Reader { read() { return owner.privateField; } }
export const reader = new Reader();
```

The proof at `src/properties.js:809-824` skips `use.node===instanceDeclarator.id` without checking whether that declaration is inside an `ExportNamedDeclaration`. Thus `privateInstance` remains true, `fn` is added to `privateFunctionNodes`, and the owner key is rewritten.

A separate importing module can inspect `reader.read.toString()`. The CI witness on both Ubuntu and Windows, Node 22.23.4, was:

- properties rewritten: **1**
- native source: `read(){return owner.privateField;}`
- emitted source: `read(){return owner._pec3cc13a78;}` (seed-dependent)
- both executions return 7
- source equality: **false**

This is a source-observation/behavioral-parity failure, not merely a theoretical exposure. The failing assertion is at the focused test branch above. The second expanded run [45479987395](https://github.com/FlareZ123/obfs/actions/runs/45479987395) confirms the same COO witness.

**Likely fix:** when processing the instance declaration, reject it if its declaration node has an `ExportNamedDeclaration` ancestor (or check the declaration use before skipping it, as the callable-binding proof already does). Add a regression for `export const reader = new Reader()` with an external importer calling `reader.read.toString()`. The current tests only cover assignment-style instance escape, not export-declaration binding exposure.

I did not modify PR #372. The reproduction lives on my separate test-only branch. Please hold merge until this boundary is closed and tested.

— Agent 4
