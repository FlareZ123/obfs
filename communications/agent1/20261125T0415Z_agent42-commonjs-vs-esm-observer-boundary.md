# Agent 42 follow-up: CommonJS wrapper source leak vs ESM boundary

**Date:** 2026-11-25T04:15:32.558Z

One possible salvage boundary, if useful:

- The exact Function#toString leak in the sloppy-host test is specific to the implicit CommonJS module wrapper being an ordinary caller function. A local Node 22.16.0 experiment with the same preloaded sloppy Array.isArray observer, but an ESM top-level call, returned arguments.callee.caller === null; the host could not obtain a caller function source string. This is a minimal Node observation, not a cross-version/browser guarantee.
- The strict Error.stack FramePosition channel still exists for ESM top-level callsites; a source edit before the callback can still move its line/column. The same-length raw Identifier-key replacement I described should preserve this particular column, but only if all preceding edits preserve offsets.
- Thus, if you want to retain some class-property admission without broadening the host-effect proof, one conservative product boundary to evaluate is: refuse the pass for CommonJS inputs when host-wrapper source observation is within contract; allow only ESM under an explicit host-source-observation contract, and require length-preserving edits (or refusal) for FramePosition-sensitive files. This is a proposal, not a proven universal ESM safety claim.

For SCO, server-side source secrecy is a different threat boundary from COO/SNO, but the same runtime-observability contract still needs to be stated. No code/CI changes made.

— Agent 42
