# Public-interface finite-state recovery against SCO private handles (17 November 2026)

**Status:** reproducible, scope-limited negative attack result against the experimental Agent 12 SCO handle design. The latest live-verifier version was fully green on Ubuntu and Windows at exact executable source e87c04997b7736d062bccf4cf8eeb498fe713e73 in [manual SCO oracle workflow 44149360637](https://github.com/FlareZ123/obfs/actions/runs/44149360637), including strict SCO-oracle JSDoc. An earlier, looser-quota test passed at source e8c2e2d31bd7a70a39792c6797c5a1251e58ccff in [workflow 44146508736](https://github.com/FlareZ123/obfs/actions/runs/44146508736). This report was amended after the execution pins. It is not an established general obfuscation-security theorem.

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

## Pinned cross-platform observation

In both Ubuntu and Windows Node 22 logs at immutable source SHA `e8c2e2d31bd7a70a39792c6797c5a1251e58ccff`:

| Metric | Ubuntu | Windows |
| --- | ---: | ---: |
| Attacker RPC calls reported (learner plus one initial handle mint) | 713 | 713 |
| Distinguishable learned states | 4 | 4 |
| Binary words of length 1..10 verified after learning | 2,046 / 2,046 | 2,046 / 2,046 |
| Words absent from complete training-word set | 1,968 | 1,968 |
| Unauthenticated HTTP status | 403 | 403 |
| Cross-account handle replay | Denied | Denied |
| Private source canary and model expressions in public facade | Absent | Absent |

The exact emitted facade SHA-256 is `e70099fb7eb7248d418676afb2c798089ed7930c976842a0d154efc2f0189d1e` on both platforms. The "unseen" denominator excludes complete strings observed among all training traces, including prefixes; it is not a guarantee of fresh substrings under every possible oracle observation. Those 2,046 verifier comparisons are **not** included in the attack's 713 live public API requests. The private reference enters only after the learned model has been produced. The cross-account denial is an expected policy success for the defender.

**Performance limitation:** This test's roughly 700ms Ubuntu target test duration includes mixed local HTTP, instrumentation and assertions. It is not a paired original-versus-protected CPU measurement and makes no 2.5x performance claim. A full representative Node/browser client and server workload remains unmeasured for the handle design.

## Strengthened quota and live-verifier control

The first immutable run above used a larger explicitly configured per-principal capacity. That is unnecessary for recovery. In the strengthened test, the private-handle store uses its **default 256 active handles per principal and five-minute TTL**; the generated private ESM has a public close() operation, and the attacker revokes each previous handle before minting the next. The terminal logged value remains semantically an actual RPC count.

Both Ubuntu and Windows in the [full green run 44149360637](https://github.com/FlareZ123/obfs/actions/runs/44149360637), exact SHA e87c04997b7736d062bccf4cf8eeb498fe713e73, reported the same **public-facade SHA-256** cb671c792daa9038f054098862d7430e0cae034d962c9e153c7e44951d535585 and:

| Field | Cross-platform result |
| --- | ---: |
| Authorized public API calls during learning, including revocation | 837 |
| Abstract learner reset/step calls | 712 |
| Training handles explicitly revoked | 125 |
| Learned observable states | 4 |
| Offline post-learning reference comparisons | 2,046/2,046 exact |
| Complete validation words absent from training words | 1,968/1,968 exact |
| Additional independently selected public HTTP verifier words | 64/64 exact |
| Additional verifier-only public HTTP RPCs | 768 |
| Unauthenticated RPC | 403 |
| Cross-principal handle reuse | Denied |
| Private canary/model expressions in served module | Absent |

The additional 768 verifier RPCs happened **after** the learner had returned its fixed model; they cannot be counted as 837 attacker training calls. The 64 words, selected by a separate deterministic arithmetic sequence, were asserted absent from the training-word set. On those words the original truth model, reconstructed offline model and actual HTTP-served facade produced the same ordered outputs. The real HTTP verifier adds evidence beyond the 2,046 offline private-reference comparisons, but still exercises one four-state chosen fixture.

The attack leaves legitimate principal authorization intact and demonstrates observable-state cloning through permitted reset-like handle minting. It does not recover the original source file or random 256-bit capability tokens, does not make a general online learning guarantee, and does not prove that every possible private state is inferable. The default quota controls simultaneous outstanding handles; this learner remains under it by explicitly revoking old tokens.
