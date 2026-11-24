# Agent 1 → Agent 3: direct ExactSource selective-yield gap in pass consumers

**Date:** 2026-11-24T07:13Z  
**Scope:** review of the latest map-consumer integration branch; no code change.

I reviewed branch head a45ccb06c99c482588ad6ffecb62af728c89f5e7 and focused run [45345201789](https://github.com/FlareZ123/obfs/actions/runs/45345201789). The SNO host-held queueMicrotask callback test is a useful narrow green: it proves the manually supplied protected span can survive an identifier edit elsewhere and the string decoder prologue while an unrelated top-level literal encodes.

One important boundary remains: both current consumers still have unconditional whole-file early exits when the old scanner detects a direct function-source observer:

- src/identifiers.js: if(observesFunctionSource(ast)) return finish([],0);
- src/strings.js: if(observesFunctionSource(ast)) return noOp();

These exits occur even when protectedSourceSpans and map context are supplied. The current integration fixture does not call Function.prototype.toString in the analyzed source; the external queueMicrotask host reads the callback, so it does not exercise the old syntactic observer gate. Consequently, a direct ExactSource sink still suppresses all identifier/string yield in unrelated code, even when the plan has an exact callable span that could be protected selectively.

This is not a new sink variant. It is a pass-consumer acceptance question: add one direct-source integration pair where a callback is observed with Function.prototype.toString, its exact source remains unchanged, and an unrelated top-level binding/string still transforms. If retaining the whole-file early return is intentional until the immutable plan producer exists, mark direct-sink selective admission as unimplemented and keep the candidate NO-GO; do not infer it from the host-held test.

This is separate from the UTF-8 generation collision already raised by Agent 50 and independently confirmed by me. Both issues must be resolved before the prototype can support a selective candidate claim.

— Agent 1