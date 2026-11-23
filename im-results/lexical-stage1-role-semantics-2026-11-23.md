# Stage 1 lexical binding and ReferenceRole admission: follow-up donors (23 November 2026)

**Status:** Native Node runtime and AST-level intermediate findings, validated on source-pinned Ubuntu/Windows Node 22.23.4 focused runs. This is **read-only** research; production `obfuscateFiles` does not use the Stage 1 resolver. These are not a claim of tamper resistance, property-renaming yield, or release-readiness.

**Prior related mainline adoption:** Agent 1 independently ported Agent 6's simple-catch/hoisted-var alias fix and test into canonical main, at `a059b65dcc258112e5d1e522f5b1b287ef0b7513`. This report only concerns the additional **unported** lexical role and class-declaration differences.

## 1. Named class declaration has two semantic name bindings

Native Node source:

```js
function probe(){
  class window { static own(){ return window; } }
  const original=window;
  window='changed';
  return [original.own()===original,window];
}
```

returns `[true,'changed']`. A write to `window` **inside** the class body throws `TypeError: Assignment to constant variable.`, while an outer `window='changed'` succeeds. A named class *expression* has its own explicitly spelled `class window` name already separately tracked by the resolver; a named class *declaration* has only one syntactic name token while creating an outer mutable binding plus a hidden immutable class self-binding.

The Stage 1 prototype on main previously assigned the same non-null outer BindingId to both class-body self-references and mutable outer references. This conflates two semantic bindings. A source rewrite would additionally need to preserve their coupled *spelling* because a class declaration's single identifier names both. The refined proposal creates a distinct inner `class-name` BindingId (without inventing a second source declaration node) and exposes a `classSpellingCouplings` record containing the one name-token span and its two linked BindingIds. The existing `local` classification stays intact for the class body, preserving the independent 150-pair Acorn/TypeScript classifier expectation. **A future name rewrite must treat each linked pair as an indivisible spelling group**; the link metadata itself does not implement or authorize a rename. Regression: `test/lexical-class-declaration-inner-binding.test.js`.

Evidence: [RED before patch 45247349941](https://github.com/FlareZ123/obfs/actions/runs/45247349941) at `308e17e`. The first conservative-unknown experiment passed its focused class cases at [45247360148](https://github.com/FlareZ123/obfs/actions/runs/45247360148), but **failed** the existing Acorn/TypeScript acceptance `named-class-method` because that oracle expects `local` ([45248358660](https://github.com/FlareZ123/obfs/actions/runs/45248358660)). The refined linked BindingId proposal addresses the acceptance issue without equating the two identities; its final CI receipts must be inspected separately. Cases include computed class method keys, class extends, static fields, static blocks, immutable inner writes, and class-expression independent bindings.

## 2. ESM module export and import-attribute labels are not reads

Acorn represents `export * as window from './dep.mjs'` as `ExportAllDeclaration.exported: Identifier`, but this declares an *external export name*, not a read of a local variable `window` and not an ambient host-root reference. A module may independently read global `window`, and the two occurrences should be classified differently. Native Node ESM verifies `export * as window from ...; export const observation=window;` exports a module namespace as `window` but `observation` reflects the ambient global value.

Similarly, `import data from './payload.json' with {type:'json'}` and export-attribute clauses represent `ImportAttribute.key` as Identifier syntax. It is an attribute key, not a lexical read. For static admission, exclude both `ExportAllDeclaration.exported` and `ImportAttribute.key` from the reference set. Regression: `test/lexical-export-namespace-label.test.js`.

Evidence: [RED 45246009351](https://github.com/FlareZ123/obfs/actions/runs/45246009351) at `da3cf48` and [GREEN 45246019611](https://github.com/FlareZ123/obfs/actions/runs/45246019611) at `8d1fcb`, both platforms.

## 3. Direct `delete name` mutates the environment reference

In sloppy script/CommonJS, `delete window` can remove a configurable global property; it is not a passive read. The prototype previously assigned `ReferenceRole='read'` for a direct unary delete identifier. The patch assigns `write` for direct `delete Identifier` but preserves read/computed-key semantics for `delete obj[window]` and `delete (0,window)`. Native Node test verifies `delete window` removes the configured own global property. Regression: `test/lexical-delete-binding-role.test.js`.

Evidence: [RED 45246316055](https://github.com/FlareZ123/obfs/actions/runs/45246316055) at `4b8e3ef` and [GREEN 45246324050](https://github.com/FlareZ123/obfs/actions/runs/45246324050) at `99c074b`, both platforms.

## 4. Bounded independent runtime classifier grid

`test/lexical-runtime-owner-grid.test.js` generates 20 declaration shapes × 7 wrapper forms × 4 placements = **560** native JavaScript/CommonJS tests with actual host `globalThis.window`. It compares the host-root occurrence's Acorn/Stage 1 classification to the observed Node value. At source `a4d85574fcd331f6385d4f64b3b9e8bbc90c08f9`, [Ubuntu and Windows workflow 45248032750](https://github.com/FlareZ123/obfs/actions/runs/45248032750) passed with **104 classified local, 427 host candidates, 29 conservative unknown, 0 contradictions**. This is a bounded behavioral sanity check, not a proof of full language coverage.

An earlier run `45247750218` failed from a **test-fixture syntax omission** (unterminated `const window=class window {}` initializer), corrected in the passing source. Do not misclassify that test authoring error as an independent engine defect.

## Current-main-based donor acceptance, exact source pins

At `58764620f2e31327d0a6a5a88556304176275c52`, the four new focused suites all passed **Ubuntu and Windows Node 22.23.4**, along with strict project/external JSDoc (including all four new test files):
- ESM export and attribute labels: [45248315428](https://github.com/FlareZ123/obfs/actions/runs/45248315428), **5/5**.
- Direct delete role: [45248324772](https://github.com/FlareZ123/obfs/actions/runs/45248324772), **4/4**.
- Native owner-host grid: [45248341367](https://github.com/FlareZ123/obfs/actions/runs/45248341367), **560 native executions**, one test group, counts unchanged.
- Initial class suite: [45248332265](https://github.com/FlareZ123/obfs/actions/runs/45248332265), **5/5** under conservative-unknown class semantics. This green is *not* a final class acceptance because the independent Acorn/TypeScript suite failed class-local classification.

The revised `classSpellingCouplings` local-ID implementation passed the existing 150-paired TypeScript/Acorn oracle on Ubuntu and Windows [45248993390](https://github.com/FlareZ123/obfs/actions/runs/45248993390) and **10/10** existing resolver test groups [45249001951](https://github.com/FlareZ123/obfs/actions/runs/45249001951), both at `291eb5fd85fa7fab6a628c46f5defd35150f232b`. The final expanded **6/6** class self-binding, mutable/immutable distinction, and explicit same-token coupling test suite plus strict JSDoc passed both platforms [45249514402](https://github.com/FlareZ123/obfs/actions/runs/45249514402) at `96f4fb470630e0092f1e74562a4eda6962455519`.

Thus *these specific read-only Stage 1 tests* are green. The general production compiler, source-observer, threat-model and 2.5× runtime-budget release gates were **not** asserted or satisfied by this research.

## Coordination and release stopline

This four-part follow-up is placed on an independently current-main-based *donor branch*, `agent6/stage1-role-semantics-20261123`, to avoid duplicate integration of Agent 1's already-mainline catch/var correction. It modifies only the read-only `workplace/agent1-lexical-reference-resolver.js`, four test files, and explicit `jsconfig.external.json` test scope. The existing Stage 1 test suite, Acorn/TypeScript paired reference checks and strict JSDoc should be rerun on the exact donor commit before adoption. No current-main production compiler files were changed; the primary security and 2.5× runtime-budget release gates remain open.
