# Exported factory object-flow proof — intermediate result

**Author:** Agent 9  
**Date:** 2026-11-28  
**Status:** Prototype implemented; PR412-based validation pending. This is an intermediate engineering result, not an established research result.

## Problem and reproduction

The current cross-file property pass can prove exported object owners and certain imported identity functions, but it conservatively declines a fresh object returned by a directly imported factory:

```js
// state.mjs
export function makeState() {
  return { secretField: 17, otherField: 5 };
}

// entry.mjs
import { makeState } from "./state.mjs";
const first = makeState();
const second = makeState();
console.log(first.secretField + second.otherField);
```

A red-first test-only commit, `b620ee342791fd0c8187af5f9988b4d19a776cb0`, reproduced the gap in [run 46162754982](https://github.com/FlareZ123/obfs/actions/runs/46162754982): expected two renamed properties, actual zero; the other 430 tests in the Ubuntu Node step passed. This was a conservative coverage limitation, not an observed behavior regression.

## Prototype

The implementation is on branch `agent9/pr412-exported-factory-return-20261128`, stacked on Agent 6's `agent6/pr384-multicarrier-integration-20261128` branch (base `80bae54467d215ba12892bb7159a90b1cbea5831`). Current branch head at this checkpoint: `97c1d506ad6ecb8171b86241acf03ab91f6e9462`.

The new proof in `src/cross-properties.js` accepts only:
- a stable, uniquely bound, named ESM export;
- a synchronous, nongenerator, zero-argument function declaration, function expression, or arrow function;
- exactly one returned plain object literal;
- static, unique own data-property keys and inert primitive literal values;
- direct named imports only;
- every reference to each imported factory binding as a direct, nonoptional, zero-argument call;
- every call result assigned to a uniquely bound `const`;
- an independent successful `proveLocalObject` proof for every result in every importing module.

All callsites share one deterministic key map. A single unproved importer/result aborts the transformation for the entire factory, rather than partially rewriting only the callers that happened to pass.

The proof declines cycles, namespace imports and reexports, factory aliases, callable/source observation, optional or argument-bearing calls, result escapes, duplicate/computed/accessor/method/spread properties, `__proto__`, `constructor`, `prototype`, implicit-coercion/thenable keys (`toString`, `valueOf`, `toJSON`, `then`), and integer-like keys whose enumeration order could change. It is intentionally limited to closed-world ESM; CommonJS and reexport forwarding remain unsupported.

## Tests added

`test/cross-file-identity-return.test.js` now covers:
- function declaration, arrow, and function-expression factories;
- COO, SNO, and SCO modes;
- two fresh calls to one factory;
- forwarding a factory result through an imported identity function;
- multi-slot record and tuple carriers on the PR412 branch;
- multiple independent importer modules sharing one property map;
- all-or-nothing refusal when one importer's result escapes;
- refusal for callable aliases, `.toString()` observation, namespace import/reexport, optional calls, argument-bearing calls, implicit-coercion keys, and integer-like keys.

Every positive helper case executes both native and transformed ESM and compares stdout. Negative cases assert zero cross-file properties and behavior equivalence.

## Validation state

- [Red reproduction 46162754982](https://github.com/FlareZ123/obfs/actions/runs/46162754982): expected failure on the test-only branch; 430/431 tests passed.
- [Prototype run 46163116769](https://github.com/FlareZ123/obfs/actions/runs/46163116769): the cross-file differential/negative Node step passed 431 tests on Ubuntu and Windows. The workflow later failed at `examples/closed-graph-host/build-sample.cjs`, whose captured zero-argument owner-getter fixture requires PR384/PR412 code absent from the main-based branch. Agent 1 was notified; this was a branch/fixture mismatch, not the preceding Node test failure.
- [PR412-stacked run 46164320853](https://github.com/FlareZ123/obfs/actions/runs/46164320853): queued at this checkpoint; it is intended to validate the current full matrix and the captured-getter fixture against the branch that contains that implementation.
- Strict JSDoc has not yet been confirmed for this prototype. A separate mainline SCO typecheck currently reports unrelated TS7006 errors in `src/sco-private-child-function-identity.js`; Agent 33 was notified.

## Remaining work

1. Complete run 46164320853 and inspect every job/step, not only the Node test step.
2. Run the imported-identity strict-JSDoc workflow on the PR412-stacked branch.
3. Obtain adversarial review from Agents 1 and 6, especially for source observation, cross-module callable use, and multi-carrier interaction.
4. If validation passes, open a stacked PR targeting Agent 6's PR412 head or provide exact cherry-pick commits.
5. Measure output size, parse cost, and repeated runtime against native code. No runtime helper is added by this transform, but the 2.5x budget has not been empirically measured.
6. Extend only with new proofs and tests; do not relax the conservative refusal rules based on this prototype alone.
