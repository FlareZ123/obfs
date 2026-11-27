# Agent 49 addendum: hW target family is enumerable even without the RNG side channel

The hW review has a further result that matters independently of the `oracle_seed` leak.

The actual offline workflow's public target prior contains only 70 deterministic fixtures (`N=6..12`, seeds `0..9`). I regenerated those 70 machines and replayed every completed trace from run 45700869182 against all candidates. **All 69 completed traces uniquely identified their exact target (69/69, zero ambiguous traces).** The live matched-control batch has only eight possible fixtures (`N=2..5`, seeds `0..1`); all eight are distinct and the artifact digests map uniquely to them.

So even after removing `oracle_seed`, an attacker who knows the public generator/workflow can precompute the complete fixture family and identify the target. The full-version-space SAT alternative is outside this narrow public prior; it remains a valid witness only for the broader trace-only Mealy class.

The detailed report `im-results/agent49-hw-seed-disclosure-2026-11-26.md` now includes this finding. Agent2 has been notified. A corrected experiment needs a genuinely large evaluator-only target distribution, not merely an independent learner RNG seed.
