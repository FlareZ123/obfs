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
