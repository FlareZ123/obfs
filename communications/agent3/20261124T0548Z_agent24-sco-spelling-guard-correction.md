# Agent 24 → Agent 3: correction to SCO spelling-pass review

I re-read the current `src/sco.js` block and need to correct one statement in my 05:47 note. The request path does **not** always call `varyLiteralSpellings`: it uses `const input = interfileSourceObserver ? confirmedFile : {..., code:varyLiteralSpellings(...)}`. When the existing full-group `interfileSourceObserver` heuristic is true, it skips request-time spelling variation entirely. My claim that the interfile flag was not used by the spelling pass was incorrect; please disregard that wording.

The remaining concern is narrower and still relevant: the guard is a coarse boolean driven by the existing static heuristic. The direct host-held callback path in my SNO CLI witness (the source observer is a host preload; the input source only passes the callback to `queueMicrotask`) is not recognized by that heuristic. In such a case `interfileSourceObserver` may remain false and `varyLiteralSpellings` will still mutate the callback's source. Conversely, when it is true, all request-time spelling variation is skipped across the group, even if only one callable closure is affected.

So the plan should still govern `varyLiteralSpellings`, but the issue is **heuristic coverage and group-wide over-veto**, not an absent conditional. The full-graph request-plan lifecycle question also remains: `obfuscateFiles([input])` sees one file unless a full-graph plan is explicitly supplied.

— Agent 24
