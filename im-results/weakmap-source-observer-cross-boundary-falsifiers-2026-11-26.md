# WeakMap source-observer cross-boundary falsifiers

**Date:** 2026-11-26  
**Classification:** Intermediate reproducible evidence; not an academically established result.  
**Candidate source SHA:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`  
**Test-only branch:** `agent1/weakmap-exported-container-review-20261126`  
**Test-only branch head:** `2b9bc8979602ec58e4929ad2dffc128b2634d54f`  
**Test file:** `test/agent7-weakmap-source-observer-falsifiers.test.js`  
**Test file blob:** `4a73bf80b3f558cfa0810fa3db02b65144929f76`  
**Integrated focused CI:** [45896098153](https://github.com/FlareZ123/obfs/actions/runs/45896098153)

## Executive finding

The frozen candidate has **six independently constructed end-to-end source-capture false-safes** in its WeakMap prototype exposure guard. Every case reproduces in COO, SNO, and SCO on Ubuntu, Windows, and macOS. The focused workflow fails because the tests intentionally assert that these transformations must be refused.

The production source was not changed during this investigation. The test-only branch preserves the exact candidate source blobs:

- `src/ast.js`: `b1a14066074b35a731c13bea62a723b58d998fc3`
- `src/core.js`: `de1aa462ec7fb5202724b6f3bf0eb9b916dc8d24`

The test-only contribution is on the candidate owner's existing branch; no new branch or workflow was created.

## Reproduction method

The harness creates a Storage observer module with a private `inspect` function. It stores that function in a WeakMap through a Storage prototype override. Before the Storage module initializes its captured WeakMap, an attacker-side runner obtains or shares the native WeakMap prototype and patches `WeakMap.prototype.set` to write the function value into `document.title`.

The harness runs both original and obfuscated files, then compares:

1. Application return values.
2. The captured `Function#toString` source.
3. The Storage identifier-binding rewrite metric.

The false-safes preserve application return values but change the captured function source. This demonstrates why ordinary behavioral-equivalence tests alone do not validate the source-observer guard.

## End-to-end false-safes

All six cases below are in `test/agent7-weakmap-source-observer-falsifiers.test.js`. All were reproduced in all three modes and on all three CI operating systems in run 45896098153.

| Test location | Boundary | Reproduction |
|---|---|---|
| Line 836 | Classic scripts / shared realm | Script A declares `let carrier = new WeakMap()`; Script B reads `Object.getPrototypeOf(carrier)` and patches the native prototype. The per-file analyses miss the cross-script lexical binding. |
| Line 292 | ESM export / derived class | Producer exports `class Derived extends globalThis.WeakMap {}`; an external consumer imports it, obtains `Object.getPrototypeOf(Derived.prototype)`, and patches the native prototype before loading the Storage observer. |
| Line 543 | CommonJS export / derived class | Producer uses `module.exports = class Derived extends globalThis.WeakMap {}`; an external consumer requires it and patches the native parent prototype. |
| Line 642 | CommonJS export / factory | Producer uses `module.exports = function make(){ return new WeakMap(); }`; an external consumer calls the factory and patches the returned instance's native prototype. |
| Line 445 | Unresolved external ESM factory | A supplied module imports `make` from bare package `opaque-runtime`, which exists at runtime but is deliberately absent from the obfuscator input. The call result is used to obtain and patch the native prototype. |
| Line 745 | Unresolved external CommonJS factory | A supplied module calls `require('opaque-runtime').make()`; the runtime package is present but absent from the obfuscator input. The returned WeakMap prototype is patched before the Storage module loads. |

For the first four scenarios, the Storage metrics report four binding rewrites per mode. In every scenario, the captured `inspect` source changes to generated local identifiers while the application return values remain equal. The two external-package scenarios also show the changed captured source in the focused CI logs; their failure assertions preserve the metrics and runtime outputs.

The external-consumer and external-package runners are deliberately not part of the obfuscator input. This models public exports and runtime dependencies that the supplied source group cannot assume are inaccessible to a consumer.

## Positive controls and bounded conclusions

The candidate is not uniformly failing all WeakMap analysis.

- **ESM exported factory positive control, line 374:** `export function make(){ return new WeakMap(); }` remains protected when an external consumer calls it and patches the returned instance's native prototype. This confirms that the ESM exported-function return summary is effective for this case.
- **Same-file ESM local-flow fixtures, line 205:** closure capture, catch binding, local class getter, switch fallthrough, labelled block, block shadow, try join, nested class-name collision, `Reflect.get`, computed global constructor key, and conditional class heritage all pass the end-to-end source-sink differential in COO/SNO/SCO.
- The four direct helper assertions at lines 410, 486, 693, and 801 also show `hasWeakMapPrototypeExposure` returning false for exported derived classes and unresolved factory results. Those direct helper failures are distinct from the six end-to-end reproductions.

Do not generalize these findings to every WeakMap path. The within-file ESM cases and ESM exported factory positive control pass. The demonstrated defect is the cross-boundary capability model: classic-script realm sharing, ESM/CJS exported derived constructors, CJS exported factories, and unresolved external factory calls.

## Evidence and provenance

- Integrated focused workflow: [45896098153](https://github.com/FlareZ123/obfs/actions/runs/45896098153), with focused test jobs on Ubuntu, Windows, and macOS. All three fail on the intentional falsifier assertions.
- Earlier incremental runs: [45894202802](https://github.com/FlareZ123/obfs/actions/runs/45894202802), [45894653143](https://github.com/FlareZ123/obfs/actions/runs/45894653143), [45895225173](https://github.com/FlareZ123/obfs/actions/runs/45895225173), [45895468606](https://github.com/FlareZ123/obfs/actions/runs/45895468606), and [45895688079](https://github.com/FlareZ123/obfs/actions/runs/45895688079).
- Candidate full-gate run at the unchanged source SHA: [45888992628](https://github.com/FlareZ123/obfs/actions/runs/45888992628). It was already red before these test-only additions.
- Agent 1's detailed mailbox summary: `communications/agent1/20261126T2110Z_agent7-six-weakmap-false-safes.md`.
- Broadcast summary: `communications/broadcast/20261126T2111Z_agent7-six-weakmap-false-safes.md`.

## Recommended next work

1. Build the group-level graph required by the shared research contract: realm-scoped lexical bindings for classic scripts; module/export/import edges for ESM and CommonJS; and value/function summaries that propagate WeakMap instances, factories, containers, and derived constructors.
2. Treat unresolved imported/required call results as `MaybeWeakMap` when they reach prototype readers. Do not collapse unknown calls to a definite non-WeakMap value.
3. Recognize CommonJS `module.exports` and `exports.foo` as capability escape edges, including returned WeakMap factories and WeakMap-derived classes.
4. Preserve the current same-file ESM positive controls while extending the analysis across source units and module boundaries.
5. Re-run this focused falsifier suite first, then the complete validation gate on the patched candidate. Do not promote the candidate until all six end-to-end cases are refused without breaking the positive controls.

## Limitations

These are Node runtime differential tests using a Document/Storage shim and Node's shared script/ESM/CommonJS runtimes. They are not yet Chromium reproductions of these exact six cases. The existing Chromium validation workflow covers a separate browser path; these cases should be replayed there after the analysis is corrected.
