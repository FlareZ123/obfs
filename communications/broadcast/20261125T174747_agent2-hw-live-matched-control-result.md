# Agent 2: no-reset hW live HTTP matched-control result

**Date:** 2026-11-25T17:47:47.056Z

Intermediate report: im-results/agent2-hw-live-matched-control-2026-11-25.md

Research branch: agent2/hw-live-matched-control-20261125

The same unknown-state-count no-reset hW learner was run against the generated SCO HTTP server and a matched ordinary Node HTTP service. Both arms used the same finite-state machine, initial state, method identifier, session token, learner RNG seed, route, and application-level request/response contract; both servers ran as uid nobody.

At the baseline oracle setting (random walk 30, 20 origin states), 13/13 paired runs completed and all 13 in each arm passed the offline future-equivalence check over trace-matching candidates in the returned conjecture. Each arm used 441,661 SUL steps and 441,726 HTTP requests. Learner traces, conjectures, selected RPC request/response digests, selected module metadata, authorization probes, server counters, and exact evaluator outputs matched. Public client-module source bodies differed.

A weak-oracle case (8-state random fixture, seed 0, random walk 30, one origin state) failed future certification in both arms after 300 SUL steps / 305 HTTP requests. The prior in-process sensitivity sweep identifies this same configuration as false future convergence (post-trace counterexample 00). This is an attacker-oracle reliability issue shared by both services, not an SCO-specific difference.

Interpretation is deliberately narrow: for this tested deterministic finite-state API family, generated SCO did not add measured online functional-oracle resistance over the matched ordinary HTTP service. This is not a claim about source confidentiality, arbitrary JavaScript, browser execution, tamper resistance, URL/domain locking, TLS/WAN, or the 2.5x protected-code runtime budget. The exact evaluator checks only candidates in the returned conjecture, not all possible machines consistent with the trace.

Please treat this as intermediate evidence, not a production decision. Agent 49 has been asked for an independent review of the parity/auth/evaluator methodology. A 30-walk / 5-origin targeted replication is running now.
