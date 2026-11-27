# SNO CLI host-held callable string-source red controls (single + multi-file)

**Date:** 2026-11-24  
**Status:** Reproduced on both CI platforms; current-main behavior witness, not a desired-behavior regression gate  
**Owner:** Agent 24

## Question

Does the production SNO CLI's default string-literal encoding alter a function's observable source when that function is handed to a host callback sink that reads `Function.prototype.toString` but does not invoke the callback?

## Fixture and observation

The first test uses a one-file CommonJS entry:

```js
function hidden(){return 'callbackSourceLiteral';}
const unrelated='unrelatedTopLevelLiteral';
void unrelated;
queueMicrotask(hidden);
console.log(hidden());
```

A Node preload replaces `queueMicrotask` with a host-controlled sink. The sink reads `Function.prototype.toString.call(callback)`, writes the source to a temporary observation file, and records `invoked:false`. It never invokes or schedules the callback. The program itself calls `hidden()` and prints its result, so the native/emitted runtime value is checked independently of the host source observation.

The first fixture draft used `'callbackSourceLiteral:'+inputValue`. That did **not** isolate this issue: the existing `observesFunctionSource` analysis correctly treats a string-concatenation expression with an unknown operand as a possible implicit function-to-source coercion, so the literal remained unchanged. Replacing the body with a direct string-literal return removed that independent source-observation path.

A second test exercises a real two-file SNO CLI source group:

```js
// helper.cjs
function createHidden(){return function hidden(){return 'helperCallbackSourceLiteral';};}
module.exports={createHidden};

// entry.cjs
const {createHidden}=require('./helper.cjs');
const hidden=createHidden();
const unrelated='unrelatedTopLevelLiteral';
void unrelated;
queueMicrotask(hidden);
console.log(hidden());
```

The callback is created in the helper module, returned through the cross-file factory call, and passed to the host observer in the entry module. The CLI reports `Processed 2 files; mode sno`; both output artifacts are present. Native and emitted stdout remain identical, but the helper-defined callback source changes from `'helperCallbackSourceLiteral'` to a decoder-table reference. The unrelated entry-module literal is also encoded. This exercises the cross-file value-flow path, not merely two independent files.

## Result

**Status: Current-main source mismatch reproduced.**

- Native source: `function hidden(){return 'callbackSourceLiteral';}`
- Single-file SNO CLI emitted source: `function hidden(){return _o8fc09789ad42[0];}`
- Cross-file native source: `function hidden(){return 'helperCallbackSourceLiteral';}`
- Cross-file SNO CLI emitted source: `function hidden(){return _o7bfc322a36d9[0];}`
- The unrelated top-level literal `unrelatedTopLevelLiteral` is encoded in the emitted entry file in both cases.
- Native stdout: `callbackSourceLiteral`
- Emitted stdout: `callbackSourceLiteral`
- Host callback invoked: `false`

The value behavior is preserved, but the source spelling is not. This isolates the SNO CLI string-encoding pass: the SNO CLI supplies no explicit `strings` option, and the current core defaults string encoding on for SNO. The host-held callback is not recognized as a source-observation dependency by the string pass, so its literal is rewritten even though the host reads the function source.

## Reproduction

- Test-only branch: `agent24-sno-cli-host-held-string-20261124`
- Branch head at SNO run #3266: `2ed95636817d23910d3d3182b78568d8e6f6ef14`
- Test: `test/agent24-sno-cli-host-held-string-source.test.js` (two cases: one-file and cross-file)
- The shared test-only branch later advanced to `15ed09df036f22f8e7791fa8d07e57ad8a542030` for separate SCO tests; the SNO test file was unchanged.
- Strongest two-platform workflow: [Manual validation run 45334032803](https://github.com/FlareZ123/obfs/actions/runs/45334032803), run #3266
- Earlier one-file yield-control run: [45333567142](https://github.com/FlareZ123/obfs/actions/runs/45333567142), run #3265
- Node: 22.23.4
- Ubuntu: both focused tests, project JSDoc, external JSDoc, paired-budget JSDoc all passed in run #3266
- Windows: both focused tests, project JSDoc, external JSDoc, paired-budget JSDoc all passed in run #3266

The initial draft failed because its `+` expression independently exposed a potential coercion path; the corrected pure-return fixture passed on both platforms. The earlier missing separator in `jsconfig.external.json` was repaired on main in `ca9763751270a6b1e43a704f3f5bfdba9aa5c4a8`; the successful external JSDoc steps validate the repaired config.

## Interpretation and limits

## Current implementation seam

The current mainline path explains the split behavior:

- `src/core.js` computes `remoteSourceObserver` from imported-source proofs and, for function-source observation, only includes `observesFunctionSource` in the cross-file branch (`prepared.length > 1`, around lines 2008–2015). The direct host-controlled `queueMicrotask` sink is not recognized, so this remains false in both fixtures.
- `src/core.js` defaults `shouldEncodeStrings` to true for SNO when no explicit option is supplied (around lines 2049–2050), then calls `encodeStrings` without a shared plan (around lines 2257–2261).
- `src/strings.js` has a file-wide early return when `observesFunctionSource(ast)` is true (around lines 60–64). That explains Agent 9's reflection-matrix zero-yield result when the heuristic recognizes a pattern, but it does not protect the direct callback escape here.

The producer/consumer integration point is therefore concrete: build the shared source/effect plan before mutation, pass the same immutable plan into `encodeStrings`, and protect only the callback's exact source closure. The one-file and two-file yield controls should continue encoding the unrelated top-level literal.

## Relation to Agent 9's reflection matrix

This result does not contradict Agent 9's nine-case dynamic/reflection matrix in `im-results/agent9-host-held-callable-source-observation-2026-11-24.md` ([run 45330368625](https://github.com/FlareZ123/obfs/actions/runs/45330368625)). In that matrix, string encoding preserved callback source but `metrics.literals === 0` despite an unrelated top-level literal: the pass took a broad file-level veto. Here, the direct `queueMicrotask(hidden)` sink is not recognized by the current observer gate, so the string pass rewrites both the callback literal and the unrelated top-level literal. These are two failure modes of the same file-wide heuristic: **over-withholding** when it recognizes some observer shapes, and **under-protecting** when it misses a host-held callable escape. The shared plan must normalize both into an exact per-callable source closure while preserving unrelated yield.

This is a **red-control witness** for current behavior, not an acceptance test for the desired obfuscator. When the shared `SourceObservationPlan` / host-held callable closure is implemented, invert the source-mismatch assertion to require exact source parity, while retaining this baseline as evidence. Do not merge this test as a green regression gate before the fix; it intentionally passes only while the current leak exists.

Scope is one-file and two-file CommonJS SNO CLI, Node 22.23.4 on Linux and Windows. It does not establish general multi-file SNO parity beyond the tested helper/entry shape, package/CLI acceptance, browser behavior, SCO behavior, CallableMetadata coverage, performance budget, or a release candidate. No production source was changed, and the test remains on its isolated branch.

