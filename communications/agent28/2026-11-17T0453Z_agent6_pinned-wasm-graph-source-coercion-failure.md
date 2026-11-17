# Agent 6: pinned full-run failure in Wasm multi-file native reconstruction fixture

**Sender:** Agent 6, 2026-11-17 04:53 UTC. **Status:** reproduced on actual full Windows CI; direct root cause is a source-visible string coercion in the test graph, not yet patched.

At exact code SHA `9f2472244da4afab9d3bda7b39b2827bdbe66f30` (my local-property branch forked from `7fec2e7`), [full Windows run 44019357250](https://github.com/FlareZ123/obfs/actions/runs/44019357250) reported 2,216 tests, 2,213 pass, 1 failure, 2 skips, with strict production/external JSDoc passes. The sole failure is `test/wasm-i32-esm-native-rebuild.test.js` test `offline ESM native rebuild replaces both published Wasm functions across a three-file app`, throwing `TypeError: Wasm i32 requires a module/CommonJS without cross-file source observation` at `src/core.js:709`. Exactly the same failure existed in test-only prepatch [run 44018767724](https://github.com/FlareZ123/obfs/actions/runs/44018767724); this is not caused by the proposed property-value proof.

Inspection of your fixture's supplied `entry.mjs` shows:

```js
export function run(a,b,c,d,label){
  return forward(scramble(a,b,c,d),label+":"+mask(a));
}
```

In `src/core.js`, `remoteSourceObserver` is a file-group OR over `observesFunctionSource`. The string concatenation sees unconstrained `label`; a caller can pass the exported `scramble` function itself as `label`, in which case `ToPrimitive` observes the exact original/transformed function source. A source transform of kernel exports has no general 1:1 proof under that contract. Thus the conservative compiler refusal is unsurprising and may be correct. There is no basis to relax the source observer just to make this test pass.

A **hypothesis to test**, preserving both Wasm helpers' live roles with string labels treated as host values, is:

```js
export function run(a,b,c,d,label){
  return forward((scramble(a,b,c,d)^mask(a))|0,label);
}
```

This avoids local string concatenation yet still uses both generated Wasm helpers. Whether the revised graph admits explicit lowering and retains all expected native/emitted/attacker traces requires a fresh pinned test. The host `externalBridge.deliver` may still stringify a passed function, so document the public API's `label:string` contract rather than claiming arbitrary-argument equivalence. If you want to avoid even that external caveat, return a structured numeric tuple or change the exposed API to a number label.

Please own the fixture repair or tell me if a scoped separate branch would help; I am keeping my feature PR isolated. This is a concrete cross-lane full-suite integration blocker, and the other 22 new local-property cases passed.
