# Host-observed CommonJS wrapper defeats the private-class source exemption

**Researcher:** Agent 39. **Date:** 2026-11-22.  
**Status:** Intermediate falsification of one unmerged private-class proof-of-concept; not a general impossibility result.

## Question

Does the narrow `collectPrivateDirectClasses` exemption remain source-compatible when a class and instance satisfy its local non-escape shape, but an unrelated top-level call lets a hostile sloppy CommonJS preloader inspect the enclosing module wrapper?

## Setup

The POC under review is Agent 9's branch `agent9-private-direct-class-proof-poc-20261122`, observed base head `08aacd3c148845fff5768866dfe0df47bcc244b5`. Its proof in `src/properties.js::collectPrivateDirectClasses` accepts a top-level, unexported class with one zero-argument instance method reading one own primitive field from a private top-level const owner; a single local instance is constructed and used only through direct calls. It rejects direct eval/Function construction and `with`, but does not require a strict CommonJS directive or analyze other top-level host-call edges.

I created an evidence-only review branch, `agent39/review-private-class-host-caller-20261122`, and added `test/private-class-host-caller-source-review.test.js`. The fixture retains the POC's exact private class/owner/instance shape and adds one unrelated top-level `Array.isArray([1,2])` call. A preloaded sloppy replacement of `Array.isArray` records `arguments.callee.caller` and its `Function#toString`, then forwards to the native method. In a sloppy CommonJS module the caller is Node's module wrapper, whose source includes the complete file, including the class method.

## Source-pinned evidence

The review branch head used by CI is `521c9d06b841e563566911b6b026fdc9a4068870`; the focused test itself was introduced at `174c02e161bfccaed6cdcdaef6332950b4cf4962`.

[Run 45014907340](https://github.com/FlareZ123/obfs/actions/runs/45014907340) ran the existing manual source-observation workflow on Node 22.23.4, Ubuntu and Windows. The new step **“Host preloader observes private class source through sloppy CJS wrapper” passed on both platforms**. The private-class positive test, 16-case escape proof, existing CJS wrapper test, and strict project/external JSDoc also passed. The overall workflow was **red** on both platforms because two other existing steps failed: the initial implicit source-coordinate differential and the later combined ESM prototype-source pass. Those failures are not evidence against the new counterexample and must not be hidden by citing the new step alone.

The new test asserts, in both COO and SNO:

- `metrics.properties > 0` (the POC grants its positive own-key rewrite);
- native and emitted program results are both 7;
- native wrapper source observed by the preloader contains `privateField`;
- emitted wrapper source observed by the same preloader no longer contains `privateField`.

## Interpretation

The class, instance and owner bindings remain local, but the *enclosing sloppy CommonJS wrapper* is externally observable through a host-controlled callback. Because the wrapper's source contains the entire module text, an external host can see the changed class method spelling without ever receiving the class or instance. The POC's local class/instance reference proof does not account for this enclosing source exposure.

This is a specific counterexample to the POC under a hostile preloader and the strict source-parity contract. It does not refute the narrow proof under a no-host-observer / intended-runtime contract. It also does not establish that every private class must be refused.

A plausible bounded repair is to require a strict CommonJS directive for this exemption (the class method itself is strict, but the enclosing CommonJS wrapper is not unless the module directive makes it strict), or to prove that the entire enclosing wrapper cannot invoke a host callback capable of reading its caller. The former only addresses this legacy `.caller` vector; it does not prove resistance to arbitrary runtime instrumentation or extraction. The mainline strictness probe `test/sloppy-caller-source-strictness.test.js` at `6141a9bdcfd4dd5ad68e866b85e72246db62f200`, [run 45014548191](https://github.com/FlareZ123/obfs/actions/runs/45014548191), passed on both OSes and shows the same host preloader records `[null,null]` for strict CommonJS wrapper/worker callers while retaining the tested private property yield.

## Integration guidance

Do not merge the POC's class exemption into the canonical source-preflight branch without adding this negative host-preloader case and a strict-CJS positive control. Keep the POC branch as evidence; Agent 3 remains the sole canonical integration owner. This report belongs in `im-results/`, not established academic `results/`.
