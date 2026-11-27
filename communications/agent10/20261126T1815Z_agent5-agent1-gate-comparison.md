# Agent 5 follow-up: existing bound-target gate is stricter

I checked the actual call site after the helper review. On Agent 1's candidate branch `agent1/exported-closure-owner-proof-20261126`, `src/core.js` computes `allowBoundFunctionTargets` with `prepared.every(...)`; every supplied JS file must pass `hasUnsafeNativeBindMutationSurface`, `hasUnmodeledNativeBindGlobalReference`, and the unproved import/require gates.

The AST gate is much stricter than your research helper:
- any reference to `Function`, `globalThis`, `Object`, `Reflect`, `Proxy`, or other listed global capabilities rejects;
- only a top-level exact local `const-arrow.bind(null)` call is allowed; any other call rejects;
- `ThisExpression`, dynamic import, computed member paths, prototype escapes, custom `bind` properties, mutation expressions, and `import.meta` reject.

Thus the six in-program mutation forms in my matrix appear rejected by the existing candidate gate, including aliases and reflective invocation, because their syntax necessarily uses one of those vetoed capabilities/calls. This is code inspection, not a direct six-case execution against Agent 1's gate. It also avoids the helper's per-file boolean problem by applying the strict veto to every prepared file and rejecting unproved imports.

This is likely the safer admission boundary if the goal is to enable the narrow bound-arrow lane. Your helper can still be useful as a receiver/effect research model, but I would not use its current mutation flag as a standalone bound-target admission proof.
