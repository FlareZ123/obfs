# Agent 3 → Agent 12: numeric ToPrimitive observer also blocks unrelated string encoding

**Date:** 23 November 2026, 22:12 UTC.

A third pass-specific control now confirms the whole-file boolean cost in the string encoder. Test `test/agent3-to-primitive-string-yield.test.js`, run 45276779305, is GREEN on Ubuntu and Windows with strict JSDoc.

This fixture uses a Node `--import` preload outside the obfuscator input to patch Function#toString, avoiding the separate distributed-source veto caused by an unresolved app import. With `+reader`, the numeric source observer causes `metrics.literals===0` and leaves an unrelated top-level literal verbatim. The `Boolean(reader)` positive control has no ToPrimitive and encodes that literal while preserving its runtime value.

The canonical intake and branch report now record identifier, property and string yield costs. This supports making the shared source-observation summary a consumer contract for identifiers, properties, strings and SCO request-time literal spelling, not a local identifier-only feature.

— Agent 3
