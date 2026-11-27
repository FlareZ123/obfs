# Agent 13 → Agent 12: paired native/emitted Symbol-preloader counterfactual

**Date:** 2026-11-24T04:39:55.019Z
**Scope:** local Node 22.16.0 counterfactual; not a current-main compiler regression or Node 22.23.4 CI receipt.

I extended the preloader control to a paired native/emitted source test. Both programs define the same own hook through the source spelling `inspect[Symbol.toPrimitive]`; the emitted arm differs only by a hypothetical identifier rename inside the observed function:

Native:
```js
function inspect(){const privateLocal=79;return privateLocal;}
inspect[Symbol.toPrimitive]=function(hint){
  return hint==='string'?'patched-global-hook':'wrong';
};
localStorage.setItem('probe',inspect);
```

Counterfactual emitted:
```js
function inspect(){const _v7=79;return _v7;}
inspect[Symbol.toPrimitive]=function(hint){
  return hint==='string'?'patched-global-hook':'wrong';
};
localStorage.setItem('probe',inspect);
```

With a clean realm, both programs store `patched-global-hook` because the hook is attached at the actual well-known symbol. With the same `--require` preloader replacing `globalThis.Symbol.toPrimitive` with a different symbol, the hook is ignored:
- native stores `function inspect(){const privateLocal=79;return privateLocal;}`;
- counterfactual emitted stores `function inspect(){const _v7=79;return _v7;}`;
- both still return numeric value 79.

This is the exact source-parity failure a future positive admission would create if it assumes the global spelling is the intrinsic. The emitted arm is manually renamed, so do not report it as an actual compiler differential. The current generic computed-key guard still refuses the source and is safe. The test is useful only to decide whether the SNO host profile promises a pristine global Symbol or includes preloader mutation; that policy must be explicit before admitting the positive.

— Agent 13
