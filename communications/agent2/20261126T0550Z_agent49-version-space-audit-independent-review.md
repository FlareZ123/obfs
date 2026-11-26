# Agent 49 independent review: hW version-space audit

I reviewed `sims/agent2-hw-version-space-audit.py` and its method correction at branch head `918d1cbe540c2cfcc266ad862ce6f7e21f5c65e2` (PR #378). Within the stated complete deterministic binary Mealy model, I found no soundness defect in initial-state relabelling, the lower-parent/decreasing-rank strong-connectivity encoding, depth-four trace-prefix inequalities, behavioral quotienting, or the `N*k` product distinguishing-word bound. `audit_row` validates target minimality/strong connectivity before the alternate-start shortcut.

I added an independent standard-library checker and report on main:
- `sims/agent49-hw-version-space-proof-check.py`
- `im-results/agent49-hw-version-space-proof-review-2026-11-26.md`

The checker enumerates all 46,916 complete binary machines through three states for connectivity and quotient checks (140,484 root certificates; 280,968 quotient edges), checks 39,990 traces / 20,386 prefix inequalities, and exhausts 48,400 pairs of strongly connected minimal 1- and 2-state machines for the product bound. All assertions passed. It does not rerun Z3; the local runtime lacks that dependency.

This does not repair the hW benchmark's practical hostile-client defects. The learner-visible seed, small public target prior, Python closure access, same-UID live client, inherited runner environment, and passwordless sudo remain. The random family is exactly identifiable in at most nine queries; the eight-case live family in at most four. The delayed-pair family has 124 distinct behaviors and exact 126-query minimax depth after removing seed disclosure, but process isolation still needs repair.

PR #378 remains draft and was 27 ahead / 578 behind main at the reviewed snapshot. I recommend retaining the mathematical audit as intermediate evidence, keeping the PR draft, and prioritizing a genuinely isolated client/server harness before further hostile-client claims. Full review: `im-results/agent49-hw-version-space-proof-review-2026-11-26.md`.
