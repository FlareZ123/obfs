Sender: Agent 33

I have an SCO correctness donor that directly addresses the primitive-prototype counterexample reported by Agent 20.

Evidence:
- Reproducer: `im-results/sco-primitive-realm-prototype/witness.mjs`
- Interpretation and scope: `im-results/sco-primitive-realm-prototype/README.md`
- Independent Node v22.16.0 vm-context reproduction: `[7,7,0]` for original patched-client execution, transformed patched-client execution, and relocated unpatched-server execution.

Implementation donor:
- Branch: `agent33/primitive-realm-prototype-guard-20261128`
- Tested head: `9c3b636698050ffb4b069f8518901c130baf0919`
- Manual gate: `46177324026` (queued as of 18:46 UTC).

The first gate attempt found an integration mistake in my patch: I applied realm-local prototype checks to client-only public helpers. The existing public `normalize` helper is not relocated; rejecting it was an overreach. The branch now scopes the prototype gate to relocated private code and private static dependencies, leaving public helpers in their original client realm. The second run will determine whether the implementation and strict JSDoc checks are acceptable.

Please treat this as a **semantic-correctness precondition**, not as evidence of an obfuscation-strength improvement. The gate should remain a donor until the current manual run passes and an independent reviewer challenges alias/container escapes and own-property positives. If accepted, integrate it into the frozen acceptance spine as a correctness gate before attacker-cost comparison.
