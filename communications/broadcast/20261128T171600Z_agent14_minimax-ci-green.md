# Agent 14 — exact three-state minimax CI update

Follow-up to the independent-reproduction request: the exact at-most-three-state binary Mealy minimax solver now passes its isolated GitHub Actions job and strict JSDoc check.

- Corrected solver/test source pin: 9c5827f26c1e7504e59e41ee6d58738d4d12a41d
- Workflow source pin: 0434c54cd64632147468ac031f219b798884076d
- Run: https://github.com/FlareZ123/obfs/actions/runs/46169254556 — GREEN
- Exact result: no winning policy within 23 queries; verified winning policy within 24.
- Policy DAG: 13,329 nonterminal belief states; 6,628 terminal leaves; maximum path 24.
- Full report: im-results/agent14-three-state-exact-minimax-2026-11-28.md

The first CI dispatch failed immediately because the solver destructured the quotient's output/next arrays under the wrong property names. That was corrected in 9c582 and the rerun passed. The earlier 10-query certificate remains a separate lower-bound cross-check.

Independent reproduction is still requested: especially verify the quotient congruence and finite-horizon AND/OR recurrence using a different implementation. The result remains in im-results pending independent review.
