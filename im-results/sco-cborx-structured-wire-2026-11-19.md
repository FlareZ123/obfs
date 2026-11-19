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


## Signed-zero follow-up: `alwaysUseFloat:true`

Commit `4196b2661ff953b5da8344d360090c1c902e0c70` froze the follow-up before execution. It retained cbor-x 1.6.9, structured-clone reference tracking and `useRecords:false`, adding only `alwaysUseFloat:true`. The performance arm increased the heavy sample from 32 calls to **4,096 calls**, with 12 balanced-order samples, specifically to move Windows process CPU above the prior 15–16 ms clock quantum.

Actions run **44425747648** passed on Node 22 Ubuntu and Windows. The float arm preserved every targeted observation on both systems, including `Object.is(decoded.negativeZero,-0)`. Every Windows native CPU sample was positive.

| Records | Ubuntu float/native max paired ratio | Windows float/native max paired ratio | Strict >2.5 pairs |
| ---: | ---: | ---: | ---: |
| 1 | 1.1115x | 1.1468x | 0/12 on each OS |
| 32 | 1.9557x | 1.7248x | 0/12 on each OS |

The one-record wire was 104 JSON bytes, 84 default-CBOR bytes and 96 float-CBOR bytes. At 32 records the values were 1,774, 1,307 and 1,683 bytes respectively.

This satisfied the preregistered in-process gate for the two coarse-work cases. It did not establish browser behavior, HTTP semantics or production suitability.

## Real Chromium and binary HTTP reproduction

The next experiment was frozen in `workplace/sco-cborx-browser-http-prereg-2026-11-19.md`. It loads the exact installed cbor-x 1.6.9 standalone `dist/index.js` browser bundle, measures the previously admitted heavy cases in a real Chromium page, and performs one actual loopback binary HTTP roundtrip through a Node decoder/encoder.

The first two executions produced valid runtime observations but exposed research-harness JSDoc errors. After type-only repairs, Actions run **44426860842**, evidence commit `55007bc118e28c23ee38c58734e819a2caa2565a`, completed fully green under Chrome 157 and strict JSDoc.

The browser float codec preserved cycles, shared references, own `undefined`, `NaN`, signed zero, `BigInt`, Date, RegExp, Set and Map. The real browser -> binary HTTP -> Node decode/encode -> browser roundtrip preserved the same full observation set.

Hot in-page results, 12 paired samples per case:

| Records | float/native ratio of medians | paired-median upper bound | observed pairs within 2.5x |
| ---: | ---: | ---: | ---: |
| 1 | **1.0572x** | **1.0707x** | **12/12** |
| 32 | **1.6824x** | **1.7125x** | **12/12** |

The 112,389-byte standalone browser bundle had a noisy cold bootstrap against a bare page. Its ratio-of-medians was 1.4476x and the paired diagnostic was labeled supported, but only 8/9 raw paired observations were within 2.5x. The preregistration already classified this bare-page cold comparison as diagnostic rather than a general application startup admission, so no universal cold-start claim is made.

HTTP timing was deliberately excluded. The browser result supports only the tested hot coarse-work lane plus semantic feasibility.

## JavaScript edge-shape and hostile-input boundary

The package source exposes count-oriented `setSizeLimits` controls and explicitly rewrites a decoded key named `__proto__` to `__proto_` to prevent prototype mutation. Commit `5ea4e4881b2ddb767b1d7e4fdd97b88e50ec602a` preregistered a direct boundary experiment before execution. Its typed rerun, Actions **44427170460** at evidence commit `a1095826cbbb4ce3495ae05462ec49bbf38725d6`, passed on Ubuntu and Windows with identical observations.

With `maxArraySize=maxMapSize=maxObjectSize=64`:

- a declared 65-element array was rejected with `Array length exceeds 64`;
- a declared 65-entry map/object was rejected with `Property count exceeds 64`;
- one-child nested arrays at depths 64, 256 and 1,024 decoded;
- depths 4,096 and 8,192 threw `RangeError: Maximum call stack size exceeded`.

The count limits therefore must not be described as a recursion-depth bound.

Several ordinary JavaScript observations also changed during an otherwise successful roundtrip:

| Source shape | Observed decoded shape |
| --- | --- |
| enumerable own data key `__proto__` | own `__proto_` instead; no global pollution |
| null-prototype object | ordinary Object prototype |
| custom prototype/inherited property | custom prototype and inherited property absent |
| enumerable symbol property | symbol property absent |
| non-enumerable own string property | property absent |
| sparse Array hole | own `undefined` element |
| enumerable getter | getter invoked once, result restored as ordinary data property |

These are protocol-contract boundaries, not reported as library bugs. They show that even the float configuration is **not** a general arbitrary-JavaScript clone.

## Current bounded decision

cbor-x 1.6.9 with `structuredClone:true,useRecords:false,alwaysUseFloat:true` is materially stronger than the prior devalue candidate for the specifically tested coarse SCO data lane: it preserved the targeted graph/value corpus in Node and real Chromium, survived a real binary HTTP semantic roundtrip, and stayed below the 2.5x repeated-work threshold in every observed hot 1- and 32-record heavy pair.

It still does not solve full JavaScript observational equivalence:

1. decoded data intentionally loses or changes several descriptors, key categories and prototypes;
2. a codec clone by itself cannot make a server-returned reference equal to a preexisting client object;
3. count limits do not prevent stack exhaustion from sufficiently deep nesting;
4. the browser bundle has nontrivial cold cost and adds a new untrusted binary-parser surface.

A production experiment would therefore need an explicit admitted data schema, independent request-byte and nesting limits, decoder-error containment, policy-view isolation equivalent to the current JSON handler, and a design for client object identity when native semantics require it. The separate JSON identity-envelope experiment investigates that last boundary without changing production.

## Reproduction additions

- signed-zero follow-up: `sims/sco-cborx-float-wire-followup.js`, run 44425747648
- Chromium + binary HTTP: `sims/sco-cborx-browser-http.js`, run 44426860842
- edge/resource boundary: `sims/sco-cborx-edge-boundary.js`, run 44427170460
