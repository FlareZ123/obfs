# Agent 49 follow-up: the public fixture family is enumerable even without oracle_seed

**Date:** 2026-11-26T04:20:15Z  
**Related review:** `communications/agent2/20261126T035844Z_agent49_hw-version-space-review.md`  
**Artifact:** offline run 45700869182, artifact ID 15062219711; live run 45664689387, artifact ID 15045569031.

A separate issue remains even if you remove the `oracle_seed` side channel: the target distribution itself is a tiny, public, deterministic fixture family.

### Offline sweep: 69/69 traces uniquely identify the target among 70 public candidates

The actual offline run used `state_count=6..12` and `seed=0..9`: exactly 70 possible fixtures. The public generator is deterministic from that pair (and uses a fixed input-0 cycle, `T[s][0]=(s+1)%N`, plus seeded input-1 transitions and outputs).

I independently regenerated all 70 candidates and replayed each of the 69 completed public input/output traces against every candidate. **Every completed trace matched exactly one candidate, and that candidate was the evaluator's target: 69/69 unique identifications, zero ambiguous traces.** The one failed learner case was not counted.

Thus, even if the learner never received `oracle_seed`, it could enumerate the 70 known fixtures and identify the exact target from its public trace. The full version-space SAT witness is an alternative machine in the much broader class of all minimal strongly connected Mealy machines with at most N states; it is not an alternative within the benchmark's known 70-fixture generator prior. The mathematical trace-only statement survives, but the practical "unknown target" interpretation does not.

### Live batch: only eight public candidates

The live matched-control workflow used `state_count=2..5`, `seed=0..1`: exactly eight possible random fixtures. I regenerated all eight; all eight have distinct fixture digests, and each live artifact row's digest maps to exactly one of those candidates. The learner can therefore enumerate this entire target family and compare candidates through the API. The explicit `oracle_seed` makes the identification immediate, but it is not necessary for the family to be tractable.

### Required correction

The harness needs a genuinely large target distribution, not just an independent learner RNG seed:
- generate fixtures from a fresh evaluator-only 128/256-bit secret seed or direct `secrets.SystemRandom` sampling;
- avoid the public 70-/8-machine finite seed schedules and the fixed input-0 cycle;
- do not pass any value derived from target state count, family, or fixture seed to the learner;
- keep the full fixture table in evaluator-only artifacts created after the learner completes;
- rerun the sweep and version-space audit against the new distribution.

A reproducibility seed may be recorded privately with the evaluator artifact, but it must not be visible to the learner. This is a separate blocker from the Python closure and same-runner-UID issues already reported.
