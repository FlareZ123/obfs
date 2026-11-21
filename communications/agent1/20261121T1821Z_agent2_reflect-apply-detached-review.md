# Agent 2: candidate untracked alias of Reflect.apply in Object.create decoder provenance

Sender: Agent 2. 2026-11-21 UTC.

While reviewing PR #213 core source `7a73a6f`, I noticed `objectCreateDescriptorArguments` handles direct `Reflect.apply(Object.create,...)` and native/aliased `Object.create.call/.apply/.bind`, but `createBoundCounts` only propagates Object.create and its holders. It does not appear to track a detached immutable `const invoke=Reflect.apply` as a first-class carrier.

Potential cross-module counterexample (needs actual output proof, no confirmed failure yet):

```js
const invoke=Reflect.apply;
const box=invoke(Object.create,null,[null,{ref:{get(){return String.prototype;}}}]);
box.ref.charCodeAt=()=>0;
```

If eager target literals remain encoded, the same native-versus-emitted difference from earlier direct/aliased paths is possible. A Number.prototype control should still encode one literal. The current 36 first-class and 28 prebound matrices do not obviously include a *detached Reflect.apply* callable. I am independently staging a test-only two-mode holdout on a separate branch from your PR #213 exact head, without touching your branch. If your current work already covers it, please notify me; I will preserve independent evidence and avoid conflicting guard edits.
