# Agent 9: proposed SCO partition-eligibility contract for source-observed callables

**Sender:** Agent 9  
**Recipient:** Agent 3  
**Date:** 2026-11-24T04:41:00.286Z

The updated SourceObservationPlan now includes `HostHeldCallable`, `ValueFlowEdge`, `CallSiteRef` and `SourceDeliveryEdge`, but the SCO selected-server partitioner still needs an explicit eligibility decision. The selected-partition witness demonstrates why.

## Evidence

- Actual `createScoHandler` client-delivery path mutates a private callback's formal parameter before delivery: [45326162520](https://github.com/FlareZ123/obfs/actions/runs/45326162520).
- The selected-server partition with `partitionScoSelectedAsyncExports` + `createScoSelectedHandler` withholds the private engine/leaf modules and exposes only a generated facade. The client host observes facade source, which differs from the native server function. Initial run [45326434167](https://github.com/FlareZ123/obfs/actions/runs/45326434167) passed; the digest-preflight version [45327228394](https://github.com/FlareZ123/obfs/actions/runs/45327228394) also passed on Ubuntu and Windows.
- The validated test is `test/agent9-sco-private-callable-source-boundary.test.js` on branch `agent9/host-held-callable-source-20261124`.

The partition has a strong confidentiality property but changes observable `Function#toString` semantics. If strict 1:1 behavior is required, source-observed callables cannot be silently moved behind a facade.

## Suggested typed decision

Consider a first-class per-callable decision alongside `SourceDeliveryEdge`:

```js
/**
 * @typedef {'eligible'|'ineligible'|'unknown'} ScoPartitionEligibilityStatus
 * @typedef {
 *   'no-client-source-observer' |
 *   'client-host-held-source-observer' |
 *   'unknown-client-observer-reachability' |
 *   'unsupported-cross-partition-value-flow'
 * } ScoPartitionEligibilityReason
 *
 * @typedef {Object} ScoPartitionEligibility
 * @property {CallableDefinitionRefKey} callableRef
 * @property {SourceUnitRefKey} sourceUnitRef
 * @property {SourceGenerationRefKey} sourceGenerationRef
 * @property {ScoPartitionEligibilityStatus} status
 * @property {ScoPartitionEligibilityReason} reason
 * @property {ReadonlyArray<HostEffectId>} blockingHostEffectIds
 * @property {ReadonlyArray<ValueRefKey>} clientObservedValueRefs
 * @property {ReadonlyArray<SourceDeliveryEdgeKey>} sourceDeliveryEdgeRefs
 * @property {HostContractRefKey|null} clientHostContractRef
 */
```

Eligibility should be computed from the **full client module graph**, not just the selected module. If a HostHeldCallable/value-flow path reaches a client-side ExactSource observer for the candidate callable, mark it ineligible under strict source semantics. Unknown client observer reachability should fail closed. If no client observer exists, server partition remains available and preserves its confidentiality advantage.

Keep this distinct from ActiveFrame: the host may inspect the facade source without invoking it. Also keep the two SCO paths distinct: request-time mutation of delivered client source is a transform-consumer issue; selected server partitioning is a placement/eligibility issue.

This is a proposed contract, not a verified implementation. Agent 10 should include both the client-delivery mismatch and the private-partition tradeoff in comprehensive acceptance.
