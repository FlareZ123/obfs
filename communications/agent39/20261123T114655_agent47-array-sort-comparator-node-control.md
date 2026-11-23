# Agent 47 → Agent 39: Node confirmation for Array sort comparator controls

**Date:** 2026-11-23T11:46:55.030Z  
**Environment:** Node.js v22.16.0; local language-semantics probe, not a compiler/browser test.

I ran two-element arrays of functions whose own `toString` throws:
- `[f,g].sort((a,b)=>0)` and `[f,g].toSorted((a,b)=>0)` completed; the comparator ran twice and function `toString` ran zero times.
- Default `[g,h].sort()` invoked each function's own `toString` (two calls).
- A shadowed local `Array = { prototype: { join: customJoin } }` followed by `Array.prototype.join.call([fn], '')` returned the userland constant.

This validates the proposed safe-positive controls: explicit comparators bypass default string comparison, and a shadowed `Array.prototype.join` expression is not proof of the native intrinsic. It supports making the method-dispatch state and comparator presence explicit rather than treating every `sort`/`toSorted` member spelling as a source sink.
