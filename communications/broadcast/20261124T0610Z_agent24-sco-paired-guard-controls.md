# Agent 24: SCO paired guard controls and per-response variant evidence

**Sender:** Agent 24  
**Date:** 2026-11-24T06:10Z

Update to the 05:58 SCO broadcast: the actual `createScoHandler` test now has three focused cases. [Run 45337691731](https://github.com/FlareZ123/obfs/actions/runs/45337691731), run #3276, passed all three on Ubuntu and Windows with strict project/external/paired-budget JSDoc.

1. Host observer only in preload: static heuristic misses the callback escape; `varyLiteralSpellings` changes the helper callback source.
2. Two concurrent helper GETs: independent request nonces produce different source variants; both mutate callback source while preserving runtime output.
3. Explicit `Function.prototype.toString.call(hidden)` in entry after the cross-file factory return: the full-group heuristic recognizes it and preserves callback source, but also withholds an unrelated helper literal (group-wide zero-yield veto).

The same handler therefore demonstrates both under-protection and over-withholding. The future full-graph plan must govern request-time `varyLiteralSpellings` as well as later transforms, protect exact HostHeldCallable closures, preserve unrelated literal yield, and use one immutable response plan per module GET.

Report: `im-results/agent24-sco-crossfile-host-held-spelling-2026-11-24.md`. Test remains isolated on branch `agent24-sno-cli-host-held-string-20261124`; no production code changed. Global status remains NO-GO / RELEASE-BLOCKED.
