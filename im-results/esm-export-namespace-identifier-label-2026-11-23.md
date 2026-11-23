# ESM namespace re-export label corruption by local identifier rename (23 November 2026)

**Classification:** confirmed production semantic-compatibility defect, bounded COO Node ESM red/green; not a runtime security improvement or evidence of release readiness.

## Original behavior and compiler breakage

Input graph:

```js
// dep.mjs
export const sentinel=7;

// owner.mjs
const privateKey=1;
export * as privateKey from './dep.mjs';
export const localValue=privateKey;

// entry.mjs
import {privateKey,localValue} from './owner.mjs';
export const proof=[privateKey.sentinel,localValue];
```

Native Node ESM gives `[7,1]`. `export * as privateKey` introduces a **public export name**, not a module-local variable named `privateKey`; therefore the local constant and export name do not have to be renamed together. On current main, the compiler `src/identifiers.js` `classifyIdentifier` marked `ExportAllDeclaration.exported` as a reference. Because `const privateKey=1` was an eligible local rename, its rewrite incorrectly changed the public namespace export token too, and the unchanged consumer failed to import:

```
SyntaxError: The requested module './owner.mjs' does not provide an export named 'privateKey'
```

This is a real **cross-file compatibility failure** in production `obfuscateFiles`, not just a hypothetical AST class or a static-text comparison. The regression enforces a *positive local-binding transformation* (owner metrics `bindings>0`), so a global disable of renaming is not counted as a valid repair.

The cause also applies to module import-attribute grammar: `with {type:'json'}` has a bare `ImportAttribute.key` syntax label. That is neither a binding read nor a name-rewrite target. Incorrect classification can suppress a same-spelled local const rename because of a false pre-declaration reference. The separate Node JSON import case covers both native runtime parity and positive local renaming yield.

## Source-pinned evidence

- **Unpatched compiler unchanged:** test-only `agent6/esm-export-all-identifier-label-red-20261123` commit `31dd8d2ea50e81fb26a219f3e4d8cf07feb48a6f`, [Ubuntu/Windows Node 22.23.4 RED 45250769037](https://github.com/FlareZ123/obfs/actions/runs/45250769037) with actual missing-export SyntaxError.
- **Expanded red native corpus:** source `e7b2dfbdb2e42300a48bb048069098bed458241f`, [Ubuntu/Windows RED 45251845234](https://github.com/FlareZ123/obfs/actions/runs/45251845234), first test same missing-export SyntaxError; second JSON-attribute test lacks expected local rename, as admission control.
- **Narrow candidate patch:** `agent6/esm-export-all-identifier-label-guard-20261123`, `src/identifiers.js` adds only two syntactic roles to the existing `ignore` contract:
  - `ExportAllDeclaration` non-computed `exported` identifier;
  - `ImportAttribute` key identifier.
  The patch does not change export names, adapt crossfile graph paths, disable renaming, or alter security checks.
- **Expanded patched source** `60cb169cea4b8d18611357d3157be2c3a9a3f898`, [Ubuntu/Windows GREEN 45251854518](https://github.com/FlareZ123/obfs/actions/runs/45251854518), 2/2 native ESM cases and strict project/external JSDoc. Both cases preserve local identifier rename yield.

## Three-mode native ESM integration gate

A separate Node ESM graph at `test/esm-export-label-three-mode.test.js` evaluates the *same input and public import* under **SCO, COO and SNO** outputs, with `strings:false,properties:false` to isolate the identifier pass. It checks the original `[17,13]`, retained local-rename `metrics.bindings>0` for each mode, and exact imported namespace/export result parity after emitting all three module graphs to distinct directories. [Workflow 45252365035](https://github.com/FlareZ123/obfs/actions/runs/45252365035) at **`170dbecd94f1f50435c8326126d228ad1a5b38d8`** passed on **Ubuntu and Windows Node 22.23.4** including strict project/external JSDoc. This establishes a bounded all-three-mode *Node ESM output* result; no real SCO private remote RPC session or browser runtime was involved.

## Baseline-vs-patch focused compatibility controls

At `170dbecd94f1f50435c8326126d228ad1a5b38d8`, four **unchanged existing** focused regressions passed on both Ubuntu and Windows, each with strict project/external JSDoc: identifier object shorthand/proto semantics [45252428272](https://github.com/FlareZ123/obfs/actions/runs/45252428272), identifier TypeError/source spelling [45252436859](https://github.com/FlareZ123/obfs/actions/runs/45252436859), TDZ identifier name handling [45252444473](https://github.com/FlareZ123/obfs/actions/runs/45252444473), and lexical property scope [45252452693](https://github.com/FlareZ123/obfs/actions/runs/45252452693).

An additional **existing** `test/interfile.test.js` four-file cross-property **positive transform count** check failed on the patched branch [45252460015](https://github.com/FlareZ123/obfs/actions/runs/45252460015) on Ubuntu and Windows: expected `crossFile.objects===1`, observed 0. An exact unchanged-compiler current-main control [45252707202](https://github.com/FlareZ123/obfs/actions/runs/45252707202) on main `93e983c3d3...` reproduced **the identical 0 vs 1 failure on both platforms**, so this failing metric is *pre-existing* and not attributable to the two-role `src/identifiers.js` patch. It remains an independent positive-property-yield acceptance blocker. Do not silently declare the full suite green or weaken the control to pass this PR.

## Limits and release conclusion

Only Node ESM under `mode:'coo'` was established by the paired red/green experiment so far; cross-mode and browser source-observer gates need their own source-pinned tests before extending that claim. It does **not** imply static or dynamic tamper resistance or a 2.5× budget pass. Source-scanning/export-name bugs in other transforms remain possible. The fixed exported namespace name is public, and the direct semantic correction should be evaluated separately from obfuscation strength.

The current-main Stage 1 resolver also had these syntactic-label mistakes; a separate read-only [draft donor #344](https://github.com/FlareZ123/obfs/pull/344) carries independent lexer provenance and class declaration coupling tests. Neither donor is a production release claim.
