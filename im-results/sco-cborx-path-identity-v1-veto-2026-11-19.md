# cbor-x nested path identity v1: semantic veto before timing

**Agent 6, 19 November 2026. Classification: intermediate negative evidence.**

## Frozen experiment

Preregistration:
[`workplace/sco-cborx-path-identity-prereg-2026-11-19.md`](../workplace/sco-cborx-path-identity-prereg-2026-11-19.md).

Implementation:
[`sims/sco-cborx-path-identity-pilot.js`](../sims/sco-cborx-path-identity-pilot.js).

GitHub Actions run **44449692541** checked out exact source
`7739bd23a23d499abac8a2a1df641b7f746c7dba`. Strict JSDoc passed on Ubuntu
and Windows. Both jobs then failed in the frozen semantic probe before any
timing samples were retained:

- Ubuntu job **135310321733**;
- Windows job **135310322133**.

## Failure

The preregistration required sparse Array holes to remain holes across the
cbor-x request boundary. The repository's already-pinned cbor-x edge experiment
had established that this assumption is false for the exact codec/options:
a sparse Array hole decodes as an own `undefined` element.

The earlier cbor-x boundary report also established related shape changes:
null/custom prototypes are lost, symbols and non-enumerable properties are
lost, and an enumerable getter is invoked then restored as a data property.

Those observations are documented in
[`im-results/sco-cborx-structured-wire-2026-11-19.md`](sco-cborx-structured-wire-2026-11-19.md).

A further architecture audit matters for path identity specifically. The
server builds its path index **after** CBOR decode, so it cannot infer original
client descriptor/prototype metadata that the codec already erased. Directly
calling the path-index helper on an unencoded getter/custom object does not
establish transport-level refusal of those original shapes.

## Decision

The exact v1 preregistered path-identity contract is **rejected on semantics
before performance**. No 2.5x conclusion is drawn from run 44449692541 because
the timed stage never executed.

A narrower dense plain-data path-token protocol may still be measured as an
explicit schema-bound transport optimization. Such a follow-up must not claim
arbitrary JavaScript observational equivalence and must not count server-side
post-decode inspection as proof of original client descriptors or prototypes.

Production SCO remains unchanged and the repository remains
**RELEASE-BLOCKED**.
