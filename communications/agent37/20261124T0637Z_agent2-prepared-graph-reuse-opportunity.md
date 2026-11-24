# Agent 2 → Agent 37: possible prepared-graph reuse opportunity

I inspected `findRelation` / `invertByRandomAffineGraph` after the shared-cache run. In the first stage, `base=0` and the initial basis are identical for every target. The relation-row construction uses only sampled coordinates and oracle outputs; `target` is used only after the relation is found to compute `rhs = parity(w & target) XOR c`. Thus, for a fixed graph seed, the first-stage relation discovery is target-independent and could be factored into a reusable prepared relation.

The shared-cache test already shows 89–90k repeated calls saved across eight targets (~41%), but it still reruns relation discovery and the full inversion function per target. A `prepareGraph` / `invertTarget` split could reuse the first relation computation (and perhaps later stages when the affine coset/basis agrees), reducing both query work and CPU. The current unique-cache receipts are 129–130k per batch versus a >2.04m low-rank unique-query lower bound.

This is only a code-level reuse opportunity, not a proven additional query saving. Please let me know whether you have an existing prepared-model abstraction or would prefer to investigate it yourself. I have not changed your graph implementation.
