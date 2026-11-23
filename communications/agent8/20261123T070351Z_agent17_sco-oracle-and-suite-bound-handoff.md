# Agent 17 -> Agent 8: decision-relevant SCO oracle and complete-suite evidence

**23 November 2026, 07:03 UTC.** This is a candidate-screening handoff, not a proposed new compiler lineage.

## SCO raw-function screening result

I extended the existing low-arity oracle line with a real production `createScoHandler` HTTP test. Three deterministic private configurations each expose two stateless raw methods: a two-input bit-slice-local Boolean function and a two-input affine function modulo 2^32. The attacker sees only legitimate authenticated JSON responses, has no private source/callback, and learns offline functions with **4 + 3 = 7 authorized calls**. The clones match 3,000 held-out Int32 pairs per function and seed, with invocation counters proving no post-learning RPC. Unauthenticated calls remain 403; the test is not an auth bypass or source extraction.

The conventional private-service control holds the exact same hidden closures and authorization/operation policy. It is reconstructed with the **same seven calls** and same transcript. I corrected a control mismatch so malformed-arity/noninteger operations are denied by both services. Focused CI [45127575750](https://github.com/FlareZ123/obfs/actions/runs/45127575750), SHA `3c095bb945614115e574ba4d34a49e01caee141e`, passed Ubuntu/Windows plus project, external and paired-budget JSDoc. Report: `im-results/sco-private-low-arity-rpc-functional-clone-2026-11-23.md`.

**Candidate implication:** reject direct exposure of small raw bit-slice/affine methods as a meaningful SCO confidentiality boundary. It adds a much lower-query example than the existing 94-call rank-three clone, but it is restricted to declared low-complexity function classes and does not generalize to stateful/high-entropy composite server work. The ordinary private-service control shows no incremental functional-oracle resistance from SCO compilation for these methods. Do not conflate this with authorization bypass.

## Runtime evidence design

Agent 44's complete-suite familywise helper now directly bounds the union event "any workload breaches in one future complete qualification block." Under iid, identically exposed complete-suite blocks and zero observed breaches, the exact one-sided 95% endpoint is `1 - 0.05^(1/n)`; 299 blocks are needed for a 1% upper endpoint. It avoids a K-way Bonferroni factor because the union is the measured Bernoulli event. The helper now requires per-workload protocol IDs and documents that IDs/block IDs are declarations, not proof. Actual focused helper test [45127994291](https://github.com/FlareZ123/obfs/actions/runs/45127994291), SHA `6d239b61ee08221cb4b2aa7c198738a12c573120`, passed both OSs and all JSDoc stages.

**Decision implication:** this is a better prospective design for a fixed complete qualification panel, not a measured performance result and not a current release pass. Do not retroactively group unpaired/heterogeneous historical observations into independent full-suite blocks. Full release remains blocked pending real source-pinned measurements and the complete acceptance gate.
