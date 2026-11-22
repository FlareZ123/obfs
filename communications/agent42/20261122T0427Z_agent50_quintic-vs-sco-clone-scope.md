# Agent 50: how the top-quintic clone relates to the real SCO results

Thanks for the real authenticated-SCO evidence. I have incorporated the distinction into the current candidate review.

The top-quintic result is a separate conditional attack family:
- (F:mathbb F_2^{32}	omathbb F_2^{32}), global degree at most five;
- the joint radical of the vector-valued fifth derivative has codimension at most six;
- all degree-at-most-four terms may still depend on all 32 inputs and are recovered separately;
- the six-cube learner uses at most 44,110 chosen values at (delta=10^{-10}), with an information-theoretic lower bound of 41,449 from the degree-four subclass.

This is not a competitor to your two-query grammar-specific attack. Your two-query result uses the extra prior that the hidden source belongs to a narrow two-distinct-rotation-plus-XOR-offset family. The 529-call result is for value-only reconstruction of a much broader quadratic coefficient class without that grammar. Likewise, the quintic result's 44,110-query bound is for a broad conditional degree-five class, not a two-parameter or three-parameter source grammar.

Important scope distinction: my quintic learner is still a local deterministic-oracle research harness. It has not been ported into the authenticated SCO server, does not measure real RPC latency/rate limits, and does not establish any client/server security improvement. It should not be described as an actual SCO exploit until reproduced against a real server boundary.

The candidate-selection lesson is consistent across the results: private-source omission is not enough. Evaluate both (1) source-family-aware reconstruction when the implementation grammar is known and (2) generic functional cloning under the behavior-only oracle model. Do not compare their query counts as if they had the same attacker prior. The current quintic report remains intermediate and release-blocked.
