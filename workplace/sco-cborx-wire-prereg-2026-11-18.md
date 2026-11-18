# Preregistration: cbor-x structured graph transport pilot

**Agent 6, 18 November 2026. Status: preregistered before CI execution.**

## Hypothesis

Production SCO currently uses JSON and therefore cannot preserve cycles, shared references, own `undefined`, `NaN`, signed zero, or `BigInt`. The earlier devalue 6.0.3 pilot preserved the targeted graph semantics but had severe short-work overhead.

The current publisher documentation for **cbor-x 1.6.9** states that the package runs in modern browsers and Node, supports structured-clone reference tracking with `structuredClone:true`, and supports additional built-in types. It also states that structured reference tracking has a performance cost. This pilot asks whether that tradeoff is materially better than the prior devalue candidate.

Publisher references inspected before implementation:

- https://github.com/kriszyp/cbor-x
- https://www.npmjs.com/package/cbor-x (1.6.9, published November 2026)

## Frozen semantic checks

The pilot must preserve, in one decoded graph:

- a self-cycle;
- two references to one shared object;
- an own `undefined` property;
- `NaN`;
- `-0`;
- a 64-bit-plus `BigInt`;
- `Date`;
- `RegExp`;
- `Set`;
- `Map`.

The decoded graph must be detached from the original client objects. Bare JSON is expected to reject the cycle.

A fixed unknown CBOR tag 1000 containing integer 1 is also decoded. The publisher documents unknown tags as inert `Tag` values; the pilot requires that behavior. This is one parser-surface check, not a security audit.

## Frozen performance protocol

The compared paths are:

1. direct native task;
2. `JSON.stringify` + `JSON.parse` + task;
3. cbor-x `Encoder({structuredClone:true,useRecords:false})` encode + decode + task.

Inputs contain 1, 32, 256, or 1024 deterministic records. Each size is tested with a small state task and the same task plus 25,000 integer-mixing rounds. Each case gets nine process-CPU samples with three-way rotated order.

Repetition counts are fixed by code before observing results:

- heavy task: 32 calls per sample;
- small task: `max(200, floor(200000 / recordCount))`.

All checksums must match native. Report candidate/native, JSON/native, and candidate/JSON paired ratios, strict >2.5x pair counts, raw samples, and wire byte counts.

## Decision rule

This in-process pilot cannot establish full SCO budget compliance. It excludes HTTP, authentication, client module loading, browser parsing, network cost, and the production compiler.

A useful result requires all semantic checks to pass and a materially better recurring-cost region than the prior devalue pilot. If short work remains far above 2.5x, keep cbor-x as a selective coarse-work candidate at most. If the Node result is promising, the next step is an exact-version real Chromium and loopback HTTP experiment before any production integration.
