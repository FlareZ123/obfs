# Dense plain-data cbor-x nested path identity: 32-record runtime veto

**Agent 6, 19 November 2026. Classification: intermediate negative transport evidence.**

## Context

The original path-identity preregistration failed before timing because it
required sparse/descriptor/prototype semantics that exact cbor-x does not
preserve. That semantic veto is recorded in
[`im-results/sco-cborx-path-identity-v1-veto-2026-11-19.md`](sco-cborx-path-identity-v1-veto-2026-11-19.md).

The corrected preregistration
[`workplace/sco-cborx-path-identity-dense-prereg-2026-11-19.md`](../workplace/sco-cborx-path-identity-dense-prereg-2026-11-19.md)
narrows the experiment to an explicit dense plain-data schema.

Implementation:
[`sims/sco-cborx-path-identity-pilot.js`](../sims/sco-cborx-path-identity-pilot.js).

GitHub Actions run **44449897921** checked out exact source
`afc3023277daa1fba9b1256d43481f128c207332` and passed strict JSDoc plus
the narrowed semantic probe on both platforms:

- Windows job **135310996311**;
- Ubuntu job **135310996841**.

## Narrow semantic result

Both platforms observed:

- exact root identity;
- exact nested `records[0]` identity;
- exact shared nested alias identity;
- request cycle;
- own `undefined`;
- `NaN`;
- signed zero;
- large `BigInt`;
- an independent new value response remained independent.

These observations apply only to the explicit dense plain-data contract. They
do not reverse the previously established cbor-x descriptor/prototype/sparse
boundaries.

## Paired process CPU

Each sample executed **4,096 calls**, with 12 balanced-order retained pairs.
The task read one or 32 records, performed 25,000 integer-mixing rounds, and
returned the first nested record object.

| Records | OS | path identity / native | paired upper bound | strict >2.5x | cbor value / native | root-token fallback / native |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | Ubuntu | **1.24356x** | 1.26639x | **0/12** | 1.13113x | 1.14257x |
| 32 | Ubuntu | **3.23422x** | 3.24749x | **12/12** | 1.81779x | 1.79310x |
| 1 | Windows | **1.15825x** | 1.32624x | **0/12** | 1.05051x | 1.05051x |
| 32 | Windows | **3.32624x** | 3.32624x | **12/12** | 1.66312x | 1.77305x |

The path-index arm therefore fails the frozen 2.5x rule at 32 records on both
operating systems.

Raw native/path CPU microseconds:

### Ubuntu, one record
- native: `[133160,128257,127362,127245,127365,127332,127311,127319,127552,127274,127317,127283]`
- path: `[182671,165232,157432,158515,158417,161252,158200,158911,158257,156655,157713,158060]`

### Ubuntu, 32 records
- native: `[131428,127712,127795,133638,129783,127604,127670,127894,128700,127648,127696,127603]`
- path: `[452160,414743,413103,431708,411604,414942,413114,411992,404612,414386,413251,411118]`

### Windows, one record
- native: `[141000,157000,156000,156000,141000,141000,125000,156000,141000,156000,156000,141000]`
- path: `[203000,156000,172000,172000,172000,187000,187000,172000,172000,172000,172000,172000]`

### Windows, 32 records
- native: `[141000,141000,141000,156000,141000,141000,140000,156000,141000,141000,156000,140000]`
- path: `[484000,469000,453000,469000,469000,437000,469000,469000,453000,469000,454000,453000]`

The complete control arrays remain in the source-pinned Actions log.

## Interpretation

The response token itself is cheap. The recurring cost comes from traversing
and indexing the entire decoded request graph on every call. The 32-record path
arm is roughly 1.78-2.00x the ordinary cbor value-response arm before comparing
either against native work.

The exact full-index architecture is therefore **rejected** for the 32-record
workload.

A distinct compile-time metadata architecture remains plausible for functions
whose exact returned input path can be statically established. Such a design
would avoid runtime whole-graph indexing and should be evaluated separately
rather than counted as an optimization of this failed candidate.

Production SCO remains unchanged and the repository remains
**RELEASE-BLOCKED**.
