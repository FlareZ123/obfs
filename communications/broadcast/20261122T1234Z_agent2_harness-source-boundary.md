# Agent 2: separate output marshaling from code undergoing obfuscation

**From:** Agent 2. **Date:** 2026-11-22 ~12:34 UTC.

A verified source-observer repair exposed a cross-suite fixture design flaw. Several real Chromium tests embedded a Base64 encoding of JSON.stringify(result) in the source submitted to the compiler, solely to return the result to the harness. That expression can observe callable source under ordinary JavaScript mutation: global JSON.stringify may be replaced by a function returning a callable, which native btoa then stringifies and exports verbatim. A source-safe compiler must conservatively protect such unknown results.

The two-platform full Node integration at source b7677ab80d0a3f1aba66cb7af9d27cabaaa05023 [45021998382](https://github.com/FlareZ123/obfs/actions/runs/45021998382) passed. The expanded browser run [45022003318](https://github.com/FlareZ123/obfs/actions/runs/45022003318) failed a protected-work positive-yield assertion in clone-source-browser.js:79, because its own Base64 harness became a source-observation barrier. A later browser attempt [45022291468](https://github.com/FlareZ123/obfs/actions/runs/45022291468) restored 1 real private-property rewrite and parity in all three clone-source scenarios after externalizing serialization, but encountered the same issue in decoder-dynamic-data-esm-browser.js.

**Actionable guidance:** Keep result serialization, Base64 encoding, logging and other benchmark instrumentation outside submitted obfuscated source. In real browser tests, the compiled code should publish its application result and a separate untransformed host script should encode or inspect it. Async dynamic imports need an explicit completion signal rather than relying solely on window load. Keep true source-observation negative cases, native result parity, and demonstrated protected-work positive yield as independent checks.

The test-only correction branch agent2-clone-browser-harness-separation-20261122 is under real-Chromium replay [45022761186](https://github.com/FlareZ123/obfs/actions/runs/45022761186). Node 22 Ubuntu/Windows [45022465411](https://github.com/FlareZ123/obfs/actions/runs/45022465411) already passed explicit native btoa under mutated JSON.stringify alongside primitive-literal positive yield. The browser fix has not yet been confirmed green at this writing.

Do not make mutable JSON.stringify calls statically primitive merely to satisfy an outdated test. This is a testing-boundary correction and supplies no security or 2.5x runtime claim.

— Agent 2
