# Escaping source-visible throw invalidated Chromium private-field positive fixture

**21 November 2026. Agent 2. Status: source-pinned browser test correctness regression.** Security release remains **RELEASE-BLOCKED**.

## Observed failure

The active real Chromium harness `test/browser-integration.js` expected `reflectionSet.crossFile.properties === 2` for a two-module ESM graph. Its consumer body simultaneously contained a possible uncaught explicit throw:

```js
const value=Reflect.get(state,"secretValue")+state.otherValue;
const own=Object.hasOwn(state,"otherValue");
if(value!==41||!own)throw new Error("reflection mismatch");
```

The source-observation guard conservatively refuses transforms when explicit throws can expose source coordinates to a host diagnostic. Source preservation therefore yields `crossFile.properties === 0`, and the test failed its own positive-yield assertion **before** a Chromium DOM differential was executed. [PR #207](https://github.com/FlareZ123/obfs/pull/207) separately addresses the same source-observer boundary in several Node test fixtures. No production assertion had established that this particular throw was safe to relocate.

The observed original assertion was `test/browser-integration.js:123:10`, expected two renames, actual zero, on source-pinned Ubuntu full CI [44931776258](https://github.com/FlareZ123/obfs/actions/runs/44931776258) before this test repair.

## Paired repair in draft PR #210

The positive ESM graph now exports two computed results from the consumer: `value=Reflect.get(state,"secretValue")+state.otherValue` and `own=Object.hasOwn(state,"otherValue")`. The real HTML page imports these named ESM exports and displays their values as `41,true`. The emitted graph must still rename exactly **two** private owner fields.

An independent negative form appends the original escaping throw; the compiler must explicitly refuse all property renames (**zero**) and preserve source admission. The change tests both sides of a well-defined source observer boundary without changing compiler behavior. The DOM assertion is stronger than the original unconditional `reflection-ok` marker because it validates the computed values in the real browser.

## Reproducible CI

Patch source `9964c73ce4a79bcee41a826660898b0cc4ae5b8e` (only `test/browser-integration.js` changed relative to current main); [manual real-browser run 44932800334](https://github.com/FlareZ123/obfs/actions/runs/44932800334) on Node 22 and Ubuntu Chromium:

- `Run live browser integration suite`: **passed**, including the two private owner renames, paired negative refusal and `41,true` DOM verification.
- Preceding failed-operand Chromium source checks: **passed**. The clone-source, XML, XOR decoder, benchmark/external JSDoc, imported constant-key, real SCO browser and other earlier independent steps also passed.
- The **overall workflow failed later** in an independent `test/sco-spelling-mask-browser.js:113:14` assertion, `false !== true`. Neither that test nor any SCO implementation changed in this PR. This result therefore proves the targeted browser regression's repair but does not establish a green entire browser workflow.

Source: [PR #210](https://github.com/FlareZ123/obfs/pull/210). The resulting browser importer expects two stable exported data values. This is a scoped semantic admission and test-evidence improvement, with no claim of static reconstruction resistance, secure host locking or 2.5× runtime performance.
