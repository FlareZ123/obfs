# cbor-x 1.6.9 SCO structured-wire pilot

**Date:** 2026-11-19. **Classification:** intermediate transport experiment, not a production backend or security result.

## Question and source pin

The current SCO transport uses JSON, which cannot preserve cyclic graphs, shared references, own `undefined`, `NaN`, signed zero, or `BigInt` as general JavaScript values. The prior devalue 6.0.3 experiment preserved its targeted graph semantics but incurred large recurring costs on small work.

This pilot preregistered `cbor-x@1.6.9` at source commit
`75682fb42f5a39bbef6c930a22c27a5d2b4afe89`. It used
`new Encoder({structuredClone:true,useRecords:false})`.

Publisher documentation states that structured cloning tracks cycles/references and supports types including Set, Map, RegExp and typed arrays, with reference checking carrying a performance cost. It also documents `alwaysUseFloat`, which forces all numbers, including integers, to floating-point encoding. See:
- https://www.npmjs.com/package/cbor-x
- https://github.com/kriszyp/cbor-x

## First red run and methodology amendment

Actions run **44425096950** failed on Ubuntu and Windows at the aggregate semantic assertion before timing was emitted. No performance claim is taken from that run.

Before receiving any performance result, commit
`7704d548a0097b547596b5fbb7e86d164f70d9cb` changed only the reporting behavior: it exposed each preregistered semantic boolean independently and continued through the unchanged timing protocol. The all-features acceptance rule remained unchanged. Actions run **44425356189** then completed on Node 22 Ubuntu and Windows.

## Semantic result

Both operating systems produced the same observations:

| Observation | Result |
| --- | --- |
| cycle preserved | pass |
| shared object reference preserved | pass |
| own `undefined` preserved | pass |
| `NaN` preserved | pass |
| **`-0` preserved** | **fail** |
| large `BigInt` preserved | pass |
| Date preserved | pass |
| RegExp preserved | pass |
| Set preserved | pass |
| Map preserved | pass |
| decoded graph detached from original objects | pass |
| unknown CBOR tag 1000 decoded as inert `Tag(1)` | pass |

Therefore `semanticContractMet:false` on both platforms. This exact default-number configuration is rejected as a general raw-JavaScript-value replacement for JSON.

The failure is narrower than the JSON boundary: cbor-x preserved every other preregistered feature. It is still insufficient for exact JavaScript observation because `Object.is(decoded.negativeZero,-0)` was false.

## In-process performance result

The timing boundary is encode/decode plus deterministic task CPU in one Node process. It excludes HTTP, authentication, browser/module loading, network, compiler generation and client/server process separation.

Ubuntu produced stable positive process-CPU observations. Representative paired medians for cbor-x versus direct native work were:

| Records | Workload | cbor-x/native median | strict >2.5 pairs | JSON/native median | cbor-x/JSON median |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | small state | 332.81x | 9/9 | 176.87x | 1.88x |
| 1 | +25k integer rounds | **1.0598x** | 0/9 | 1.0443x | 1.0149x |
| 32 | small state | 271.03x | 9/9 | 147.36x | 1.8392x |
| 32 | +25k integer rounds | **1.6213x** | 0/9 | 1.3524x | 1.1988x |
| 256 | small state | 304.87x | 9/9 | 164.27x | 1.8559x |
| 256 | +25k integer rounds | **6.0094x** | 9/9 | 3.7165x | 1.6170x |
| 1024 | small state | 293.05x | 9/9 | 159.56x | 1.8367x |
| 1024 | +25k integer rounds | **20.0751x** | 9/9 | 12.0684x | 1.6634x |

The CBOR bytes were smaller than the JSON bytes on the fixed tree fixtures: 84 vs 104 bytes at one record, 1,307 vs 1,774 at 32, 10,555 vs 14,309 at 256, and 43,281 vs 57,799 at 1,024.

Windows process CPU was too coarsely quantized for this preregistered repetition count. For example, the one-record heavy native samples were
`[16000,0,0,0,0,16000,0,0,0]` microseconds, while the corresponding JSON and cbor-x samples were all zero. Those ratios serialize as null and are **unresolved**, not passing evidence. The follow-up below increases repeated work before making any Windows budget claim.

## Decision at this checkpoint

The default-number cbor-x configuration is not a general exact-semantics SCO wire because it loses signed zero. It does, however, show a potentially useful coarse-work region on Ubuntu: one- and 32-record heavy calls stayed below 2.5x in all nine observed pairs, while larger payloads and small tasks did not.

A second preregistered experiment tests the publisher's `alwaysUseFloat:true` option, which may preserve signed zero by forcing numeric values through floating-point encoding. That experiment must meet the full semantic contract and obtain positive, non-quantized Windows CPU samples before any real HTTP/browser follow-up is justified.

## Reproduction

- pilot: `sims/sco-cborx-wire-pilot.js`
- preregistration and amendment: `workplace/sco-cborx-wire-prereg-2026-11-18.md`
- first red run: 44425096950
- amended evidence run: 44425356189
