# ESM externally reachable callable source: independent parity matrix

**Date:** 22 November 2026. **Status:** native witness confirmed; compiler red/green CI pending. Research-only branch `agent48/esm-source-reachability-20261122`, latest test change `9e4a32d5eaba5b5ef412ae9aef1f8d24e43ffa35`.

## Question and trust boundary

Can the property and identifier transformations preserve the exact observable behavior of an ESM module when an external consumer, absent from the source group passed to `obfuscateFiles`, inspects an exported function's `toString()`? The existing `closedWorld:true` flag is an integrator claim of a complete relevant distribution unit. It does not establish closure with respect to unknown external runtime consumers; deployments that genuinely exclude outside observers have a narrower contract.

ECMA-262 `Function.prototype.toString` returns original source text when available. JavaScript consumers can observe ordinary exported callables via direct named imports, aliases, reexports, default exports, class methods and reachable containers. The same compiled output can preserve return values yet fail exact `toString()` parity.

## Reproduction

`test/esm-public-source-reachability.test.js` is a Node 22 differential matrix across COO/SCO/SNO, with six distinct externally reachable shapes:

1. `export {read as publicRead}` where `read()` captures a private object field.
2. An immutable arrow alias `export default read`.
3. `export class Api` with a method reading a private own field.
4. A one-hop ESM `export {read as publicRead} from './private.mjs'` relay.
5. A function held inside an exported array.
6. An aliased named export where the exposed function's parameter spelling may change.

The native and transformed groups are written into isolated temporary ESM directories using `atomicWrite`, then executed in a fresh Node subprocess with the observer module. The observer is intentionally **not** passed into the compiler. The tests log per-case native/generated source equality, runtime-value equality and actual field/binding rewrite counts. External callable source parity is mandatory. A compiler may pass by declining unsafe edits; this is a valid compatibility outcome with no corresponding protection yield. Three additional mode-specific controls require **positive local property-renaming yield** for a separate private nonescaping function and check native output.

## Independently checked native observer contract

The six original cases execute successfully on Node 22.16.0 in the local runtime. In particular, the named alias returns `function read(){return owner.secretField;}` and 11, the default arrow returns `()=>owner.secretField` and 17, the class method returns `read(){return owner.secretField;}` and 23, the ESM relay returns the named function source and 31, the array member returns the function source and 37, and the named parameter case returns `function read(secretParam){return secretParam+1;}` and 10. This verifies the *native fixture construction only*. It does not yet verify compiler behavior or the acceptance suite.

## Validation

A workflow was dispatched on the initial branch through existing `.github/workflows/manual-source-proof-triage.yml`, which runs Node 22 on Ubuntu and Windows and adds the external callable matrix after its other source-proof checks. The first version incorrectly required positive rewrites in every exported-callable case; corrected test commit `9e4a32d5eaba5b5ef412ae9aef1f8d24e43ffa35` separates behavioral parity from yield. **Only a source-pinned run at or after the correction qualifies for this contract.** Run id, platform results, and actual source transformation counts remain pending.

## Interpretation and next action

Compare the first source-pinned CI mismatch against Agent 8's independently reproduced direct ESM export-source witness. Do not infer a new defect from a zero-rewrite safe refusal. A candidate source-preservation fix needs to maintain all source-visible bytes of a reachable exported callable, including nested function segments and affected identifiers, while still offering safe rewrite yield in the unrelated private control.

This intermediate compatibility study does not demonstrate confidentiality, anti-instrumentation, environment locking, or the required universal 2.5x runtime budget. The current RELEASE-BLOCKED security decision remains unchanged.
