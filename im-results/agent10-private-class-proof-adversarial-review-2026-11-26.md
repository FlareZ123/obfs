# Adversarial review: private class-method property proof

**Date:** 2026-11-26  
**Reviewer:** Agent 10  
**Candidate:** `agent2/private-class-proof-current-main-20261126`  
**Candidate commit:** `754e57dc` (admission matrix)  
**Review branch:** `agent10/private-class-proof-adversarial-20261126`

## Scope

Reviewed Agent 2's narrow class-method admission in `src/properties.js`: a top-level, non-inheriting class with one ordinary zero-argument method whose sole statement returns one statically named property of a local owner object; every class use must construct a top-level const instance, and every instance use must be a direct zero-argument call of that method.

## Existing candidate evidence

The candidate's `test/private-class-method-proof-admission.test.js` explicitly loops over COO, SNO and SCO. Its 57-case admission/refusal matrix passed on Ubuntu and Windows with focused project, external and paired-budget JSDoc in run [45765835193](https://github.com/FlareZ123/obfs/actions/runs/45765835193). This is a focused acceptance receipt, not a full Node 22 suite or 2.5x runtime qualification.

## Additional adversarial controls

Added `test/agent10-private-class-owner-init-shadow.test.js` on the separate review branch. Run [45766940380](https://github.com/FlareZ123/obfs/actions/runs/45766940380) passed on Ubuntu and Windows, including focused JSDoc.

1. **Shadowed owner initializer:** A nested function declares a same-name local `owner` before the class, while the actual top-level `owner` is declared after the class and after an early method call. The class method reads the top-level binding. The proof refused all property rewrites (metrics 0), and execution parity was preserved. The nested same-name declaration did not bypass the binding/scope checks.
2. **Direct eval source observation:** Direct eval accesses both the instance and `Reader.prototype.read.toString()`. Dynamic-scope detection refused the proof (metrics 0; emitted source unchanged).
3. **With dynamic scope:** A `with` statement around the instance call refused the proof (metrics 0; emitted source unchanged).

A local Node probe also confirmed V8 returns no `CallSite.getFunction()` or `CallSite.getThis()` for a strict class method frame. The proposed Error.prepareStackTrace route therefore did not provide a way to retrieve the class method source in this environment. No source-observation false-safe is claimed from that hypothesis.

## Assessment

No false-safe was found in this review. The proof is substantially narrower than a general method escape analysis, and the candidate's existing matrix plus the additional eval/with/owner-shadow controls support its current fail-closed boundary.

One implementation detail deserves cleanup before integration: `ownerInitializationEnd` is selected by scanning identifier uses by spelling and taking the first matching object-literal declaration, rather than resolving the exact owner binding. The nested-shadow test is refused by downstream binding/scope checks, but resolving the binding identity directly would make the initialization-order invariant explicit and less dependent on those downstream guards.

The candidate branch was 14 commits behind current main at review time. Rebase onto current main, resolve any context drift, and rerun the focused matrix before integration. No production change is recommended solely from this review.

## Limitations

- No full Node 22 suite was run for this review.
- No browser-specific acceptance or runtime budget measurement was performed.
- DevTools/inspector access remains a broader dynamic-analysis threat; this review tests JavaScript-observable source/reflection paths, not the impossibility of hiding code from an attacker who can inspect live runtime state.
