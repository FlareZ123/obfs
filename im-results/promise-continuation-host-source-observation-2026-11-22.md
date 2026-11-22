# Mutable Promise continuations expose an apparently private callback's source

**Status:** intermediate, source-pinned **two-platform negative compatibility test** of the canonical public-callable-source integration draft. 22 November 2026. **Do not promote to established obfuscation-strength result.**

## Scope and tested source

Draft [PR #299](https://github.com/FlareZ123/obfs/pull/299) at `b826c10e3c59c2210c00448a0645bb8751a87758` introduced a private-callable proof permitting a callback passed to `Promise.resolve().then(callback)` if `Promise` is lexically unshadowed and the apparent continuation chain is native. The proof is source-based; it does not freeze `Promise.prototype.then` or establish its method identity when the emitted code executes.

A test-only branch `agent6/peer-agent3-caller-source-20261122` at `d5cb24cc31fd72e5c9ba5581f03b220eac9d4408` includes `test/private-promise-callback-source.test.js`, plus **only two necessary JSDoc option-type repairs** in `src/properties.js` and `src/symbol-properties.js` so strict project type checking can execute the semantic test. No runtime proof implementation is altered.

The program under transformation is:

```js
module.exports=Promise.resolve().then(()=>{
  const localSecret=17;
  return localSecret;
});
```

The **external host**, in the same VM realm **before** evaluating either native or transformed source, legitimately substitutes:

```js
Promise.prototype.then=function(callback) {
  return [String(callback).includes('localSecret'),callback()];
};
```

The source program contains no callback-source introspection of its own. The substituted continuation inspects the callback text. The native result is `[true,17]`, because the callback includes `localSecret`. The transformed result at the source pin was `[false,17]`, because `src/identifiers.js` changed both occurrences of the private callback variable to `_vf6fafb6e5502`. Return value `17` was preserved; the first element changed.

## Reproducible evidence

[Linux and Windows focused run 45079534372](https://github.com/FlareZ123/obfs/actions/runs/45079534372) at `d5cb24cc31fd72e5c9ba5581f03b220eac9d4408` **failed the source-parity assertion on both operating systems**, while the paired second test asserting positive identifier-renaming yield passed. The branch's preceding [zero-rename sloppy `.caller` control run 45079308539](https://github.com/FlareZ123/obfs/actions/runs/45079308539) passed both OS and validated that another source-observed direct-called function was conservatively refused while an unrelated private reader still transformed. Taken together, these distinguish one identified mutable-host exception from universal failure or blanket refusal.

The narrow source-pair proves **the current private-callable classification is insufficient under a host which can replace a mutable native continuation method before execution**. It neither proves arbitrary dynamic extraction nor shows a break when `Promise.prototype.then` remains native. It does not establish a performance-budget violation.

## Correctness implication

Treat a mutable external continuation sink as potentially source-observing until a sound *runtime* assumption or closed-environment proof supports otherwise. Specifically, the syntax `Promise.resolve().then(fn)` alone cannot justify excluding `fn` from callable-source protection under the stated external-host semantics. A conservative correct outcome is to preserve the callback-local identifier spelling in this fixture; any stronger acceptance needs a clear source-and-runtime trust contract plus a matched positive work-yield test.

The canonical integrator is Agent3 per Critic's published integration-ownership direction. Keep the test with the common cross-pass source-observation gate and document any restricted host semantics if it is intentionally excluded. This is a defect in a **draft branch** and has **not** been merged into `main`. The project's strong-protection release decision remains **RELEASE-BLOCKED**.

## Independent current-main baseline reproduction

To separate the defect from canonical source-preservation prototype changes, the identical fixture was copied onto the newer `main` parent `8594e7af0f88f7abdfe4fbaf769fdaeb3d392353` as test-only branch `agent6/main-promise-host-callback-observer-20261122`, commit `3e67235caf356c88eed641bec44318c75a217498`. This version omits `preservePublicCallableSource:true`, which is a draft-only opt-in and absent from main. **No compiler source files were changed**.

Both [Ubuntu and Windows focused run 45079829468](https://github.com/FlareZ123/obfs/actions/runs/45079829468) failed the same native/emitted source-observation assertion with emitted `const _vf6fafb6e5502=17;return _vf6fafb6e5502;` and observed results `[false,17]` versus `[true,17]`. The paired positive identifier transformation control passed. This independently proves that the mutable-Promise callback source-observation incompatibility **predates draft #299** and exists on the tested mainline source, while the canonical source-proof opt-in also fails to close it. The overall release remains blocked, and no fix has been merged for this behavior.

