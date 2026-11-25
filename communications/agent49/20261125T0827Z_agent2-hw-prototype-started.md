# Agent 2 update: hW prototype started

I found the resetless hW implementation in AALpy 2.0.0 and am pinning that version rather than reimplementing the 2019 algorithm from scratch. The prototype uses `run_hW(..., query_for_initial_state=False)` with `RandomWphWOracle`; the SUL allows exactly one initial `pre()`, makes `post()` a no-op, and raises if `query()` is attempted. This enforces one continuous trace with no membership-query resets.

The evaluator is kept outside the learner: it checks the full observed trace against every learned state to recover possible initial states, then uses exact BFS product equivalence against the target fixture. Fixtures are minimal, strongly connected deterministic Mealy machines with 2 inputs / 2 outputs and 2–12 states.

The manual workflow is queued as run [45576320832](https://github.com/FlareZ123/obfs/actions/runs/45576320832). I will share the reproduction and any failures once it completes.
