# Strict ESM IIFE external host stack-coordinate observation, 23 November 2026

**Classification:** intermediate **red** semantic-parity evidence for a source-transforming COO compiler candidate. No safe compiler fix, mainline acceptance or strong-obfuscation advantage has been established. Global status remains **RELEASE-BLOCKED**.

## Reproduction and controls

A strict ESM immediately invoked arrow executes `globalThis.HOST_STACK_SPY(owner.longPrivateFieldForHost)`, where its own function object is neither stored nor exported. The host callback receives the primitive number 47, invokes `new Error('host source observer').stack`, and extracts its ESM caller's line and column. Because the compiler renames the private field and reduces preceding source length, the host can distinguish the native and compiled invocation through V8's native frame column. This violates 1:1 externally observable JS behavior despite matching numeric results.

The callback never reads the IIFE function object or `Function#caller`. Thus the strict-mode restriction on recovering the function object through the legacy caller accessor does not settle stack-coordinate preservation.

**Pinned actual compiler / test-only branch** [agent39/host-stack-callback-iife-20261123](https://github.com/FlareZ123/obfs/tree/agent39/host-stack-callback-iife-20261123), based on main `eb2cb90960848f19a47e75b1aec5dc779f9cace6`, test-only SHA `2b694c5d08f877fe848ca4e9c42d6ea560f9a1b6`, file `test/host-callback-strict-iife-stack.test.js`. [Existing focused two-platform workflow 45148478509](https://github.com/FlareZ123/obfs/actions/runs/45148478509) failed the **same** exact parity assertion on Node 22.23.4 Ubuntu and Windows:

| OS | Original | Actually compiled |
| --- | --- | --- |
| Ubuntu | `{value:47,line:1,column:71}` | `{value:47,line:1,column:62}` |
| Windows | `{value:47,line:1,column:71}` | `{value:47,line:1,column:62}` |

An independent positive control in this exact test permits an actual **one-property rewrite** inside a strict ESM IIFE when the result is read locally without the external host source observer. This proves that the tested compiler is performing useful private-owner work rather than merely copying the source. The host callback graph's numeric output remains exactly 47 on both arms. A preliminary red [45148368774](https://github.com/FlareZ123/obfs/actions/runs/45148368774) was caused by the test's too-narrow assumption about the V8 stack callsite offset (71 vs assumed 60); this was corrected before the definitive paired red `45148478509`.

## Implications and proof boundary

A rule that treats a direct strict IIFE as source-private solely because its callable object cannot escape is insufficient under the stated arbitrary host-callback observation model. A user- or host-provided callback can log a stack frame, even without reference access to the caller. The compiler must establish a source-coordinate-preserving transformation or decline to rewrite a source region that could invoke this observer. A specific one-off callback name check is not a general solution: aliases, imported callbacks, nested host objects and callback indirection all merit explicit flow proofs.

The test uses one same-line Node 22 ESM source and a locally injected `globalThis` callback. It does not establish the general outcome for browsers, imported callbacks, arbitrary program graphs, dynamic source extraction, security under hostile instrumentation or the 2.5x runtime ceiling. A future fix needs both a real negative host source-coordinate regression and a nonzero safe private-owner positive transform. It also needs full current-main integration and independent review.

This is consistent with [V8's Stack Trace API](https://v8.dev/docs/stack-trace-api): strict mode restricts retrieval of caller function/receiver objects but still exposes frame locations. [MDN documents Error.stack](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/stack) as a widely implemented nonstandard source of location data.

**Disposition request:** Agent 10 and canonical Agent 3 should inspect this actual red source and decide whether to port a narrowly proved sink guard, develop a more general host provenance model, or defer while retaining the release veto. Avoid interpreting absence of `caller` visibility as a complete source-observation proof.
