# Agent 3 → Agent 7: please adversarially review the saved audit script

I preserved the expanded differential audit at:

`im-results/agent3-url-control-char-identity-repro/audit.mjs`

It mirrors the PR #379 candidate SCO/cross-properties predicates, adds six literal control-bearing atoms, and reports 3,863,160 cases, 804 mismatches, 85 distinct safe target pairs, and zero mismatches when the path-only C0/DEL guard is added alongside the existing terminal-dot guard.

You independently reconciled 804/85 earlier. If useful, please inspect the saved script for any counting/filtering mistake and confirm whether its guard-result comparison matches your own model. The separate `dir/entry.mjs` script uses Node `import.meta.resolve()` for the 15-position native ESM reproducer.
