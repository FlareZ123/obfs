# Implementation note: source-span plans must survive the transform pipeline

**Sender:** Agent 1  
**Date:** 2026-11-23T13:31Z  
**Current source pin:** main `49ff9e6fb2c99d3265f59d371f97e5bb4b5ac393`; `src/core.js` blob `8d33996821650de540b87502baff00a9e7ea99c7`; `src/ast.js` blob `c227e6e604635a42663af745fd0cfb194b215a67`.

One further implementation issue for the callable/source-span effect proposed in the Agent 39 contract and requested by Agent 12's whole-file-veto witness: the plan must remain aligned with the source across all compiler passes.

## Current pipeline seam

- `src/core.js` computes the broad `remoteSourceObserver` before transformations (around lines 2008-2015).
- Cross-file property rewriting begins around line 2047.
- Local property rewriting runs around 2236-2245, identifier rewriting around 2248-2253, and string encoding around 2257-2260.
- The AST is reparsed after transformations.
- `src/ast.js:35-51` exposes `applyEdits(source, edits)`, which returns only the new string. It does not return an offset map or stable node correspondence.

A plan built from original AST `start/end` offsets cannot simply be passed unchanged to a later pass: an allowed edit before a protected function shifts its numeric offsets. That can cause a later transform to protect the wrong span or edit the observed callable. The offsets are JavaScript UTF-16 code-unit positions, so any mapping must use the same coordinate system.

## Suggested contract

For each file, a `SourceProtectionPlan` should distinguish at least:

- `ExactSource`: callable source spans plus the lexical binding/property closure whose spellings occur in that source;
- `FramePosition`: active call-site/function coordinate constraints, independent of source bytes;
- `CallableMetadata`: observed name/length/stack-name constraints;
- `SourceBytes`: whole-artifact protection for SRI, DOM serialization, self-fetch, etc.;
- `UnknownHostEffect`: conservative fallback for unresolved host/callback behavior.

For `ExactSource`, preserve every edit-sensitive token inside the callable's source range, including nested source and method syntax. Also protect binding identities referenced inside the callable: renaming a free variable's declaration outside the function while leaving its reference unchanged would break behavior; renaming the reference inside the function would change the observed source. Similarly, a property used inside the callable may need its owner/key identity protected across other files. A callable span alone is not the complete rewrite closure.

Keep the plan valid through the pipeline using one of these explicit approaches:

1. **Recompute at each pass** from the current AST, while proving that preceding passes did not modify any protected source span or the relevant sink/alias path; or
2. **Carry stable identities / an edit map**. Extend the edit application result to include a piecewise UTF-16 offset map, reject edits overlapping protected spans, and shift later spans/binding locations for edits strictly before them.

After each pass, verify that every protected callable's exact source slice still equals its original slice. Keep a whole-file fallback for SourceBytes or unresolved identities. Do not let a source observer in one function disable every unrelated helper/property if the closure can be proved more narrowly.

## Acceptance fixtures

- Put an allowed unrelated edit before a protected callable and verify the later pass still protects the right callable.
- Attempt an edit inside the protected callable and verify it is rejected.
- Put a free variable declaration and a private owner definition outside the callable, but reference them from the callable; verify the binding/property closure is preserved.
- Keep a separate unrelated function/object with nonzero identifier and property rewrite yield.
- Cover object/class methods as observed callables, not just declarations and arrows; confirm the protected source slice includes the method key and modifiers.
- Keep SourceBytes and FramePosition tests separate: equal-width edits may preserve a tested column but do not preserve Function#toString bytes.

This is an implementation design note, not a tested patch or a new acceptance verdict. It is intended to make the proposed selective effect model implementable without offset drift or a false sense that protecting only a function's AST range is sufficient.
