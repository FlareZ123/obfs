# Agent 1: current-main native intrinsic callback differential in real Chromium

**Date:** 2026-11-24  
**Status:** intermediate empirical evidence; test-only branch artifact, not a compiler candidate or release result.

## Question

Does the current-main COO property pipeline preserve native-versus-emitted behavior when a host-supplied browser callback observes an application frame during a synchronous built-in callback? Agent 3's initial eight-operation differential was Node/V8-only. This experiment adds a real Chromium execution for the same callback families.

## Reproduction

- Branch: `agent1-native-callback-browser-20261124`
- Successful focused-validation source SHA: `21d49aa48260dae4f6cee7577f74d25b54e8b7a5`
- Successful GitHub Actions run: [45320168226](https://github.com/FlareZ123/obfs/actions/runs/45320168226), `manual-validation.yml`, focused input `test/agent1-native-callback-browser.test.js`.
- Ubuntu job: passed; real Chromium executed all eight scenarios.
- Windows job: passed strict checks; browser test was explicitly skipped because the browser is provisioned only on Ubuntu.
- Runtime: Node v22.23.4 and the GitHub Ubuntu runner's Google Chrome.
- Test entry: `test/agent1-native-callback-browser.test.js`
- Harness: `test/agent1-native-callback-browser.js`
- Strict JSDoc: `jsconfig.external.json` includes both files.
- Production inputs were unchanged from current main:
  - `src/ast.js`: `c227e6e604635a42663af745fd0cfb194b215a67`
  - `src/properties.js`: `bda3c6097e2679f59bd003fa0aed3e0291d4ba4c`
  - `src/core.js`: `8d33996821650de540b87502baff00a9e7ea99c7`

Re-run with `CHROMIUM_BIN=google-chrome node test/agent1-native-callback-browser.js`, or use the focused workflow input `test/agent1-native-callback-browser.test.js`.

The compiler receives one CommonJS source unit and runs COO with `identifiers:false`, `strings:false`, and `properties:true`. The emitted module is executed as a classic browser script with a minimal `module.exports` shim. The host observer is defined by the page, outside the compiled source. This gives the callback a same-realm sloppy caller chain while keeping the module's local owner bindings private to the compilation.

Every scenario requires:
- two actual property rewrites: the observed owner key and an unrelated `plain()` positive-control key;
- identical native and emitted return values;
- exact source or active-frame observation in native Chromium;
- a changed source/coordinate observation after the actual compiler output executes.

## Results

All **8/8** browser scenarios passed. Each had `metrics.properties=2`, native return value `3`, and emitted return value `3`.

| Native operation | Observed effect | Native column | Emitted column |
|---|---|---:|---:|
| JSON `toJSON` | FramePosition | 103 | 94 |
| JSON stringify replacer | ExactSource | — | — |
| JSON parse reviver | ExactSource | — | — |
| Array.sort comparator | FramePosition | 104 | 95 |
| String.replace callback | FramePosition | 102 | 93 |
| Array.map callback | FramePosition | 102 | 93 |
| Map.forEach callback | FramePosition | 117 | 108 |
| Array.from mapFn | FramePosition | 104 | 95 |

Machine summary from the successful run:

```json
{
  "node": "v22.23.4",
  "scenarios": 8,
  "exactSource": 2,
  "framePosition": 6,
  "positiveYield": true,
  "nativeParity": true
}
```

For JSON replacer/reviver, the browser callback's sloppy caller chain exposes `hidden()` through `arguments.callee.caller.caller`; the captured `Function.prototype.toString` output changes after the private owner key is rewritten. For the other six operations, Chromium's `Error.stack` exposes the active `hidden` frame and its column changes after the earlier owner-key spelling shrinks.

Notably, JSON `toJSON` produced a FramePosition mismatch in this browser COO fixture, whereas Agent 3's actual SCO Node fixture reported the measured column stable for its `toJSON` control. These are different runtime/mode fixtures and must remain separate classifications; a stable coordinate in one fixture is not a general safety proof.

## Interpretation for the shared plan

The evidence supports one generic `IntrinsicCallbackDispatch` event kind with operation-specific identity and callback-role metadata, rather than a separate HostEffectKind for every builtin:

- JSON `toJSON` is an object-provided method.
- The other seven operations pass explicit callback arguments at different argument positions.
- Synchronous dispatch can create a reverse active-frame edge independently of whether the callback function value itself escapes.
- The observed effect must be attached per operation/runtime contract: ExactSource and FramePosition are distinct, and the SCO matrix already shows that measured effects can differ by operation.
- Deferred `Promise.then` remains a separate timing control; do not create an active-frame edge to a caller that has already returned, while retaining any independent callback-value escape edge.
- Effective native identity must be established from a host contract/snapshot, not a familiar property spelling.

## Limitations and non-claims

- This is COO evidence only. It does not add a browser SCO or SNO result.
- One Chromium implementation on the GitHub Ubuntu runner was tested; this is not cross-browser-engine evidence.
- The CommonJS browser shim is not a complete Node CommonJS wrapper or a claim that every browser distribution uses CommonJS.
- A separate classic-script fixture (including a nested private owner and `closedWorld:true`) yielded zero property rewrites, so it was not admitted as a positive-yield differential. The successful test deliberately uses a module-scoped CommonJS input to exercise a positive transformation; do not generalize the script-mode refusal beyond that fixture.
- No full behavioral suite, hostile browser instrumentation campaign, static reconstruction study, tamper-resistance result, runtime budget sample, or 2.5× performance acceptance was run.
- This does not justify a source-observer compiler port, a release candidate, or promotion to `results/`.

— Agent 1


## Strict browser ESM extension

A second focused run extended the same harness with an actual strict ESM module fixture:

- Successful run: [45321034293](https://github.com/FlareZ123/obfs/actions/runs/45321034293), \`manual-validation.yml\`, focused input \`test/agent1-native-callback-browser.test.js\`.
- Source SHA: \`fc1ed2d8a18d80a4f2f53f112e5d046f83ecd202\`.
- Ubuntu job: passed and ran the eight ESM scenarios in real Chromium.
- Windows job: passed strict checks; browser test skipped by the explicit platform guard.
- ESM compilation: \`sourceType:'module'\`, COO, \`closedWorld:true\`, \`identifiers:false\`, \`strings:false\`, \`properties:true\`.
- The HTML page loads the native/emitted module with \`<script type="module">\`; the host callback is a separate classic-script function passed into the exported module function.

All **8/8 strict ESM scenarios** had two property rewrites, preserved return value 3, no source exposed through the tested sloppy caller-chain observer, and a changed \`Error.stack\` frame column:

| ESM operation | Native column | Emitted column | Caller-chain source |
|---|---:|---:|---|
| JSON \`toJSON\` | 103 | 94 | Unavailable |
| JSON stringify replacer | 103 | 94 | Unavailable |
| JSON parse reviver | 103 | 94 | Unavailable |
| Array.sort comparator | 104 | 95 | Unavailable |
| String.replace callback | 102 | 93 | Unavailable |
| Array.map callback | 102 | 93 | Unavailable |
| Map.forEach callback | 117 | 108 | Unavailable |
| Array.from mapFn | 104 | 95 | Unavailable |

Machine summary:

\`\`\`json
{
  "scenarios": 8,
  "strictSourceUnavailable": true,
  "framePosition": true,
  "positiveYield": true,
  "nativeParity": true
}
\`\`\`

The external observer was sloppy, but its ESM caller chain returned no function source and no caller-access exception. The stack still exposed the named \`hidden\` frame and its coordinate. Thus strict-mode source opacity did not remove the separate FramePosition channel.

Across the two validated fixtures, there are **16 operation/runtime-mode executions**:
- CommonJS/sloppy: ExactSource for two JSON callback cases; FramePosition for the other six.
- ESM/strict: FramePosition for all eight; caller-chain ExactSource unavailable in all eight.

This strengthens the case for separate \`ExactSource\` and \`FramePosition\` effects and per-source-unit language/realm contracts. It does not justify merging the CJS and ESM observations into one runtime-independent label.
