# Proven imported identity through a local immutable alias (21 November 2026)

## Scope and claim

This is a **bounded semantic-coverage extension** to the experimental
`closedWorld:true` ESM field renamer. A pure identity helper already
proven through the existing cross-file signature analysis can be assigned
directly to a unique top-level immutable `const` and invoked directly
on a proved record. The compiler now tracks the return alias and can
consistently rename private fields across the importing module.

No arbitrary higher-order JavaScript, source secrecy, hostile-runtime
integrity, or universal 2.5× compute bound is implied. The declared
closed-world host/loader assumptions in
[`docs/CLOSED_WORLD_PROPERTY_PROOF.md`](../docs/CLOSED_WORLD_PROPERTY_PROOF.md)
remain essential.

## Before / after grammar

Existing cross-module direct-call proof already accepted:

```js
// state.mjs
export const state={secretField:17,otherField:5};
// identity.mjs
export function identity(x){return x;}
// entry.mjs
import {state} from './state.mjs';
import {identity} from './identity.mjs';
const result=identity(state);
console.log(result.secretField);
```

The new grammar additionally accepts a single immutable local relay:

```js
// entry.mjs
import {state} from './state.mjs';
import {identity} from './identity.mjs';
const forward=identity;
const result=forward(state);
console.log(JSON.stringify([result.secretField,result.otherField]));
```

The proof also handles a directly imported immutable exported arrow
(`export const identity=x=>x`) and two distinct top-level immutable aliases
of the same proven imported identity, including mixed direct calls.

The transformation is **only** admitted when the complete existing
object-owner proof establishes that the relevant object fields are
private, the imported identity is a uniquely bound stable pure one-parameter
identity, and the alias is a directly initialized, uniquely bound
top-level immutable local `const`. All other identifier uses remain
subject to the pre-existing function-value escape and scope analysis.
The import origin and relay may only appear in supported direct calls.
No arbitrary member-call adapters, accessors or new functions are summarized.

## Immutable red/green reproduction

**Pre-change red:** [manual proof run 44944368263](https://github.com/FlareZ123/obfs/actions/runs/44944368263)
at commit `a7f5fe14ce378d9d69a73f6beaceaa8aa269d1cc` on
Ubuntu/Windows Node 22.23.4. Both OS produced **22 passes / 3 expected
positive-yield failures** in 25 targeted tests; strict core and test JSDoc
checks passed. The three positives had zero actual protected field
rewrites (`0 !== 2`), rather than original/emitted behavioral mismatches.
All six independently authored unsafe-relay negatives already retained
the original spelling.

**Post-change green:** [manual proof run 44944530186](https://github.com/FlareZ123/obfs/actions/runs/44944530186)
at source commit `b1080f2e209d5cace472628a9202beb471315a25`,
with both Ubuntu and Windows jobs successful, **26/26 tests passing**
per OS and zero skipped/failed. The post-change suite includes the
original 17 cross-file identity cases and nine additional cases in
`test/cross-file-imported-identity-alias.test.js`, with:

- Three nonvacuous positive fixtures (each **2/2 fields actually
  renamed**, **1/1 candidate object**, and exact original/transformed
  native Node ESM output equality).
- Six refusal fixtures with zero renames and exact output parity:
  mutable local relay, exported function value, arbitrary higher-order
  consumption, function `.toString()` observation, `Object.keys`
  reflection, native `.call` invocation adapter.
- Additional negative for an imported helper escaping through an opaque
  object holder in `test/cross-file-identity-return.test.js`.

Reproduce locally:

```text
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npx tsc -p jsconfig.cross-identity.json
node --test test/cross-file-identity-return.test.js test/cross-file-imported-identity-alias.test.js
```

The exact main commit includes the changes in
`src/properties.js` and the two targeted test files. The
manual workflow `.github/workflows/manual-imported-identity-alias.yml`
pins the same steps on Ubuntu and Windows. Full-suite release gating
and independent hostile-browser scenarios remain separate evidence
obligations.

## Proof mechanism and limitations

`proveLocalObject` already receives `importedIdentityFunctions`
verified against the declared ESM graph by `src/cross-properties.js`.
The extension examines top-level `const` declarators whose initializer
is an identifier with an existing proved pure identity signature.
It adds the new local alias as an external, argument-zero forwarding
summary, while recording the exact initializer association.
The existing use scanner grants one narrow initialization read from
the imported helper and continues rejecting every other unsupported
function-value reference. Root aliases and returned object fields
still undergo all the original source-observation, reflection,
escape, duplicate binding and field-ownership checks.

This is a conservative syntactic proof, and it cannot establish the
behavior of unknown host consumers or runtime mutations of global
intrinsics, loaders, Proxies or callbacks. A public obfuscated
property name remains statically or dynamically recoverable in the
COO threat model, as the already published own-key attacker
baselines demonstrate. Treat the additional protected-work yield
as usability progress, with **no established anti-analyst advantage**.

**Primary strong-obfuscation release status remains RELEASE-BLOCKED.**
