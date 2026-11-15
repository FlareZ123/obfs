# Immutable local identity wrappers: verified private-key coverage and attack cost

Date: 2026-11-15. Author: Agent 15. Status: intermediate engineering evidence, with independently executable tests. No academically established reconstruction-resistance result is claimed.

## Change and exact artifacts

The existing Acorn property analyzer in `src/properties.js` recognized a single-return function declaration and imported pure identities, but did not recognize the equivalent immutable local arrow or function-expression binding. It now summarizes `const f=x=>x`, block-body arrow identities, anonymous function expressions and named function expressions whose parameters are plain identifiers, the helper is synchronous, and the only returned value is one parameter. Its existing escape, call-site, lexical-containment and source-observation checks remain in force. Unsupported wrappers continue to decline.

A new `test/local-identity-wrapper.test.js` checks six proven wrappers, including the pre-existing function-declaration control, against both COO and SNO. In every accepted fixture the source has two private fields in one literal owner, the analyzer reports one owner and two renamed keys, and VM execution matches native execution. Seven refusal scenarios include an async wrapper, an observing side effect, an unsupported default parameter, a mutable helper, a callback escape, an exported function and a mixed-receiver call graph. All of these leave the candidate owner unchanged. The test deliberately compares actual runtime outputs.

For accepted fixtures, the independent `sims/offline-normalize.js` attacker consumes only emitted JavaScript. It relabels both ten-hex-digit private-key names in each transformed artifact, without knowing the source key spellings. Each normalized fixture still matches native execution. This demonstrates **12/12 private-key labels per mode were structurally recognizable** across the six accepted fixtures, counting the pre-existing function-declaration control. It demonstrates syntactic label removal, not recovery of original variable names, function meaning or arbitrary program semantics.

Linux/Windows focused semantics and JSDoc check: [run 43709847473](https://github.com/FlareZ123/obfs/actions/runs/43709847473), source SHA `33e533f91761f07957e54cf083290013952b465c`. Both jobs passed. Earlier version without the added attacker assertion passed [run 43709717253](https://github.com/FlareZ123/obfs/actions/runs/43709717253) at `d809f02e07c837e77d14721114b7755d9f113971`. Both runs used the repository's manual-only transformation safety workflow.

## Dedicated hot-path samples

The existing `sims/hotpath-mixed.js` now contains two warm SNO million-iteration mutation loops that exercise the local identity summaries. Both assert two renamed properties and compare native and transformed return values. Ubuntu GitHub Actions [run 43709949069](https://github.com/FlareZ123/obfs/actions/runs/43709949069), exact source SHA `100096a728d4197f4260b716514051e914f4e729`, passed the full manual cold-start script and benchmark suite on Node 22.

| Wrapper | Native median (ms) | Obfuscated median (ms) | Measured ratio | Renamed keys |
| --- | ---: | ---: | ---: | ---: |
| `const f=x=>x` | 1.414788 | 1.431309 | **1.01168×** | 2 |
| `const f=function(x){return x;}` | 1.420208 | 1.451176 | **1.02181×** | 2 |

These are 15 alternating after-warmup samples per workload; code is compiled once, SNO initialization is excluded as permitted in the threat model. Their small elapsed times make scheduler and JIT noise material. Both sample ratios are below the 2.5× hot-work requirement. This is no bound for cold COO startup or arbitrary workloads, and no measured security advantage over ordinary string/name transforms.

## Interpretation and follow-ups

The change extends safe proof coverage for an everyday source shape without introducing extra bytecode dispatch into hot code. Its independently exercised static attacker also removes every new hash label, so **coverage improved while resistance against this attacker did not**. Do not describe this as anti-instrumentation or tamper resistance.

The next meaningful evaluation is a held-out multi-file corpus using local wrappers, callbacks, live browser imports and dynamic observer refusals. Compare against the same source-only normalization attack and a runtime instrumenter, then measure end-to-end application speed in COO and SNO. Guard against overgeneralizing from the controlled million-iteration loops.
