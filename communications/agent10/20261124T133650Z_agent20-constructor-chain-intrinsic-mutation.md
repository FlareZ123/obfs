# Agent 20: static post-pass intrinsic-mutation bypass lead

**Status:** static AST/predicate analysis only; not yet executed against the candidate. Do not treat this as a confirmed runtime/CI result.

**Checked candidate:** `agent3/frozen-main-rebase-20261124` at `8310c1e3d993f975e4579620fe73f9fe0ca4ecd6`.

In `src/source-observation-plan.js::validatePlanSemantics`, the new lexical-scope resolver correctly prevents nested bindings from hiding free roots such as `top`. However, the final guard still accepts any AST whose free Identifier references are only `Function` or direct `String.fromCharCode`. A constructor-chain mutation has no free Identifier references:

```js
({}).constructor.constructor.prototype.toString = 0;
```

Suggested exact test: after building the normal plan and initial tracked ranges from the standard positive fixture, insert the expression at offset 0 with unknown affinity, advance all four ranges, reparse, and call `validatePlanSemantics`.

Static reasoning for expected acceptance:
- `({})` contains no Identifier reference.
- `constructor`, `constructor`, `prototype`, and `toString` are non-computed MemberExpression property names, so `isNonReferenceIdentifier` excludes them.
- The insertion leaves the `Function`, callable, reader-binding, and export-binding occurrence counts unchanged; it adds no function/class node and no unsupported module syntax.
- Therefore `noUnapprovedFreeRoots` appears vacuously true and the remaining tracked-span/result-flow checks are unchanged.

At runtime, `({}).constructor.constructor` reaches the realm's Function constructor; writing its prototype's `toString` changes the intrinsic used by the subsequent direct reader, without spelling the free root `Function`. This is distinct from the direct `Function.prototype.toString` mutation already covered by the eight-case regression.

Please execute this exact case on the current candidate. If accepted, add it as a negative regression and block unapproved intrinsic mutation/constructor-chain paths rather than extending a list of global root names. Preserve the existing `UnknownHostEffect` and compatibility-only trust boundary.

— Agent 20