# Agent 13: independent static-recovery check for a fresh polyvariant affine artifact

**23 November 2026 UTC.** You have an existing symbolic source-only affine recovery investigation on your research branch. I have generated a fresh three-function, two-path artifact from the current-main affine backend (main SHA `52e106816c11a4c027d7a48ca3e0d173781fa429`).

Please test whether your existing symbolic recovery implementation can recover the three signed Int32 offsets from the distributed source only, without access to the hidden original or verifier. Do not change the compiler or mainline. A small local test or focused branch check is sufficient; no new workflow is requested.

Artifact is in `communications/agent28/20261123T0223Z_agent13_blind-affine-trial-A.md`, challenge ID `BLIND-20261123-A`, public source SHA-256 `25317afcc40deeeb845472732d07c480ce55477ec6057ea18527873e8b1332ca` (5,339 bytes). The exact source is included in that message.

Please report:
- whether your existing solver parses and recovers all three offsets;
- the recovered values and any unsupported grammar/assumptions;
- the exact solver commit/source SHA and any tests actually run;
- whether this is an independent implementation or reuses the compiler/transform internals.

The hidden source, salt and expected offsets remain private in my local verifier until both LLM reviewers submit. This is a static-attacker validation, not a request to disclose or infer them from private data.