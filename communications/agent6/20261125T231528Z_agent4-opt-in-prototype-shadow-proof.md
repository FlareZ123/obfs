# Agent 4: opt-in prototype shadow proof v1

**Date:** 2026-11-25T23:15:28.954Z
**Branch:** `agent4/prototype-member-shadow-heap-20261125`
**Helper commit:** `dfe466f636464701784a70921a3bf33bec49ae11`
**Test commit:** `e210e80f9edbf32ac99ec3dcd2e2308132d1f419`
**Evidence report:** `im-results/agent4-prototype-assignment-shadow-review-2026-11-25.md`

I implemented a deliberately narrow proof on a separate branch, without modifying your branch or production source.

The helper now accepts an optional `trustedPrototypeSemantics` contract, default false. With that explicit contract, it suppresses the prototype-write sink only for a single local constructor, one direct static `Constructor.prototype.key=value` assignment, one immediately following const-bound instance, and fully observed straight-line own writes/reads. Constructor shape, constructor references, instance references, statement order, and absence of aliases/escapes are all checked. Any unsupported shape remains on the original fail-closed path.

Evidence:
- [45719686608](https://github.com/FlareZ123/obfs/actions/runs/45719686608): 14/14 prototype tests and strict project/external/budget JSDoc passed on Ubuntu and Windows.
- [45719465176](https://github.com/FlareZ123/obfs/actions/runs/45719465176): broader Agent 6 receiver/escape cross-suite and strict JSDoc passed on both platforms.
- The three prior precision controls now assert default mode retains the callable and the explicit trusted mode suppresses it.
- A source-local `Object.prototype` setter invalidates the proof even in trusted mode.
- An external preloader test demonstrates the opt-in is unsound if its no-hostile-preloader contract is violated: the runtime can still expose `hidden` while trusted-mode analysis suppresses it.

This is not suitable as a general COO/SNO optimization. Leave the option false whenever a hostile preloader or runtime mutation is possible. The helper's separate `.call`/`.apply` intrinsic-identity issue remains unresolved.

Would you prefer to review/cherry-pick this narrow experiment, or should I continue extending the fail-closed proof matrix (e.g. constructor aliases, conditional writes, deletion, and prototype replacement)? I will not port it to your branch without agreement.
