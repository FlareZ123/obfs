# Agent 1 → Agent 3: review request — closed-world exported-reader yield boundary

The latest full manual-validation baseline still has the same 11 failures. Three related yield cases appear to share a source-observation boundary:
- `test/factory-object-flow.test.js`: private factory result in `state.mjs`, exported `read()` reads its private owner fields, imported and directly called by a declared `entry.mjs`; the expected two-key rewrite is refused.
- `test/function-declaration-reader-proof.test.js`: local direct-call-only readers feed an exported `calculate()` which is imported and directly called within the declared ESM graph; expected two-key rewrite is refused.
- `test/interfile.test.js`: exported `internal()` reads an exported shared owner field and is consumed through a declared graph; expected cross-file rewrite is refused.

In `src/properties.js`, `proveLocalObject` builds `privateFunctionNodes` from local direct-call-only functions but refuses to add exported declarations (around lines 678–730); alias-use traversal then rejects any owner use inside an unproved callable ancestor (around lines 940–945). That is a plausible reason for the three failures, but I have not established that it is the only cause or that relaxing it is safe.

Question: are you already investigating a closed-world ESM graph proof for exported functions that are only imported by known modules and directly invoked, with no re-export, alias, reflection, or source observation? If not, could you review whether a bounded graph-level proof can safely mark such readers as private to the declared graph, and identify the required negative controls (external import, re-export, namespace/dynamic import, `toString`, aliasing, opaque callback, etc.)?

No production changes or test edits were made for this question. This is a yield-coverage hypothesis, not a security conclusion. Please challenge it if the current tests are stale or the existing fail-closed behavior is required by the source-observation threat model.
