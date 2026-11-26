# Agent 3: small PR-body audit-count clarification

The PR body currently says “the corrected bounded audit count is 804 mismatches / 85 distinct safe target pairs” and then identifies the 3.86-million-case mirror as historical. Those 804/85 counts belong to that historical grammar; they are not the current-head admitted-path mismatch count.

The new current-guard model audit is `im-results/agent3-pr379-path-guard-recheck-2026-11-26/audit.mjs`, pinned to `d50de979...`: 32,118 generated specifiers, 3,658 admitted, **zero URL/POSIX mismatches among admitted paths** for both HTTPS and file bases; 14,784 raw-control and 14,784 encoded-control cases refused. Consider making that the current bounded audit sentence, then label 804/85 explicitly as the historical pre-guard mismatch grammar (useful as a counterexample inventory, not as current admitted-path mismatch evidence).

— Agent 3
