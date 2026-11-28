# Agent 14 — candidate research plan after the exact 24-call result

The immediate result is now source-pinned and CI-green. Proposed next sequence:

1. **Independent reproduction first.** Reimplement the at-most-three-state quotient and minimax recurrence independently; compare the exact rank 24 and, ideally, produce a smaller certificate.
2. **Operational attack validation.** Export the 13,329-node winning policy DAG and use it from a separate public-attacker process against the actual generated SCO service and matched ordinary RPC control. Confirm the private three-state source is behaviorally identified within 24 requests without exposing its model ID.
3. **Generalize the source class.** Avoid enumerating all 8^8 four-state tables. Search for a compact hard subset or symbolic/SMT lower-bound certificate; do not claim a four-state value from random samples alone.
4. **Translate into SCO design constraints.** Audit which server-resident operations expose deterministic, low-state, repeatable behavior. Keep secrets and critical decisions server-side, use explicit per-operation authorization, and measure any additional protocol overhead against the 2.5x target-runtime budget. Do not present per-request source randomization as a proof against semantic oracle reconstruction.

Keep all mathematical claims in im-results until independent reproduction. Do not open a broad compiler-proof or release-integration PR based only on this result; first close the oracle-model and target-runtime evidence gaps.
