# Formal-parameter side-effect false-safe: captured WeakMap source observer

**28 November 2026 | reproducible intermediate RED | no production fix**

## Scope and status

Frozen production compiler from agent1/final-dom-acceptance-20261127 at 526114e2dc78e65dea6d3d5b8d55f9a3c45b5b60. A one-file test-only child, agent2/default-parameter-carrier-falsifier-20261128 at 6a25bb4e79fdefaaccd5b6fdfd296d769c67874e, adds one native-source-observed default-parameter helper and one ordinary-object positive-yield negative control to test/agent3-weakmap-cfg-matrix.test.js. No compiler, CLI, workflow, dependency, or runtime-security code changed.

**CI:** [focused manual-validation 46088344685](https://github.com/FlareZ123/obfs/actions/runs/46088344685), Node22.23.4 source-pinned on Ubuntu, Windows and macOS. All three jobs **RED 52 passed / 1 failed / 0 skipped**, with exactly the new default-parameter-captured-weakmap failing. The paired ordinary-object negative and 51 preexisting cases passed on all three. Full-suite node22 jobs were intentionally skipped by focused mode.

Each platform's failing assertion printed three COO/SCO/SNO **core-API ESM** modes with bindings=4 in every mode. Native observed source: function inspect(){const privateLocal=29;return privateLocal;}. Emitted observed source replaces privateLocal with a generated identifier. In all modes parity=false even though numeric returns are identical. This **is a semantic rewrite false-safe**, not an expected-diagnostic mismatch. It is not standalone SCO HTTP, an SNO native launcher, or a real-browser acceptance test.

## Concrete language mechanism

The shared test fixture's mutation file can contain:

    let carrier={};
    function fill(_ignored=(carrier={instance:new WeakMap()})){}
    fill();
    const nativePrototype=Object.getPrototypeOf(carrier.instance);

The helper's formal default runs **before** the otherwise empty body, mutating captured carrier. The fixture overrides nativePrototype.set so the sibling module's private inspect function passed into a WeakMap.set operation is sent to a Document.title-like DOMString setter. This coerces the actual inspect function to its **complete source**, which differs after identifier renaming. The native-negative replaces new WeakMap() with new Ordinary(); mutating Ordinary.prototype.set does not observe any WeakMap.set, and the unrelated private binding should remain obfuscatable.

Source-review hypothesis: src/ast.js replayCarrierFunctionNode binds missing arguments as carrierMaybe and interprets only a function's body. The AssignmentPattern binder does not replay default-expression writes in the outer carrier environment. The abstract state therefore misses the actual WeakMap prototype alias and incorrectly approves a private rename. Further auditing must include explicit-undefined arguments, destructured/computed parameter patterns, arrow/object/class methods and async/generator semantics, plus noncapturing literal-provided arguments.

## Broader native controls and pending compiler matrix

Independent local Node22.16.0 three-module source mutation harness ran **eleven** paired native scripts: eight default-parameter/computed-pattern forms with an observable source change and three negatives without that observation; all kept numeric behavior unchanged. A separate expanded focused-test branch successor 50d02d7326d8bee3a22ce0853e6f2590108e7e5c adds a total **eleven** CFG cases (nine native positives, two negatives) at the same frozen compiler and is dispatched in [CI 46089424596](https://github.com/FlareZ123/obfs/actions/runs/46089424596). That run's outcome must be independently recorded; do not treat it as green from this report. A local Chromium headless subprocess timed out and supplies **no browser validation**.

## Release and repair boundary

This finding is a test-only red acceptance obligation. A repair must preserve complete observed String(function) values while respecting argument evaluation before formal parameter initialization, omitted/explicit-undefined defaults, evaluation order, destructuring computed keys and aliases. Avoid both a static source-safety false-safe and an indiscriminate refusal that eliminates all negative-control rewrite yield. A candidate must be tested on one agreed Agent1/10 integration head with remaining all-platform Node/Chromium, actual SCO/SNO entrypoints and paired 2.5x execution-budget evidence before any stronger claim. Current release disposition remains **NO-GO**.
