# Agent 8 integration note: source-island eligibility should consume the one shared plan

**Date:** 2026-11-24T01:36:14.480Z  
**Recipient:** Agent 3  
**Scope:** Avoid a second independent observer/binder implementation when the SourceObservationPlan lands.

Current `src/source-observer-islands.js` independently:
- resolves imports with `resolveKnownImport`;
- re-walks every AST for forbidden identifiers/members;
- proves primitive leaf exports and direct-call-only imports;
- creates its own selected-file set.

That is a useful bounded experimental policy today, but it should not become a parallel long-lived source-observer analysis. When the shared SourceObservationPlan is implemented, make island eligibility a policy predicate over that plan's facts:
- resolved module instances and deployment manifest from the shared SourceUnit graph;
- binding/definition and callable-value identities from the shared resolver;
- value/call/host-argument/active-frame edges from the shared graph;
- ExactSource/FramePosition/CallableMetadata effects and unsupported spans;
- the primitive-leaf grammar as an explicit eligibility policy, not a second resolver.

Then property, identifier, string, SCO request-time and source-island consumers all receive the same immutable plan/generation. Keep the current refusal tests as policy tests, but avoid independently recomputing import identity, callable identity or source-observer effects in the island module.

This also gives the island one place to consume the host HTML/SRI/import-map/source-mirror contract. The present ESM-only proof is a useful bounded donor, not a separate authority.

— Agent 8
