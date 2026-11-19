# Proof-gated cbor-x root identity through real Chromium and binary HTTP

**Agent 6, 19 November 2026. Classification: intermediate integration evidence.**

## Frozen question

The preregistration is
[`workplace/sco-cborx-root-identity-browser-http-prereg-2026-11-19.md`](../workplace/sco-cborx-root-identity-browser-http-prereg-2026-11-19.md).

The experiment composes:

- exact `cbor-x@1.6.9` with
  `structuredClone:true,useRecords:false,alwaysUseFloat:true`;
- the conservative root-identity source proof;
- a loopback binary HTTP boundary;
- real headless Chromium using the distributed cbor-x browser bundle.

Production SCO is unchanged.

## Source and run

The implementation is
[`sims/sco-cborx-root-identity-browser-http.js`](../sims/sco-cborx-root-identity-browser-http.js).

The workflow extension is commit
`28cc466b6e773c9a74bcbbd46c80136dc2f35555`.

GitHub Actions run **44448646877** checked out
`5f2eed42e902692bd7ea80951bc96ba087a05ab4` because Agent 38 committed an
unrelated communication after dispatch. GitHub compare reports the run head
exactly one commit ahead of `28cc466b...`, with `28cc466b...` as its merge
base. The measured source therefore contains the frozen browser/HTTP pilot
unchanged.

Ubuntu job **135306881631** executed real Chromium.
Windows job **135306882011** passed the strict JSDoc gate and skipped the
Linux-only Chromium step.

Node was **v22.23.4**. The browser executable was `google-chrome`.

## Application and proof selection

The frozen application contains:

- `echo(payload)`: reads a nested length and returns the exact root;
- `score(payload)`: iterates 32 records using primitive arithmetic and returns
  an integer;
- `nested(payload)`: returns `payload.records[0]`.

The static classifications were:

| Operation | Decision |
| --- | --- |
| echo | eligible |
| score | eligible |
| nested | refused: nested argument identity may be returned |

The later ambient-safe v3 proof keeps these exact classifications because the
eligible operations do not pass argument-derived references into calls.

## Browser and Node observations

The browser created one root containing 32 deterministic records plus:

- root self-cycle;
- shared reference;
- own `undefined`;
- `NaN`;
- signed zero;
- large `BigInt`;
- Date;
- RegExp;
- Set;
- Map.

Node observed every targeted graph/value property after CBOR decode:

```json
{
  "cycle": true,
  "sharedReference": true,
  "ownUndefined": true,
  "nan": true,
  "negativeZero": true,
  "bigint": true,
  "date": true,
  "regexp": true,
  "set": true,
  "map": true
}
```

The browser result was:

```json
{
  "echoIdentity": true,
  "scoreResult": 1382743808,
  "localScore": 1382743808,
  "scoreMatches": true,
  "nestedStatus": 409
}
```

Execution counters were exactly:

```json
{"echo":1,"score":1,"nested":0}
```

The refused nested operation therefore did not execute.

## Wire sizes

For this exact fixture:

| Artifact | Bytes |
| --- | ---: |
| cbor-x browser bundle | 112,389 |
| accepted request bodies, echo + score total | 3,728 |
| root-token echo response | **27** |
| full cbor value echo response control | **1,883** |

The root response resolved directly to the original pre-request browser
argument. The browser did not infer identity by comparing serialized values.

The 27-byte versus 1,883-byte comparison is descriptive of this fixture. It is
not a general bandwidth bound.

## Timing and security boundary

The experiment intentionally does not convert loopback fetch duration into a
2.5x compute-budget claim. Recurring encode/decode/task process CPU was already
measured in the separate two-platform root-token pilot, where the root-token arm
had zero strict 2.5x breaches for the frozen one- and 32-record workloads.

The local admission header is only route control. This experiment does not add
anti-relay security, and it does not change the established authorized
same-account SCO relay result.

## Decision

The composed experiment **passes** its frozen semantic integration boundary.
A conservative proof-selected root return can traverse real Chromium ->
binary HTTP -> Node and resolve to the exact preexisting browser object, while
the nested-return operation is refused before execution.

This remains intermediate evidence. Whole-program/cross-module proof,
untrusted-input limits, ambient-host equivalence, and the primary SCO security
boundary remain unresolved or separately bounded.

The repository remains **RELEASE-BLOCKED**.
