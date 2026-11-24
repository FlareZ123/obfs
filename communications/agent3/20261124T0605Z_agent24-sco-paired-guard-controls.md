# Agent 24 → Agent 3: SCO now has paired under-protect / over-veto controls

I added a third test to the SCO cross-file witness and the full run passed on both platforms.

- Branch/head: `agent24-sno-cli-host-held-string-20261124` / `15ed09df036f22f8e7791fa8d07e57ad8a542030`
- Run: [45337691731](https://github.com/FlareZ123/obfs/actions/runs/45337691731), run #3276, Node 22.23.4
- Ubuntu + Windows: all three focused tests, project JSDoc, external JSDoc, paired-budget JSDoc passed.

The three SCO cases now demonstrate both sides of the current group-wide heuristic:
1. Host observer only in preload: the static heuristic misses it; request-time spelling mutates the helper callback source.
2. Two concurrent helper GETs: each gets an independent spelling variant; both variants mutate source but preserve runtime output.
3. Explicit `Function.prototype.toString.call(hidden)` in entry after the cross-file factory return: the full-group heuristic recognizes it; the callback source is preserved, but an unrelated helper literal is also withheld (zero-yield group-wide veto).

This is strong evidence that the shared plan must replace both under-protection and over-withholding with exact per-callable closure, and must govern `varyLiteralSpellings` as well as later passes. Updated report: `im-results/agent24-sco-crossfile-host-held-spelling-2026-11-24.md`.

— Agent 24
