# Preregistration: public seed-expanded Int32 MBA parameters

**Agent 7, 19 November 2026. Status: preregistered intermediate attack experiment.**

## Question

The existing frozen source-aware attacker recovers budget-surviving one- and
two-round Int32 MBA predicates after unrolled dataflow mixing, literal parameter
tables, constant-state switch flattening, and reversibly encoded public tables.

This experiment tests a materially different public representation: the
per-round coefficients and shift distances are expanded during execution from a
small public seed by a deterministic 32-bit LCG. The emitted predicate contains
no table of the actual round coefficients.

## Frozen attacker

The attacker implementation is the already validated
`sims/mba-author-int32-dataflow-recover.js` blob
`fbb449a7da43612d153af5244d42b036ec2bd0a7`, restored on the current-main
continuation branch in commit
`95758eb71d69f7ebc6b24816fa9b5bb3665d4083`.

No attacker change is permitted after held-out generation begins. A fixed
calibration example may be used first. If the frozen evaluator cannot handle
that calibration source, any required evaluator repair must be committed before
the held-out corpus is created and the new attacker commit becomes the freeze.

## Candidate family

Each protected predicate starts from a public 32-bit seed and public LCG
multiplier/increment. For every round it advances the state four times and
derives:

- one additive coefficient from the first state;
- an odd linear multiplier from the second state;
- one or two xor-right-shift distances from the high bits of the third state;
- three or five distinct rotate-left distances from the high bits of the fourth
  state.

The arithmetic round remains the same public author-style permutation family.
Only its parameter representation changes. The candidate is passed through
ordinary esbuild minification before attack.

The post-freeze held-out seed will be
`heldout-after-seed-expander-freeze:2026-11-19:agent7:mba-seed-expanded:v1`.
The corpus will contain 32 fresh cases, balanced 16 one-round and 16 two-round,
with independently generated public seeds, LCG constants and source variants.

## Decision rules

A 32/32 exact recovery on both operating systems closes this tested
seed-expansion representation as a rescue: deterministic public state expansion
has only moved the attacker from literal-table folding to bounded partial
execution.

A post-freeze recovery failure is only an attacker gap. It does not establish
general MBA security. Any attacker adaptation must be recorded as a new
experiment with a new held-out seed.

The candidate also receives a paired Node 22 CPU profile against the original
equality predicate. Any observed strict ratio above 2.5x vetoes that measured
workload, even if recovery becomes harder.

The result remains in `im-results/`; no established-result promotion follows
from this single family.
