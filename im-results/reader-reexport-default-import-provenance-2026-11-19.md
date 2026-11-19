# Default-imported reader relay provenance gap

**Date:** 2026-11-19  
**Agent:** 50  
**Status:** reproduced semantic-safety defect with a bounded repair; current branch validation continues for extra negative coverage.

## Finding

The named ESM reader re-export proof propagated a reader summary through an explicit source re-export such as:

```js
export {peek as inspect, peek as default} from './state.mjs';
```

The importer verifier recognized only `ImportSpecifier` bindings. A consumer could therefore use the named alias on the proved owner while separately default-importing the same rewritten reader and calling it on a foreign object:

```js
import {state} from './state.mjs';
import hidden, {inspect} from './relay.mjs';

console.log(inspect(state), hidden({secretField: 99}));
```

The safe named call was sufficient to authorize the owner rewrite. Before the repair, the generated artifact rewrote both `state.secretField` and the body of `peek` to `_pb9a14d0b085b`, while the foreign literal retained `secretField`. The default-imported call therefore no longer had the original property contract.

## Reproduction

Pre-fix branch commit `a9aadd1bdfd99fb639752cea2e681dbf3398ed4d` added the default-import foreign-owner regression. Manual cross-reader run **44451065229** failed on Ubuntu and Windows. The Ubuntu failure showed the transformed owner and reader body while the foreign object was unchanged, and reported one rewrite where the test required zero.

A preceding namespace-import hypothesis was falsified. Commit `75241057020df5d685fa85e78d6e49ca53f278b5`, run **44450928700**, passed on both operating systems. Existing conservative source/graph handling already closes that form.

## Repair

The repair has two parts in `src/cross-properties.js`:

1. Treat `ImportDefaultSpecifier` as a candidate reader alias with public name `default`.
2. Ignore that import declaration identifier itself when validating uses of the reader alias, exactly as already done for `ImportSpecifier`.

This keeps the proof precise. A default relayed reader used only on the proved owner remains eligible for a property rewrite, while a default alias used on a foreign owner invalidates the candidate.

Commits:

- `e4c7d9c1ed80af38b82aa930b4a70025c584037f`: track default-imported reader relays.
- `0ddb4a8903e85e308779598133239a814adbb8ba`: admit the default import declaration node itself as a non-use.
- `ddad3ab2a661917b755539f1a76106af21c7c8fa`: positive safe-default relay regression.

Full manual cross-reader run **44451401585** at `0ddb4a8903e85e308779598133239a814adbb8ba` passed on Ubuntu and Windows, including the cross-file differential suite, Chromium lanes and both JSDoc checks.

## Additional adversarial coverage

A second hypothesis used a namespace import of a relayed reader. It was already blocked by existing conservative logic and is retained as a regression.

A later `export * as namespace` relay hypothesis is also being checked on branch commit `8151d11ca0c912e490b101ba044f04b811a16f73`. Its focused cross-file suite has already passed on Ubuntu, suggesting this form is likewise already conservatively closed; the complete run is tracked as **44451517830**.

## Scope

This result is a semantic-correctness repair for the closed-world cross-file property proof. It does not establish stronger resistance to reconstruction or runtime extraction, and it does not change the repository-wide release status.
