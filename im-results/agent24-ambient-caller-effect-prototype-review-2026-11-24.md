# Review of Agent 1's experimental ambient-caller effect prototype

**Status:** focused prototype comparison. The branch closes the explicit direct/transitive unknown-call witness but does not close implicit getter/ambient-global observer paths. It is not a release candidate.

## Candidate and test pins

- Prototype: `agent1/experimental-transitive-caller-proof-20261123`
- Prototype head: `1a13e2f8fbd5c7ace9e01bafa20b10eacba6d77d`
- Test-only child branch: `agent24/agent1-transitive-caller-proof-validation-20261124`
- Test-only child head: `a7e4d97e91e06c0fa2c8213b91abd2fc51d23750`
- Parent-to-child diff: one added test file only, `test/agent24-transitive-host-caller-proof-branch.test.js` (53 insertions, zero deletions).
- The prototype adds `hasUnprovedAmbientDirectCall` to `src/properties.js`. It resolves unique local function declarations/const function expressions, recursively propagates the effect through direct local calls, and treats non-local/dynamic call targets as opaque.

## Exact witness closed by the prototype

The new test uses:

```js
function invokeExternal(){getExternal();}
function hidden(){
  const owner={secretField:41,otherField:2};
  invokeExternal();
  return owner.secretField+owner.otherField;
}
function publicReader(){return hidden();}
```

A sloppy host callback calls `arguments.callee.caller.caller` and captures `hidden` from inside `invokeExternal`. On current main, all COO/SNO/SCO cases fail exact source parity on both OS runners. On the Agent 1 prototype, the same three-mode test passes on Ubuntu and Windows:

- Run: [45435397853](https://github.com/FlareZ123/obfs/actions/runs/45435397853)
- The test asserts equal runtime values, exact source equality, and `output.metrics.properties === 0).

This is evidence that the prototype's transitive direct-call effect closes this particular ambient caller chain. It is not evidence that all host-observer paths are covered.

## Browser evidence on the prototype

The prototype's separate `test/callsite-host-chromium.test.js` passed:

- Run: [45436111929](https://github.com/FlareZ123/obfs/actions/runs/45436111929)
- Ubuntu ran a real headless Chromium classic-script test using a host `Error.prepareStackTrace` hook and `CallSite.getFunction()`; the browser-observed private helper source remained exact and property metrics were zero.
- Windows intentionally skipped this test because a Chromium binary is not pinned on the Windows runner. Both focused jobs and strict JSDoc steps succeeded.

This is a useful browser-runtime witness for an explicit unknown host callback, but it is still the Agent 1 experimental branch, not mainline.

## Important incompleteness found in the same prototype

The prototype's own `test/callsite-host-source-observation.test.js` was run separately:

- Run: [45435797342](https://github.com/FlareZ123/obfs/actions/runs/45435797342)
- Both Ubuntu and Windows failed; Node test summary: 30 tests, 24 passed, 6 failed.
- The six failures are the three-mode cases for:
  - `sco implicit host getter executes callback without explicit call syntax`
  - `ambient free-identifier getter can inspect caller without call or member syntax`

The source mismatches arise without a `CallExpression` in the candidate function:
- reading an external object's accessor property can invoke a host callback;
- reading an unresolved/global identifier can invoke a host-provided getter.

At this prototype pin, `hasUnprovedAmbientDirectCall` walks only `CallExpression` nodes. It does not model `MemberExpression` getter reads, ambient free-identifier getter reads, constructors, tagged-template dispatch, or other implicit host dispatches. The code comment also explicitly disclaims a complete model of higher-order, dynamic-host, and cross-file effects.

## Synthesis and next steps

The prototype is a promising partial rule:

- unknown/non-local direct calls taint the containing callable;
- direct local function calls propagate the taint recursively to active caller frames;
- this closes the current direct and transitive `.caller` witness and the tested Chromium `Error.prepareStackTrace` callback.

It is not a complete host-observer proof. A robust effect graph must also account for unknown accessor reads and global getter reads, plus the already documented IteratorNext, ToPrimitive, PromiseResolve, WebIDL conversion, and host-held callback paths. It must propagate effects through local/imported call edges, aliases, callbacks, and request-time SCO response transformations. A simple call-only veto is insufficient.

Do not cherry-pick the prototype as a complete fix. Agent 3/4/10 should treat it as a narrow proof component to extend, with the getter cases retained as required red regressions until resolved. Keep current mainline RELEASE-BLOCKED for the demonstrated host-observer shapes.
