# Host-reentrant ESM owner exposure: mismatch between source and cross-file primitive proofs

**Agent 10 · 28 November 2026 · intermediate safety investigation, exact-source CI evidence where noted.** The full obfuscator remains **RELEASE-BLOCKED** independently of this work. No security, compatibility or ≤2.5× global claim is made.

## Witness and threat boundary

Take a closed three-/two-module ESM input containing `export const owner={secretField:7}`. The consumer imports `owner`, evaluates a primitive or an ambient numeric prototype method, then prints both `owner.secretField` and the method's result. A Node CJS host preload installs:

```js
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const target=pathToFileURL(path.join(process.cwd(),'owner.mjs')).href;
Object.defineProperty(Number.prototype,'toLocaleString',{
  configurable:true,
  value:function(){return import(target).then(mod=>Object.keys(mod.owner));}
});
```

The original consumer's `await nativeNumber.toLocaleString("en-US")` (or `await Number.prototype.toLocaleString.call(7,"en-US")`) then observes `["secretField"]`. A cross-file transformation renaming the exported owner's key without preserving that observation would change stdout despite preserving its numeric `owner.secretField` read. This deliberately hostile host is within the repository's existing host-reentrancy adversarial model; ordinary production environments that disallow mutable intrinsics may choose a different assumption, but that relaxation requires explicit authorization.

Seventeen native-only expression variants and four imported-primitive variants were exercised locally in Node 22.16.0: all returned `{"field":7,"observed":["secretField"]}` in the hostile host. This validates the **native fixtures only**, not any compiler failure.

## Source-pinned transform diagnostic

Focused three-OS workflow [46157868844](https://github.com/FlareZ123/obfs/actions/runs/46157868844), head `8e45d5184484b45b6e7d733a809e352920520174`, runs `test/agent10-locale-positive-diagnostic.test.js` with the consolidated Agent 11 compiler based on `d78b381d316988bddb7e4e1349c8e24b11bd22ab`. Its Ubuntu log reports the same property totals under COO and SNO:

| Consumer shape | `observesFunctionSource` | Cross-file owner renames |
| --- | --- | ---: |
| No locale method call | false | 1 |
| `const n=7; n.toLocaleString("en-US")` | false | 0 |
| `(7).toLocaleString("en-US")` | false | 0 |
| `const n=7; const x=n.toLocaleString("en-US")` | false | 0 |
| `Number.prototype.toLocaleString.call(7,"en-US")` | false | **1** |
| Function literal `(()=>5).toLocaleString()` | true | 0 |

The **last-but-one** row is a new source-level warning: the source observer calls that method safe and the cross-file proof admits the imported ESM owner key rewrite, although the host-preload witness above can make that method re-enter and inspect the owner. This diagnostic has no runtime differential; the independent executed negative `test/agent10-ambient-prototype-host.test.js` is therefore required before declaring a measured parity defect.

## Differential regression and candidate matrix

All GitHub refs below are source-pinned and are **not** merged into main at initial writing:

- `agent10/boxed-binary-host-falsifier-20261128` head `50c67b04fa6f92cba2cafc9e3bb7723528fac415`: 17 source expressions × COO/SCO/SNO; a previous 6-case head `6be8bfe8dc0b587fa53161d0d1616b2c49eeba19` is pinned in [46158496194](https://github.com/FlareZ123/obfs/actions/runs/46158496194). Extended baseline source will need separate CI if the earlier run is insufficient.
- `agent10/imported-boxed-host-20261128` head `33eae3fd78a4edd70b5b16c4d5a3e5576fd3679f`, [focused CI 46158841256](https://github.com/FlareZ123/obfs/actions/runs/46158841256): four independently exported immutable primitive expressions imported into a third module.
- `agent10/ambient-prototype-host-20261128` head `779d938f930a4ba16328494293dd702a09fafeab`, [focused CI 46158964234](https://github.com/FlareZ123/obfs/actions/runs/46158964234): five explicit native prototype call/extraction forms.
- `agent10/host-provenance-integrated-20261128` at `7d0e5eea28bcb250048cd1c175c670a7fdaedc06`, [full CI 46159058760](https://github.com/FlareZ123/obfs/actions/runs/46159058760): includes the three adversarial tests, the corrected locale acceptance oracle, and a targeted `src/cross-properties.js` fix. Its may-flow now conservatively includes binary/update/await results, static fresh-array own primitive slots, imported named immutable primitive constants, and recognized ambient prototype roots.

The producer/consumer source observer `src/ast.js::isDefinitelyPrimitive` proves more expression forms than `src/cross-properties.js::mayBeBoxedPrimitive`. In particular its binary operator and fresh-array own-slot exceptions must not be used to bypass source-observation refusal unless the cross-file proof also notices the resultant host-dispatch exposure. The imported-primitive proof also used to be assembled after the boxed-primitive guard, so the guard had no visibility into these import facts.

## Acceptance oracle correction is distinct from the security patch

The old full-suite assertion `proven primitive toLocaleString keeps independent protected field rewrites` demands a cross-file rewrite even though a hostile `Number.prototype.toLocaleString` can inspect the renamed owner. Agent 11's actual native/emitted host-override source pair [red 46120769409](https://github.com/FlareZ123/obfs/actions/runs/46120769409) and [guarded green 46120766130](https://github.com/FlareZ123/obfs/actions/runs/46120766130) establish the conflict.

Branch `agent10/locale-acceptance-oracle-20261128` at `57aec29b8bc74b36c7774cfa152d111dab9d4295` preserves the original consumer native/emitted output comparison but requires **zero unsafe** cross-file renames, adds a separate **non-coercing primitive-template positive** that requires actual owner-key rewriting, and integrates the executed host-reentry negative. Independent focused test [46158327222](https://github.com/FlareZ123/obfs/actions/runs/46158327222) was **GREEN on Ubuntu, Windows and macOS** for the corrected acceptance file (including type checks); its separate hostile negative [46158331120](https://github.com/FlareZ123/obfs/actions/runs/46158331120) was also reported **GREEN**. A new full run [46158779781](https://github.com/FlareZ123/obfs/actions/runs/46158779781) is pending at this initial write.

**Decision rule:** Do not weaken the compiler's hostile-host refusal merely to satisfy an outdated positive rewrite assertion. Equally, do not call the integrated branch green until its actual full suite, runtime profiles and live host witnesses have been inspected. An honest release decision must still separately account for successful static clone, authorized SCO relay, SNO integrity bypass, and >2.5× runtime observations on the previous frozen candidate.

## Next actions

1. Retrieve exact Windows/Linux/macOS red/green source-pinned CI outcomes and classify any failure as native/emitted mismatch, missing protection/rewrite, type/compile failure or infrastructure issue.
2. Resolve the **ambient prototype** witness; if confirmed, refine the cross-file host-root guard without losing independent protected-owner yield.
3. Independently compare the new safety patch against original positive-yield suites, complete full modes and runtime budget, and preserve only a validated branch for integration.
4. Send exact failure counts and branch SHA to Agent 1 and Agent 11; no unverified claims or silent test relaxation.


## Executed baseline native/emitted mismatches (28 November, ~15:27 UTC)

The suspected cross-file bug is now **reproduced as a concrete behavioral error**, not merely a compiler-rewrite warning.

**Source-pinned three-module imported-primitive control:** `agent10/imported-boxed-host-20261128` at `33eae3fd78a4edd70b5b16c4d5a3e5576fd3679f`, focused [GitHub Actions 46158841256](https://github.com/FlareZ123/obfs/actions/runs/46158841256). The Ubuntu and macOS focused jobs both failed **all 12 cases**: four independent primitive exports (`7`, `3+4`, `+7`, `true?7:0`) × COO/SCO/SNO. Each case runs the original and emitted ESM packages under a real Node preload overriding `Number.prototype.toLocaleString`; sample actual emitted stdout `{"field":7,"observed":["_pff9c290dddc8"]}`, expected native stdout `{"field":7,"observed":["secretField"]}`. The numeric field remains 7, so the discrepancy is the renamed key observed by a dynamically importing host method. Windows completion pending at this update. This is a **source-visible, executed parity violation** in the unpatched consolidated-fast-observer base `26ac0ef3ab4dbf22ecc3671a94186bdb9cc31175`.

**Source-pinned local primitive-expression control:** `agent10/boxed-binary-host-falsifier-20261128`, extended head `50c67b04fa6f92cba2cafc9e3bb7723528fac415`, focused [GitHub Actions 46159232896](https://github.com/FlareZ123/obfs/actions/runs/46159232896). Its Windows focused job failed **12 cases among the first six shapes** (numeric binary alias, numeric bitwise, exponent and initialized array slot × COO/SCO/SNO), with native key `secretField` vs emitted `_p...` keys. Other cases in the extended 17-expression file remain to be characterized by the job's full result; do not extrapolate these 12 to all 51 cases or claim proof of anything beyond the tested hostile-host process.

The direct diagnostic `Number.prototype.toLocaleString.call(7,...)` admitted a rewrite as described above, but the executed prototype-specific run `46158964234` remained queued at this checkpoint. Distinguish this from the already observed local/imported primitive failures.

**Proposed countermeasure:** integrated branch `7d0e5eea28bcb250048cd1c175c670a7fdaedc06` computes `verifiedPrimitives` *before* the boxed guard and seeds the guard with those exact module imported bindings, tracks binary/update/await values, handles fresh-array slot and ambient prototype roots. Full run `46159058760`, three source-specific focused runs from the same head, and deterministic grammar fuzz `46159532089` were dispatched; their outcomes must be checked before any security-preservation or full-green claim. A broad overconservative alternative was canceled to avoid wasting runners.

The old locale positive-yield test was internally inconsistent with these executed malicious-host observations. The independent corrected-oracle focused runs `46158327222` and `46158331120` were both successful across Linux, Windows and macOS. Both still preserve native/emitted parity and the genuinely inert, positive rewrite witness; this is a **test-obligation correction**, not a permission to silently relax source-level behavior.



## Source-pinned red/green resolution and residual performance-fixture issue (28 Nov, ~15:43 UTC)

The proposed compiler safety patch at \`7d0e5eea28bcb250048cd1c175c670a7fdaedc06\` has now **passed all targeted real-Node host-reentry tests on all three OS**:

| Three-mode case file | Source-pinned guarded run | Result |
| --- | --- | --- |
| Numeric binding (17 expressions) | [46159912897](https://github.com/FlareZ123/obfs/actions/runs/46159912897) | PASS on Ubuntu, Windows, macOS |
| Imported immutable numeric ESM export (4 variants) | [46159916555](https://github.com/FlareZ123/obfs/actions/runs/46159916555) | PASS on Ubuntu, Windows, macOS |
| Explicit native-prototype call/extract/bind (5 variants) | [46159919665](https://github.com/FlareZ123/obfs/actions/runs/46159919665) | PASS on Ubuntu, Windows, macOS |

All are source-level behavior comparisons against a hostile CJS host preload. Their **unpatched control** runs [46159232896](https://github.com/FlareZ123/obfs/actions/runs/46159232896), [46158841256](https://github.com/FlareZ123/obfs/actions/runs/46158841256), and [46158964234](https://github.com/FlareZ123/obfs/actions/runs/46158964234) FAILED with native \`secretField\` vs emitted \`_p...\` key differences. Do not confuse the negative tests being RED with the guarded tests being GREEN.

**Real Chromium:** the independent opt-in browser workflow uses the same real HTTP/CSP page and script for its source-pinned baseline/guarded runs, with a host bootstrap installing a Number.prototype formatter before the protected module import. On the **unpatched** \`26ac0ef3...\` branch, [46160168776](https://github.com/FlareZ123/obfs/actions/runs/46160168776) FAILED on the first local binary case (native/emitted browser outputs differ). On **guarded** \`7d0e5eea...\` plus test runner, [46160139519](https://github.com/FlareZ123/obfs/actions/runs/46160139519) PASSED on real Google Chrome, logging \`AGENT10_REAL_CHROMIUM_HOST_REENTRY {"scenarios":[{"name":"local-binary","renamed":0},{"name":"imported-number","renamed":0},{"name":"native-prototype-call","renamed":0}],"parity":true,"csp":"script-src 'self'"}\`. The same CI job passed \`npm run typecheck\`. Thus these three source-parity repairs are not Node-only.

**Deterministic grammar:** [46159532089](https://github.com/FlareZ123/obfs/actions/runs/46159532089) PASS on all three OS, exact seed \`0x317a1b5e\`, 124 numeric receiver expressions × COO/SNO = 248 compiles; Ubuntu log \`leakCount:0\`, \`safe:248\`, \`compileMs:596\` on a small graph. Because no graph was admitted for rewriting, this experiment demonstrates fail-closed refusal on these fixtures, **not** complete obfuscation coverage or a general runtime-budget bound.

**Functional suite:** [46158779781](https://github.com/FlareZ123/obfs/actions/runs/46158779781) SUCCESS for the corrected-but-unpatched acceptance oracle on Ubuntu and Windows; it keeps a genuine independent primitive-template positive yield. The integrated guarded full suite [46159058760](https://github.com/FlareZ123/obfs/actions/runs/46159058760) passed on Ubuntu; Windows reported exactly one failure in \`computed-pattern-session-cpu-profile\`. It was **not** the 2.5× ratio or transformed-output parity check: the failure arose at \`sims/computed-pattern-session-cpu-profile.js:82\`, \`assert.ok(Number.isFinite(measurement.hotCpuUs)&&measurement.hotCpuUs>=0)\`, i.e. a rejected \`process.cpuUsage()\` delta sample. The harness samples very small hot loops in fresh Windows Node subprocesses and explicitly acknowledges zero/clock-granularity ticks. Focused rerun dispatched to discriminate sampling instability from a reproducible regression. Do not call the integrated full two-OS suite green yet.

**New falsification under evaluation:** \`src/ast.js::isDefinitelyPrimitive\` specially proves \`typeof dynamic==='string'?dynamic:null\` primitive when a unique earlier \`dynamic\` const comes from an opaque source. The current cross-file \`mayBeBoxedPrimitive\` treats its two arms as unknown and null (neither independently boxable) and **may** admit a rewrite even when the valid string branch calls a host-overridden \`String.prototype.toLocaleString\`. Five source scenarios—including two-stage alias propagation and optional method access—have 15/15 native-host Node runs with the expected original key. The unpatched integrated branch with just this new test is at \`65bb86668475a5a4acdc527f55a23c11a6f5d3f3\`, and the targeted conditional type-proof countermeasure is at \`8f0e7ae8ce43f493f680a5e9212ef6adc0520eee\` (\`agent10/typeof-null-host-guarded-20261128\`). Focused and full CI were dispatched; **no emitted mismatch or fixed result is asserted before those jobs return**.

The global release decision remains **NO-GO** for independent SCO request-relay, SNO runtime integrity, static recovery and performance evidence even if these confined source-preservation regressions are repaired.
