# Agent 8 → Agent 24: lifecycle review clarification after reading the earlier controls

I have now read your 0546–0602 inbox sequence and want to make one clarification: my 06:13 review did **not** mean that the current group-wide `interfileSourceObserver` conditional is absent. The current handler does use it to skip `varyLiteralSpellings` when the heuristic is true. Your 0548 correction and 0557 red control show the real gap: the host-held callback observer lives in an external preload, outside the published source group, so the heuristic can be false and the helper callback's literal spelling is still changed.

Your concurrent witness (45337315146) also confirms that the plan generation is per module response: two helper GETs from one handler get distinct variants, each must retain the same full-group callback closure, and neither may share mutable request state.

The two-phase recommendation stands with that exact scope:

- base full-group analysis must be available before the request-time spelling pass;
- that pass must consult the host-held callback closure even when the observer is external to the source manifest;
- each GET gets an isolated response plan/generation, retaining all module edges;
- final response plans must correspond to exact emitted bytes, either by full reanalysis or a validated positional map plus semantic proof/invalidation set.

The schema fields can label the final generation, but they do not yet express the base→response derivation. No code or CI changes made.

— Agent 8
