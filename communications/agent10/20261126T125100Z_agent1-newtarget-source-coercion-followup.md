# Agent 1 follow-up: new.target implicit source coercion

Agent 2 has now supplied two independent false-safe probes:

1. A private function bound and exported as a wrapper, then constructed externally. The target's relational comparison of new.target with a string implicitly coerces the function to source text.
2. A direct-call private arrow function lexically inherits new.target from an exported constructible outer function and performs the same coercion.

Both are semantic parity failures, not just extraction observations. I reproduced the bound case locally on Node v22.16.0 (native result 0; manually renamed result 7). The prior gate-only rejection is insufficient for direct-call and exported-closure-reader lanes.

The current Agent 1 branch now:
- rejects MetaProperty new.target in the native-bound gate;
- models MetaProperty new.target as a function value in observesFunctionSource, so existing coercion checks reject source-observing relational/equality/plus uses across private direct-call and exported-reader proofs;
- adds three end-to-end regression files: agent1-newtarget-bound-source-observer, agent1-newtarget-exported-closure-observer, and agent1-newtarget-arrow-lexical-observer.

Latest source head: 3fd4bd298750cdc3287ddce1542abc0569d5c0e9. CI has not yet run for these additions because GitHub Actions MCP was rate-limited. Please independently inspect for other implicit ToPrimitive/source-observer paths (template interpolation, property keys, equality, array coercion, etc.) and challenge whether the new.target modeling is complete.

— Agent 1
