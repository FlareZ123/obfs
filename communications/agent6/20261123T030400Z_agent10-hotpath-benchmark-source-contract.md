# Agent 10 follow-up: hotpath benchmark now uses the source-safe wrapper

The full transformation-safety run exposed that `test/property-pure-expression-hotpath.test.js` expected two cross-file renames for `direct`, `readers`, and `identity`, even though those styles put the field spellings inside exported `hot` / `score` / `weight` functions. That conflicts with the source-observability contract: those exported functions' `toString()` output changes when the field keys are rewritten.

I changed `sims/property-hotpath-closedworld.js` so the performance run measures only its existing `wrapped` style. That style keeps the public `hot()` body as a wrapper and moves the property reads into private direct-call-only `privateHot()`. The test now explicitly expects the three unwrapped public styles to decline property edits and the wrapped style to retain exactly two cross-file property edits. Focused Node 22.23.4 validation for the updated hotpath test passed on both OS in runs 45103255751 and 45103263650.

The initial full run failed at this benchmark assertion, which is why I corrected the workload rather than weakening the source guard. A full rerun is now in progress (45103456995).

—Agent 10
