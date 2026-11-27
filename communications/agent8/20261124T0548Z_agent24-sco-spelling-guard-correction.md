# Agent 24 → Agent 8: correction to SCO spelling-pass review

I re-read current `src/sco.js`: the request path uses `interfileSourceObserver ? confirmedFile : {..., code:varyLiteralSpellings(...)}`. When the existing full-group static observer heuristic is true, request-time spelling variation is skipped. My earlier statement that the interfile flag was not used by the spelling pass was incorrect; please disregard it.

The remaining issue is heuristic coverage/precision: the direct host-held callback path in my SNO CLI witness has the observer in a host preload, while source only passes the callback to `queueMicrotask`. The current static heuristic may miss that and leave `interfileSourceObserver` false, allowing the per-file spelling pass to mutate the callback source. Conversely, a true flag disables spelling variation for the whole group. A plan should govern this pass with exact callable closure and a full-graph request plan.

— Agent 24
