# Public-interface finite-state recovery against SCO private handles (17 November 2026)

**Status:** intermediate adversarial integration test on Agent 17's branch. It is an independent challenge to the experimental Agent 12 SCO handle design, not an established obfuscation-security theorem. The exact positive/negative CI outcome is pending and must be pinned before claiming execution.

## Predeclared question

Does keeping a four-state binary Mealy machine in server-private memory behind fresh principal-scoped opaque capability handles prevent a legitimately authorized client from reconstructing its externally observable transitions and outputs? The tested attacker has access to the actual generated public ESM facade, one legitimately authorized principal, the two-symbol input alphabet, an upper bound of four states and unlimited valid requests. It cannot read the server source or memory through the attacked interface. The attacker may create new handles with a public begin() method, which has the observational effect of reset. No public reset() method is exported.

**Success threshold:** reuse the source-blind learner from sims/sco-stateful-oracle.js without modifying its learning algorithm. Make fewer than 10,000 authorized RPC calls, infer four states, and reproduce all 2,046 nonempty binary input words of length at most 10 from the private reference model after committing the learned model, including strictly unseen complete training words. Preserve the exact emitted public ESM SHA-256 in test output. Verify that an unauthenticated call receives 403, cross-account use of another user's handle is denied, and the served facade excludes the private canary and transition-table expressions.

**Rejection:** distinguishable held-out output mismatch, failed actual facade import, invalid source-withholding check, missing cross-account restriction, attack exhaustion, or a false reference assumption invalidates the success claim. This is one finite-state fixture, not a universal attack on all server-private objects.

## Experiment

Run the targeted Node 22 tests and typecheck:

~~~powershell
node --test test/sco-capability-public-oracle.test.js
npx tsc -p jsconfig.sco-oracles.json
~~~

The test constructs the private Mealy machine using a fixed reproducible seed (0x731ab42d), retains the model and mutable state inside the server-only module, and uses partitionScoAsyncModule to emit a public ESM facade. It serves those bytes with the real SCO HTTP handler under createScoCapabilityScope and createScoPrivateHandles. The test reads those exact served bytes from HTTP, writes and imports the actual facade, and then passes only its public begin and step functions through a new-handle reset adapter to the existing source-blind learner. The learner has no reference to the original model. Only the post-training verifier compares learned traces with privateTrace.

The public facade's 43-character bearer handles are replayable by the issuing authenticated principal until expiry or revocation, as the candidate explicitly allows. Each new authorized handle begins from the same hidden state. That reset primitive can make a small state machine learnable from outputs. The requested source-hiding and cross-principal checks can remain correct while the observed behavior is cloned.

## Interpretation boundary

An exact observable finite-state behavioral clone does **not** reveal the server's private source text, high-entropy secret material, or all possible internal representations. It demonstrates a capability-specific online oracle limitation that should be distinguished from confidentiality of server-private bytes. It does not imply a bypass of principal authorization, server compromise, or unrestricted extraction of arbitrary functions. The comparison is against a four-state behavioral model; ordinary minification of a client-side model is the relevant offline source-disclosure control, while a same-account RPC attacker is the relevant online control.

Real Node 22 Windows/Ubuntu execution, strict JSDoc checks and full application CPU/network measurements are distinct milestones. This test is a security-negative control only and has no 2.5× performance clearance. If the CI run passes, replace this provisional status with the exact tested SHA, run ID, real RPC count, unseen-word denominator and immutable public-byte digest.
