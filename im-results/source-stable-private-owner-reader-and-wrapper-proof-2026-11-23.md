# Source-stable private owner readers, cross-file wrappers, and mutation proof

**Agent 10 — 23 November 2026. Status: intermediate compatibility evidence; not release-grade security evidence.**

## Question

Can the property-analysis backend recover safe private own-field rewrites without changing the source of an exported callable wrapper, while refusing function values that escape through host-visible bindings? Can the same proof support real cross-file ESM graphs and private mutation without violating the 2.5× sampled runtime budget?

This investigation is about *bounded semantic admission*. It does not establish that renamed fields or Symbol keys resist static reconstruction, runtime extraction, hostile instrumentation, or a fully compromised SNO process.

## Changes under evaluation

Research branch: `agent10/exported-wrapper-private-reader-20261123`, source-pinned full run head `c9ad...` (see run 45147132188).

1. **Private reader argument proof in `src/properties.js`.** A tracked local owner passed to a direct-call-only helper may be admitted only when the helper has a narrow, statically inspectable reader shape. The current branch version accepts a one-parameter function whose body is either one static member-read return or a const binding from that member followed by returning the binding. It requires the helper node to be private/direct-call-only and the formal parameter to be the proven alias. It rejects identity forwarding, callbacks, computed/optional reads, additional statements, multiple parameters, and helper escapes. The identity-forwarding negative is in `test/exported-wrapper-private-reader.test.js`.

   **Review caveat:** Agent 46 has supplied a stricter, independently tested grammar: one non-async/non-generator `FunctionDeclaration`, exactly one formal parameter, and a body consisting only of `return formal.staticField`. No current positive fixture requires the broader arrow/function-expression or two-statement const-binding forms. The current branch has not yet been narrowed to Agent 46's grammar; do not treat the broader shape as final acceptance.

2. **Private class-method proof in `src/properties.js`.** The candidate admits a top-level class with no superclass and exactly one ordinary, nonstatic, noncomputed method; the method is zero-argument and returns one statically spelled owner-field read. The class and instance must remain local, instance construction must occur after the class declaration, and all instance uses must be direct zero-argument method calls. A 58-case admission suite includes positive and refusal cases.

   **Host-observation caveat:** `im-results/private-class-host-caller-source-leak-2026-11-22.md` records a hostile sloppy CommonJS preloader that captures the enclosing module wrapper via `arguments.callee.caller` during an unrelated host call and observes private class source. Requiring a strict CommonJS directive may close that specific legacy `.caller` path, but does not prove resistance to arbitrary stack inspection or runtime instrumentation. Keep the class proof experimental and isolated pending a host-observer differential; do not promote it as source confidentiality.

3. **Fixture classification and source-stable wrappers.**
   - Blob constructor and options fixtures use a private direct-call helper behind a source-stable public wrapper.
   - Bound-function host interception fixtures expect refusal and unchanged target source, including SNO.
   - ESM factory and multi-file ESM fixtures keep exported wrapper bodies stable while private readers use local/imported state.
   - Symbol-key mutation uses a private helper with a literal compound update (`bag.pulse += 2`) and a source-stable exported wrapper. The generated example is reproducible; a static attacker recovers the emitted Symbol keys. This is a correctness/control result, not secrecy.
   - The tuple session isolates numeric arithmetic in a private helper and measures the 2.5× budget.

## Focused evidence

The following focused workflow runs completed successfully on Ubuntu and Windows with strict JSDoc checks unless noted otherwise:

| Area | Run | Result |
|---|---:|---|
| Exported-wrapper/private-reader proof | 45142560939, 45142567246 | Green |
| Class-method admission matrix | 45142932249, 45142939593 | Green |
| Blob/bound host-source fixture group | 45143235969, 45143242491, 45143250132, 45143256779, 45143263704 | Green |
| SNO bound-target refusal after assertion correction | 45146519971 | Green |
| Symbol sample regeneration | 45146513648 | Green |
| Symbol mutation regression | 45146689686 | Green |
| Cross-file ESM wrapper/factory | 45146703935, 45146711431 | Green |
| Private tuple session budget | 45146718364 | Green |
| Static Symbol recovery | 45147073683 | Green |

The tuple profile tests four operation counts with repeated paired runs and requires every sampled row to remain within 2.5×. This is finite evidence for that workload only, not a universal worst-case bound.

The static Symbol recovery test deliberately confirms that native instrumentation can recover the generated private keys and that a host can collide them. This directly prevents treating Symbol-key conversion as a confidentiality guarantee.

## Full validation status

The complete, unfocused manual-validation workflow was dispatched at exact branch head `c9ad...` as [run 45147132188](https://github.com/FlareZ123/obfs/actions/runs/45147132188). At the time this report was written, both Node 22.23.4 behavioral/adversarial suites were still running; subsequent exhaustive inversion, source-paired compiler A/B, performance, JSDoc, and Chromium steps were pending. **No full-suite result is claimed here.** Update this report with the exact final per-OS test counts and failed-step diagnostics when the run completes.

Agent 46's source-paired class-method full comparison is recorded in `im-results/private-class-method-owner-finite-proof-2026-11-23.md`: its parent and candidate full runs were both red, with two original class-positive failures removed and no additional named behavioral failure in that specific source pair. That result is separate from this branch's broader wrapper and fixture work.

## Interpretation and unresolved work

- The focused results support finite semantic compatibility for the listed private-reader, cross-file, Symbol-mutation, and tuple workloads.
- They do not establish static deobfuscation resistance. The Symbol-key recovery control demonstrates recoverability.
- They do not establish resistance to dynamic instrumentation, memory inspection, or SNO filesystem/runtime access.
- They do not establish SCO server secrecy or resistance to unlimited legitimate server requests.
- The measured tuple workload is not a universal 2.5× bound; browser startup, GC tails, independent sessions, and other program shapes remain separate.
- Narrow the private-reader grammar to Agent 46's one-argument FunctionDeclaration / single-return form, with explicit arrow and const-binding refusal tests.
- Add a hostile sloppy-CommonJS wrapper-caller test for private class admission; consider refusing that domain unless strictness and the relevant host-observation contract are proved. Do not infer that strict mode closes all instrumentation paths.
- Obtain independent review from Agent 3 and reconcile this branch with the canonical source-preflight path before integration.
- Run an exact-source baseline/candidate full comparison if the current full run is red; do not attribute pre-existing failures to these changes without matched evidence.

**Disposition: research branch only; release remains blocked.**


## 09:42 UTC checkpoint — narrowed reader grammar and host-caller gate

The branch advanced to `e9fef3695d9ba91b2b2592b9558cd7f532c45e03` after the original full-run head. Two proof surfaces were narrowed:

- **Private reader argument admission** is now exactly one direct-call-only, non-async/non-generator `FunctionDeclaration`, one identifier formal, one call argument, and one `return formal.staticMember` statement. Arrow readers, const-binding readers, multi-parameter readers, computed readers, and identity forwarders are explicit refusals. The straightline CPU fixture was rewritten to this grammar and explicit strict CJS.
- **Class-method admission** now requires ESM or a top-level `'use strict'` directive in CommonJS. A real Node preloader test verifies sloppy CJS refuses the rewrite and exposes the unchanged wrapper source, while strict CJS admits the finite class proof and the `.caller` observer receives no wrapper function. This closes only that specific legacy caller path; it does not establish resistance to Error stack/CallSite instrumentation.

Focused runs on the narrowed head `e9fef...` passed on Ubuntu and Windows with strict JSDoc:
- Host-caller source review: 45148730670
- Class-method admission matrix: 45148737809
- Exported-wrapper/private-reader grammar: 45148744987
- Function-declaration reader proof and public-only normalization: 45148751545

The earlier full workflow 45147132188 **completed with failure** at head `c9ad3d6...`, before the strict-CJS and narrow-reader changes. The Actions log endpoint was rate-limited during diagnosis, so the failed-step list could not be retrieved. Do not attribute that red run to the final `e9fef...` head, and do not claim full-suite success. No full run has yet been executed on the narrowed head.

The remaining disposition is research-only: the class proof still has an incomplete arbitrary-stack-observer model; the full suite must be rerun on `e9fef...`; source-paired baseline/candidate results and the 2.5× budget must be retained as separate evidence.
