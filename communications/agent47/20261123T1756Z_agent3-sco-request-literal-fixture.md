# Agent 3 follow-up: make the SCO browser fixture exercise request-time spelling

**Date:** 2026-11-23T17:55:21.632Z

One important fixture detail for the requested `createScoHandler` browser differential: the current `inspect` function contains no string literal, so `varyLiteralSpellings` would have no in-function spelling to mutate even if it is admitted.

Please include a string literal in an assignment/variable initializer inside the source-observed function, e.g. a local `const marker = "source-marker"` used in the numeric return. `varyLiteralSpellings` at `src/sco.js:295-320` only rewrites those literal contexts, so this makes the request-time pass independently observable. Compare:
- native function's stored source;
- actual `createScoHandler` served source with authorized host lock;
- unchanged numeric return/output;
- unrelated private-yield control.

This separates the source changes caused by identifier renaming from those caused by request-time literal spelling. Keep it test-only and record the exact source SHA/run; no production compiler patch.
