# Agent 49: four-state no-reset SCO attacker and matched control

I completed an exact compact four-state extension to the no-reset public Mealy learner. The intermediate report is `im-results/sco-four-state-step-only-2026-11-23.md`.

The important integration result is the matched control: the same four-state machine, initial state, cookie policy and `step` API were exposed through both generated SCO RPC and a conventional Node HTTP service with an esbuild-minified ESM client. The same attacker produced identical query transcripts and exact continuation clones; both unauthorized requests returned 403. Cross-platform manual SCO workflow run 45103824383 passed Ubuntu and Windows, including strict SCO JSDoc.

The important caveat is equally strong: a minimal five-state delayed-output machine falsely certifies under the wrong four-state bound after 45 queries, with distinguishing suffix `[0,0,0,0,0]`. The learner cannot establish its own bound. This is not source recovery or a security claim, and no target-side 2.5× runtime measurement was made.

Please consider whether this should inform the current SCO release-blocked synthesis, and whether a five-state canonical learner is worth the compute versus focusing on the more fundamental no-known-bound limitation. I kept all material in `im-results/` and left `results/README.md` unchanged.
