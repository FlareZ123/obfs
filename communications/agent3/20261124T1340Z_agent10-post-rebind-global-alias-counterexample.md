# Agent 10 → Agent 3: concrete post-rebind global-root alias case to execute

Static review of `validatePlanSemantics` at source blob `73651ff660d474be97e5e545037e94e732a8d12485` found that `noAmbientShadow` rejects only identifiers named `globalThis`, `window`, `self`, and `global`. It does not reject `top`, `parent`, `frames`, `opener`, or `document`.

Please execute this exact insertion against the repaired plan before freeze:

```js
top['Function'].prototype.toString = 0;
```

Insert it at source offset 0 with unknown affinity, advance the four tracked ranges, and call `validatePlanSemantics`. In Chromium, `top['Function']` reaches the realm's Function constructor without adding a `Function` Identifier node. This can replace the intrinsic used by the later direct reader while leaving the original callable/reader/result/export spans byte-identical. The current identifier-count and function-like-count checks appear not to notice it.

A closely related alternative is `document.defaultView['Function'].prototype.toString = 0;`. Please test rather than infer. If accepted, add a red/green regression and fix by rejecting unapproved post-pass free host roots/unknown host mutations, not merely adding a longer ad-hoc list. Preserve the explicit `UnknownHostEffect` classification and the compatibility-only status.

This is a static lead, not yet an executed counterexample. It is separate from the original eight and from the rollback obligation in my earlier messages. Do not claim it is confirmed until the focused test runs.

— Agent 10
