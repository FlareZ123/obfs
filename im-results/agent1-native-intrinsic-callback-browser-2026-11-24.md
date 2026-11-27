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

The external observer was sloppy, but the tested ESM caller-chain observer returned no function source. The report does not treat the absence of a caller-access exception as established unless the corresponding assertion is validated. The stack still exposed the named \`hidden\` frame and its coordinate. Thus strict-mode source opacity did not remove the separate FramePosition channel.

Across the two validated fixtures, there are **16 operation/runtime-mode executions**:
- CommonJS/sloppy: ExactSource for two JSON callback cases; FramePosition for the other six.
- ESM/strict: FramePosition for all eight; caller-chain ExactSource unavailable in all eight.

This strengthens the case for separate \`ExactSource\` and \`FramePosition\` effects and per-source-unit language/realm contracts. It does not justify merging the CJS and ESM observations into one runtime-independent label.


## Deferred callback timing control

The harness now includes a ninth operation, \`Promise.resolve(1).then(callback)\`, in both the sloppy CommonJS and strict ESM fixtures. The page waits one microtask before serializing observations, so the Promise callback runs after the application function has returned but before the observation is read.

- Successful focused run: [45321261979](https://github.com/FlareZ123/obfs/actions/runs/45321261979).
- Source SHA: \`94cf15a2f25fa862e4ec9eec028766b4e76505f9\`.
- Ubuntu browser job and Windows strict-check job both passed.
- The Ubuntu job executed nine CommonJS and nine ESM scenarios in real Chromium.
- Standard, external and paired-budget JSDoc checks passed.

The deferred callback preserved native/emitted return value 3 and the two positive property rewrites, but Chromium exposed **no \`hidden\` frame and no frame column** in either native or emitted execution. The machine summaries report \`deferredNoReturnedFrame:true\` for both language modes.

This is the timing negative control for the event model: a deferred callback may still have a callback-value/escape relation, but it must not inherit an ActiveFrameEdge to a caller that has returned. Do not model callback-value escape and active-frame observability as the same edge.

The current reproducible matrix is therefore nine operations in two language modes (18 executions):
- Eight synchronous intrinsic callback families: source/frame effects as described above.
- One deferred Promise callback: no returned caller frame in either mode.


## Host-overridden callback-source control

The harness adds a tenth operation: a page-owned wrapper replaces \`Array.prototype.map\`, records \`Function.prototype.toString.call(callback)\`, then delegates to the captured native map. The callback closes over the private owner property. This is deliberately **not** a verified native-intrinsic dispatch; it is a host-overridden operation that directly observes the callback value.

- Successful focused run: [45322887449](https://github.com/FlareZ123/obfs/actions/runs/45322887449).
- Source SHA: \`40e7d9fc5eb6e3a9e07f859cd2e2bd84ce43c434\`.
- Ubuntu Chromium job and Windows strict-check job passed; Windows browser execution was skipped.
- The Ubuntu job ran ten CommonJS/sloppy and ten strict ESM scenarios.

The compiler conservatively retained the callback-observed \`owner.longPrivatePropertyName\` in both source modes. The host override observed identical native/emitted callback source, while the unrelated \`plain()\` positive-control property was still rewritten. The scenario had \`metrics.properties=1\` (the unrelated property), native/emitted return value 3, no frame observation, and \`hostOverrideSourcePreserved:true\`.

This is a useful positive safety control:
- A verified native Array.map callback is modeled as an intrinsic callback dispatch and the current fixture rewrites the private owner key.
- When Array.prototype.map is replaced by a page-owned function that directly reads the callback source, the compiler keeps the callback-captured owner key unchanged.
- It can still rewrite an unrelated proven property in the same module, rather than requiring a whole-module zero-yield veto.

The first version of this control incorrectly required the callback-captured owner key to be renamed. It failed before browser execution because the compiler correctly retained that property. The assertion was corrected to require source preservation and selective positive yield; the successful run above is the resulting evidence.

The complete current matrix is ten operations in each of two source modes (20 executions):
1. Eight synchronous native callback families.
2. One deferred Promise callback, with no returned caller frame.
3. One host-overridden Array.map callback-source observer, with the observed callback property retained.

The host override is a separate effect path from \`IntrinsicCallbackDispatch\`: it directly observes the callback value, not an active caller frame. This is concrete support for keeping HostEffectValueEdge and ActiveFrameEdge distinct and requiring effective dispatch identity/provenance before assigning the intrinsic-callback contract.


## Position-preserving emission proof of concept

The latest harness adds a narrowly scoped padding experiment for the Array.map FramePosition case.

- Successful focused run: [45324257879](https://github.com/FlareZ123/obfs/actions/runs/45324257879).
- Source SHA: \`e4c21d838384926f64c79fc2c51891ca854ac7fa\`.
- Ubuntu job ran ten CommonJS and ten strict ESM scenarios plus one padded replay in each mode.
- Both focused platform jobs passed; Windows browser execution was skipped. Standard, external and paired-budget JSDoc checks passed.
- Browser test duration: approximately 39.4 seconds.

For both CommonJS and ESM, the ordinary emitted Array.map callback frame moved from column 102 to 93. Inserting nine spaces immediately before the emitted \`[1].map(\` callsite restored the native column to 102 in both modes. The padded replay retained the renamed private owner key, preserved return value 3, and passed the behavioral assertion.

Machine output:

\`\`\`text
CHROMIUM_FRAME_PADDING {"mode":"commonjs","delta":9,"nativeColumn":102,"compiledColumn":93,"paddedColumn":102}
CHROMIUM_FRAME_PADDING {"mode":"esm","delta":9,"nativeColumn":102,"compiledColumn":93,"paddedColumn":102}
\`\`\`

This is a **proof of feasibility**, not a production source-map algorithm:
- The nine-character offset was measured from the native/emitted runtime columns for this fixture.
- The harness then inserted whitespace before the known callback call expression.
- The resulting source still contains the obfuscated property name; the added ASCII whitespace has no runtime execution cost, though it increases source size.
- Only one callback/callsite and one Chromium engine were tested. It does not establish that every observable frame can be aligned under arbitrary code generation, line wrapping, multiple callsites, Unicode, or source-map transformations.
- ExactSource remains a separate issue: padding can restore coordinates, but it does not restore the original function source text.

Two failed padding heuristics were retained in the commit history: padding by the full property-token width overshot the native column by two, and padding before the module's later \`hidden(external)\` callsite did not affect the observed frame. The successful location is immediately before the actual \`[1].map(\` operation, consistent with the frame being associated with that active callback-dispatch callsite.

A production direction worth testing is a position-preserving emitter that uses AST/source-span mappings to calculate required padding before observable callsites, rather than measuring runtime columns. Same-width identifier generation may also help, but the failed token-width heuristic shows it cannot be assumed equivalent to callsite-offset preservation.


## Generalized callsite-padding replay

The proof was generalized from one Array.map callsite to every synchronous FramePosition-observable callsite in the current matrix.

- Successful focused run: [45324623509](https://github.com/FlareZ123/obfs/actions/runs/45324623509).
- Source SHA: \`98b22869d12632c5d1daf5713125ff22ac6fbf6f\`.
- Ubuntu Chromium job and Windows strict-check job passed; Windows browser execution was skipped.
- Standard, external and paired-budget JSDoc checks passed.
- Test duration: approximately 35.7 seconds.

The harness performed 14 padded replays:
- CommonJS/sloppy: JSON \`toJSON\`, Array.sort, String.replace, Array.map, Map.forEach, Array.from (six cases; JSON replacer/reviver are ExactSource observations in this mode and have no frame column).
- Strict ESM: all eight synchronous callback operations, including JSON replacer and reviver.

Every case used the measured native/emitted frame-column delta of nine characters, inserted whitespace before that operation's explicit callsite marker, then re-executed the padded output in Chromium. All 14 padded columns exactly matched the corresponding native column. All padded executions retained the renamed private property and returned value 3.

The CJS native/padded columns were:
- JSON toJSON: 103
- Array.sort: 104
- String.replace: 102
- Array.map: 102
- Map.forEach: 117
- Array.from: 104

The strict ESM native/padded columns were:
- JSON toJSON: 103
- JSON stringify replacer: 103
- JSON parse reviver: 103
- Array.sort: 104
- String.replace: 102
- Array.map: 102
- Map.forEach: 117
- Array.from: 104

Machine summaries for both source modes report \`positionPaddingPreserved:true\`. This materially strengthens the feasibility evidence: the earlier result was not unique to Array.map.

The limitation remains important. The harness measures the native/emitted column difference at runtime and supplies explicit callsite markers. A production implementation must derive the required padding from AST/source-span mappings and account for cumulative shifts when multiple observable callsites share a line or when transformations expand code. It must preserve line count and handle Unicode, generated wrappers, nested callback frames, multiple callsites, and engine-specific stack formatting. The nine-character delta is a property of these fixtures/current property-name generation, not a universal constant.


## Source-marker-derived padding (supersedes runtime calibration)

The latest run removes the need to use runtime-measured columns to choose the padding amount.

- Successful focused run: [45325227179](https://github.com/FlareZ123/obfs/actions/runs/45325227179).
- Source SHA: \`262ab7db0e797d57d3d8290497d97c1fc1707e09\`.
- Both focused platform jobs passed. Ubuntu executed the Chromium differential; Windows skipped the browser execution but passed strict checks.
- Standard, external and paired-budget JSDoc checks all passed.
- Comprehensive \`node22\` suite remained explicitly skipped.

For each of the same 14 callsites, the harness now calculates the line-relative column difference between the original source and emitted code at an operation-specific source marker. It asserts that this source-derived delta equals the independently observed native-versus-emitted Chromium stack-column delta. It then inserts that many spaces before the emitted marker and executes the padded file.

**All 14 source-derived deltas matched the runtime deltas (nine columns), and all 14 padded executions restored the native frame column exactly.** Native/emitted/padded values remained 3, and the property spelling remained obfuscated.

This is stronger than the earlier runtime-calibrated proof: the padding amount is derived from original/emitted source positions, not from the observed stack columns. The runtime measurement is now an independent assertion that validates the static offset calculation.

The test still uses manually specified, unique source markers for its fixtures. A production implementation should replace these strings with generation-qualified AST callsite spans and an emitter/source-position map. It must also handle cumulative insertions, multiple callsites on the same line, line shifts, code expansion, Unicode column conventions, generated wrappers, nested callbacks, and different engine stack formats. The result establishes a viable static-offset mechanism for these 14 cases, not a completed general-purpose emitter.


## Host-held callback source observation in a real browser

A separate browser witness now tests host-held callback values that are inspected but never invoked.

- Successful focused run: [45325672865](https://github.com/FlareZ123/obfs/actions/runs/45325672865).
- Source SHA: \`d662b7e58d85a0fe39bd5239f0e4db9606f13566\`.
- Ubuntu Chromium job and Windows strict-check job passed; Windows browser execution was skipped.
- Standard, external and paired-budget JSDoc checks passed. The comprehensive \`node22\` job was explicitly skipped.
- Test files: \`test/agent1-host-held-callback-browser.js\` and \`test/agent1-host-held-callback-browser.test.js\`.

The page replaces \`queueMicrotask\` with a host-owned function that captures \`Function.prototype.toString.call(callback)\` and deliberately does not invoke or schedule the callback. The application then invokes the same function itself to verify native/emitted return-value parity.

Two real Chromium cases passed:

| Transform | Native callback source | Emitted callback source | Return parity |
|---|---|---|---|
| Identifier | \`function hidden(inputValue){return inputValue+1;}\` | \`function hidden(_vd8334b58dddb){return _vd8334b58dddb+1;}\` | 3 = 3 |
| String literal | \`function hidden(){return 'callbackSourceLiteral';}\` | \`function hidden(){return _o3090f7356925[0];}\` | Same string |

Both transforms had positive yield (\`bindings\` and \`literals\`, respectively). In both cases, the host-held callback source changed even though the host did not invoke the callback and application return behavior remained equal.

This is a distinct HostHeldCallable/HostEffectValueEdge observation, not an ActiveFrameEdge or synchronous intrinsic callback dispatch. It corroborates the separate Node evidence from Agent 9 in a real browser. It also exposes an important cross-pass gap in the current fixture: the property pass conservatively retains a callback-captured owner property for a patched Array.map source observer, while identifier and string passes still rewrite a function whose source is directly observed by a host-held callback.

The browser page's scheduler is intentionally patched by the host. This does not claim that the native queueMicrotask implementation itself reads callback source. It demonstrates why a COO compiler cannot assume a mutable global scheduler is the native implementation at runtime, and why callback-value escape/source-observation effects must be represented independently of callback invocation/timing.


## Strict ESM caller-chain error assertion

Agent 8 correctly requested that the “no caller-access exception” claim be backed by an assertion. The browser harness now asserts callerError === null for both native and emitted strict ESM observations across all eight synchronous scenarios. Focused run 45326313234 (https://github.com/FlareZ123/obfs/actions/runs/45326313234), source SHA b9c1f5908c68b871501674d78f78fa19905228d3, completed successfully. The report's main text remains deliberately narrow: the tested caller-chain observer exposed no function source, and the new assertion establishes that the probe did not throw in these fixtures.
