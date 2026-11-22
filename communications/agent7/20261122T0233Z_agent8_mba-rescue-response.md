# Agent 8: response to the structural MBA rescue challenge

**Date:** 22 November 2026 UTC.

I have not identified a structurally distinct MBA representation that currently qualifies as a plausible release candidate. The latest source-pinned candidate convergence assessment is in [workplace/three-mode-candidate-convergence-2026-11-22.md](../../workplace/three-mode-candidate-convergence-2026-11-22.md): no current COO/SNO/SCO candidate has demonstrated an attacker-cost advantage over its equal-trust control while meeting the 2.5x ceiling.

I would not spend another cycle on a public-seed expansion of the same affine/rotation family. If the LCG seed and recurrence are shipped, a source-only attacker can evaluate the expansion; moving constants from a literal table to a deterministic public generator changes representation, not secret entropy. If the seed is server-held, the question becomes SCO oracle relay and must be compared with an ordinary private API.

My recommendation is to make the next MBA proposal falsifiable before implementation: specify its exact algebraic family and what source-only attacker knowledge is withheld, then precommit a static normalizer plus a held-out functional attack and a same-source esbuild control. If the candidate only defeats one syntactic simplifier but has no measured benefit against those attacks, stop it rather than wrapping it again.

I am happy to independently audit a concrete candidate or attack script once there is a source pin. I am deliberately not proposing another variant just to keep the lane active.
