# Native Document constructor mutation: source preservation and nonvacuous yield

**Date:** 2026-11-28 UTC  
**Agent:** Agent 1  
**Status:** bounded V2 experimental compatibility result; **not** strong-obfuscation or release acceptance

## Problem and original defect

A browser `Element.append`/similar DOM insertion accepts a Node or a DOMString. A genuine Node is inserted without stringification, whereas a callable value enters DOMString conversion and can reveal that function's exact source text. The V2 source-observer exception admitted `const element=document.createElement("script");document.head.append(element)` as a native-Node path. This assumption fails when another script mutates the ambient native factory through `globalThis.Document.prototype.createElement`, constructor aliases, `document.constructor`, or reflected prototype derivation.

The pre-fix `src/ast.js` `hasNativeDocumentFactoryMutation` scanner recognized `Document.prototype` as a bare identifier but did not follow globals or their aliases. It returned `false` for a valid sibling replacement and `obfuscateFiles` then rewrote an independent client's source despite observable DOMString function source. This is **semantic divergence** with a definite real-browser witness; do not conflate it with ordinary source obfuscation.

## Exact red-first evidence

- Baseline code head `67f2d5bc1eee67016916b43e564014e570335845`, red-first test commit `7c3a0a43ac66ad8cc9b1dae73d0ffd867f1f4649`, path `test/agent1-dom-global-constructor-prototype-mutation.test.js`.
- [Focused run 46154682032](https://github.com/FlareZ123/obfs/actions/runs/46154682032), Ubuntu/Windows/macOS, 4 scoped tests, **2 failed / 2 passed** on each OS. It failed both the scanner predicate and cross-file source-byte preservation for `globalThis.Document.prototype.createElement` mutation, in COO/SCO/SNO compilation.
- An independent test-only Chromium baseline `b4805f7e2d9800e7e066b7d000fa530403491c55`, [run 46155170271](https://github.com/FlareZ123/obfs/actions/runs/46155170271) (Ubuntu), executed native and emitted browser source. **Native observed function text length 111, emitted observed function text length 79, parity false**, at `global-constructor/coo`. The assertion is on the actual text, not a Boolean `hasOriginal` flag.
- The browser comparator was adjusted to run far enough on the intentionally broken baseline rather than fail prematurely on expected compiler output. This comparator is not a production fix.

## Corrected bounded scanner

- Fix commit `5bdd8b2fd102d177475173b8b6c5f2c8dece22e1` extends `hasNativeDocumentFactoryMutation` with a bounded constructor/prototype alias graph. It observes direct `globalThis.Document`/`window.Document`, `document.constructor`, local constructor/prototype aliases, direct `Object.getPrototypeOf(document)`, and bounded `__proto__` parent paths. Unknown computed keys on the proven mutable native document/prototype remain vetoes; read-only/unrelated fields are positive controls.
- [Focused run 46154744676](https://github.com/FlareZ123/obfs/actions/runs/46154744676) at exact fix SHA, **green** Ubuntu/Windows/macOS including strict project JSDoc.
- Full browser/test workflow head `2d1ff1fe9c6a869afc05d53c82ece800d08e0869` (workflow Chrome executable path repair), [run 46154994628](https://github.com/FlareZ123/obfs/actions/runs/46154994628), **green** Ubuntu/Windows. Real Chrome evaluated **15 native/emitted cases**: four known factory mutation spellings and a genuine unmodified-native positive control for each of COO/SCO/SNO. All 12 mutable cases preserved length-111 callable source exactly; 3 untouched cases retained actual encoded `client.js` string output and native execution parity.
- The evidence is conditional on the observed Chromium/native methods and the finite tested source graph. It does not establish hostile browser preloader integrity or universal JavaScript AST analysis.

## Whole-suite acceptance boundary

The corrected branch's [full Node run 46155198938](https://github.com/FlareZ123/obfs/actions/runs/46155198938) at exact head `2d1ff1fe9c6a869afc05d53c82ece800d08e0869` was **RED on both platforms**:
- Ubuntu: 5,946 tests, 5,893 passed / 27 failed / 26 skipped.
- Windows: 5,946 tests, 5,879 passed / 27 failed / 40 skipped.

The 27 visible failures include many CFG/WeakMap-property **missing positive rewrite yields**, DOM native collection/ESM primitive producer positive assertions, and a separate browser test process error. Do not report them all as source-parity mismatches: several CFG assertions explicitly report source parity true but zero renamed bindings. One directly adjacent failure is `test/html-asset-disclosure.test.js:681` where an imported native DOM script factory suppresses an ordinary no-SRI client rewrite. The first scanner fix does **not** address that independent false positive. Separate `agent1/v2-imported-native-dom-factory-proof-20261128` donor investigates a narrow native ESM factory path with its own red-first, negative, Chrome and positive-yield controls; this report does not promote that WIP.

## Security-performance decision

| Dimension | Evidence from this experiment | Decision |
|---|---|---|
| Functional behavior | One pre-fix real Chromium mismatch; 15 corrected Chromium comparisons plus 3-OS focused suite | Bounded compatibility repair |
| Output protection yield | Three native positive controls still encode strings; unreviewed imported factory path remains unresolved on this head | Narrow positive, broad incomplete |
| Static reconstruction | No attacker cost or equal-trust minifier experiment on this patch | Unmeasured |
| Dynamic extraction / tamper resistance | Native Function#toString source-observer semantics tested; hostile preload attacks remain possible | No security advancement established |
| Host locking | Not validated by this focused test | Unknown |
| ≤2.5× repeated compute | Not measured for this patch | Unknown |
| Full cross-platform acceptance | 27 failures on both platforms | **NO-GO** |

See the repo `results/README.md` for the authoritative current **release-blocked** synthesis. This intermediate report must not be promoted as a solved obfuscator, theorem, or production release candidate.
